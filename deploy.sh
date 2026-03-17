#!/bin/bash

# ============================================================
# Deploy slack-posthog-bot to EC2
#
# Usage:
#   bash deploy.sh <EC2_IP>
#   bash deploy.sh 16.170.208.62
#
# What this script does:
#   1. Syncs your local code to EC2 (skips node_modules, .env, .git)
#   2. Installs dependencies on EC2
#   3. Sets up PM2 to run the bot
#   4. Starts/restarts the bot
#   5. Shows the bot status and recent logs
#
# Requirements:
#   - SSH key at ~/.ssh/metrics-bot-key.pem
#   - EC2 must have Node.js and PM2 installed
# ============================================================

set -e

EC2_IP="$1"
SSH_KEY="$HOME/.ssh/metrics-bot-key.pem"
EC2_USER="ubuntu"
REMOTE_DIR="/home/ubuntu/slack-posthog-bot"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

# ─── Validation ─────────────────────────────────────────────

if [ -z "$EC2_IP" ]; then
  echo "Usage: bash deploy.sh <EC2_IP>"
  echo "Example: bash deploy.sh 16.170.208.62"
  exit 1
fi

if [ ! -f "$SSH_KEY" ]; then
  echo "ERROR: SSH key not found at $SSH_KEY"
  echo "Make sure your PEM file is at ~/.ssh/metrics-bot-key.pem"
  exit 1
fi

SSH_CMD="ssh -i $SSH_KEY -o StrictHostKeyChecking=no $EC2_USER@$EC2_IP"
SCP_CMD="scp -i $SSH_KEY -o StrictHostKeyChecking=no"

echo "========================================="
echo "  Deploying to EC2: $EC2_IP"
echo "========================================="

# ─── Step 1: Test SSH connection ────────────────────────────

echo ""
echo "[1/6] Testing SSH connection..."
$SSH_CMD "echo 'Connected to EC2!'" || {
  echo "ERROR: Cannot connect to EC2 at $EC2_IP"
  echo "Check: Is the instance running? Is the IP correct?"
  exit 1
}

# ─── Step 2: Create remote directory ────────────────────────

echo "[2/6] Setting up remote directory..."
$SSH_CMD "mkdir -p $REMOTE_DIR/src $REMOTE_DIR/logs"

# ─── Step 3: Upload files ──────────────────────────────────

echo "[3/6] Uploading code to EC2..."

# Create a list of files to upload (exclude node_modules, .env, .git, .pem)
cd "$LOCAL_DIR"

# Upload package files first
$SCP_CMD package.json package-lock.json ecosystem.config.js "$EC2_USER@$EC2_IP:$REMOTE_DIR/"

# Upload source code (recursively)
# scp doesn't have exclude, so we create a tar, send it, and extract
tar czf /tmp/slack-bot-deploy.tar.gz \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='.git' \
  --exclude='*.pem' \
  --exclude='logs' \
  -C "$LOCAL_DIR" src .env.example .gitignore

$SCP_CMD /tmp/slack-bot-deploy.tar.gz "$EC2_USER@$EC2_IP:/tmp/"
$SSH_CMD "cd $REMOTE_DIR && tar xzf /tmp/slack-bot-deploy.tar.gz && rm /tmp/slack-bot-deploy.tar.gz"
rm -f /tmp/slack-bot-deploy.tar.gz

echo "   Code uploaded!"

# ─── Step 4: Check for .env on EC2 ─────────────────────────

echo "[4/6] Checking environment variables..."
HAS_ENV=$($SSH_CMD "[ -f $REMOTE_DIR/.env ] && echo 'yes' || echo 'no'")

if [ "$HAS_ENV" = "no" ]; then
  echo ""
  echo "   ⚠️  No .env file found on EC2!"
  echo "   You need to create it. Run this command:"
  echo ""
  echo "   ssh -i ~/.ssh/metrics-bot-key.pem ubuntu@$EC2_IP"
  echo "   nano ~/slack-posthog-bot/.env"
  echo ""
  echo "   Then paste your tokens (copy from local .env.example)"
  echo "   After creating .env, run this deploy script again."
  echo ""

  # Copy .env.example to help them
  $SCP_CMD "$LOCAL_DIR/.env.example" "$EC2_USER@$EC2_IP:$REMOTE_DIR/.env.example"
  echo "   (.env.example uploaded as a template)"
  exit 1
fi
echo "   .env found on EC2!"

# ─── Step 5: Install dependencies ──────────────────────────

echo "[5/6] Installing dependencies on EC2..."
$SSH_CMD "cd $REMOTE_DIR && npm install --production" || {
  echo "ERROR: npm install failed. Is Node.js installed on EC2?"
  echo "Run: ssh -i ~/.ssh/metrics-bot-key.pem ubuntu@$EC2_IP 'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs'"
  exit 1
}

# ─── Step 6: Start/restart with PM2 ────────────────────────

echo "[6/6] Starting bot with PM2..."

# Check if PM2 is installed
$SSH_CMD "which pm2 > /dev/null 2>&1" || {
  echo "   Installing PM2..."
  $SSH_CMD "sudo npm install -g pm2"
}

# Check if bot is already running in PM2
IS_RUNNING=$($SSH_CMD "pm2 list --no-color 2>/dev/null | grep slack-posthog-bot | wc -l")

if [ "$IS_RUNNING" -gt 0 ]; then
  echo "   Restarting existing bot..."
  $SSH_CMD "cd $REMOTE_DIR && pm2 restart ecosystem.config.js"
else
  echo "   Starting bot for the first time..."
  $SSH_CMD "cd $REMOTE_DIR && pm2 start ecosystem.config.js"
  # Save PM2 process list so it auto-starts on EC2 reboot
  $SSH_CMD "pm2 save"
  $SSH_CMD "sudo env PATH=\$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu 2>/dev/null || true"
fi

# ─── Done! ──────────────────────────────────────────────────

echo ""
echo "========================================="
echo "  Deployment complete!"
echo "========================================="
echo ""

# Show status
$SSH_CMD "pm2 list --no-color 2>/dev/null"
echo ""
echo "Recent logs:"
$SSH_CMD "pm2 logs slack-posthog-bot --lines 5 --nostream --no-color 2>/dev/null"

echo ""
echo "Useful commands (run via SSH):"
echo "  pm2 logs slack-posthog-bot     — Watch live logs"
echo "  pm2 restart slack-posthog-bot  — Restart the bot"
echo "  pm2 stop slack-posthog-bot     — Stop the bot"
echo "  pm2 status                     — Check status"
