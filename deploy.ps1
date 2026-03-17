# ============================================================
# Deploy slack-posthog-bot to EC2
#
# Usage:
#   .\deploy.ps1 <EC2_IP>
#   .\deploy.ps1 16.170.208.62
# ============================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$EC2_IP
)

$SSH_KEY = "$HOME\.ssh\metrics-bot-key.pem"
$EC2_USER = "ubuntu"
$REMOTE_DIR = "/home/ubuntu/slack-posthog-bot"
$LOCAL_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

# ─── Validation ─────────────────────────────────────────────

if (-not (Test-Path $SSH_KEY)) {
    Write-Host "ERROR: SSH key not found at $SSH_KEY" -ForegroundColor Red
    exit 1
}

function Run-SSH($command) {
    ssh -i $SSH_KEY -o StrictHostKeyChecking=no "$EC2_USER@$EC2_IP" $command
}

function Run-SCP($local, $remote) {
    scp -i $SSH_KEY -o StrictHostKeyChecking=no $local "${EC2_USER}@${EC2_IP}:${remote}"
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Deploying to EC2: $EC2_IP" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# ─── Step 1: Test SSH connection ────────────────────────────

Write-Host ""
Write-Host "[1/6] Testing SSH connection..." -ForegroundColor Yellow
$result = Run-SSH "echo connected"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Cannot connect to EC2 at $EC2_IP" -ForegroundColor Red
    Write-Host "Check: Is the instance running? Is the IP correct?"
    exit 1
}
Write-Host "   Connected!" -ForegroundColor Green

# ─── Step 2: Create remote directory ────────────────────────

Write-Host "[2/6] Setting up remote directory..." -ForegroundColor Yellow
Run-SSH "mkdir -p $REMOTE_DIR/src $REMOTE_DIR/logs"
Write-Host "   Done!" -ForegroundColor Green

# ─── Step 3: Upload files ──────────────────────────────────

Write-Host "[3/6] Uploading code to EC2..." -ForegroundColor Yellow

# Upload package files
Run-SCP "$LOCAL_DIR\package.json" "$REMOTE_DIR/"
Run-SCP "$LOCAL_DIR\package-lock.json" "$REMOTE_DIR/"
Run-SCP "$LOCAL_DIR\ecosystem.config.js" "$REMOTE_DIR/"
Run-SCP "$LOCAL_DIR\.env.example" "$REMOTE_DIR/"
Run-SCP "$LOCAL_DIR\.gitignore" "$REMOTE_DIR/"

# Upload src folder — create all subdirectories first
Run-SSH "mkdir -p $REMOTE_DIR/src/commands $REMOTE_DIR/src/events $REMOTE_DIR/src/posthog $REMOTE_DIR/src/reports $REMOTE_DIR/src/utils $REMOTE_DIR/src/codex $REMOTE_DIR/src/tools"

# Upload all source files
$srcFiles = Get-ChildItem -Path "$LOCAL_DIR\src" -Recurse -File
foreach ($file in $srcFiles) {
    $relativePath = $file.FullName.Substring("$LOCAL_DIR\".Length).Replace("\", "/")
    Run-SCP $file.FullName "$REMOTE_DIR/$relativePath"
}

Write-Host "   Code uploaded!" -ForegroundColor Green

# ─── Step 4: Check for .env on EC2 ─────────────────────────

Write-Host "[4/6] Checking environment variables..." -ForegroundColor Yellow
$hasEnv = Run-SSH "[ -f $REMOTE_DIR/.env ] && echo yes || echo no"

if ($hasEnv.Trim() -eq "no") {
    Write-Host ""
    Write-Host "   .env file not found on EC2!" -ForegroundColor Red
    Write-Host ""
    Write-Host "   Two options:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   Option A: Copy your local .env to EC2 (recommended for first time):" -ForegroundColor White
    Write-Host "   scp -i $SSH_KEY $LOCAL_DIR\.env ${EC2_USER}@${EC2_IP}:$REMOTE_DIR/.env" -ForegroundColor White
    Write-Host ""
    Write-Host "   Option B: SSH in and create it manually:" -ForegroundColor White
    Write-Host "   ssh -i $SSH_KEY ${EC2_USER}@$EC2_IP" -ForegroundColor White
    Write-Host "   nano ~/slack-posthog-bot/.env" -ForegroundColor White
    Write-Host ""

    $choice = Read-Host "   Copy local .env to EC2 now? (y/n)"
    if ($choice -eq "y") {
        Run-SCP "$LOCAL_DIR\.env" "$REMOTE_DIR/.env"
        Write-Host "   .env copied to EC2!" -ForegroundColor Green
    } else {
        Write-Host "   Skipped. Create .env on EC2 before running again." -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "   .env found on EC2!" -ForegroundColor Green
}

# ─── Step 5: Install dependencies ──────────────────────────

Write-Host "[5/6] Installing dependencies on EC2..." -ForegroundColor Yellow
Run-SSH "cd $REMOTE_DIR && npm install --production"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: npm install failed. Is Node.js installed on EC2?" -ForegroundColor Red
    exit 1
}
Write-Host "   Dependencies installed!" -ForegroundColor Green

# ─── Step 6: Start/restart with PM2 ────────────────────────

Write-Host "[6/6] Starting bot with PM2..." -ForegroundColor Yellow

# Check if PM2 is installed
$hasPM2 = Run-SSH "which pm2 2>/dev/null && echo yes || echo no"
if ($hasPM2.Trim() -eq "no") {
    Write-Host "   Installing PM2..." -ForegroundColor Yellow
    Run-SSH "sudo npm install -g pm2"
}

# Check if bot is already running
$isRunning = Run-SSH "pm2 list --no-color 2>/dev/null | grep slack-posthog-bot | wc -l"

if ([int]$isRunning.Trim() -gt 0) {
    Write-Host "   Restarting existing bot..." -ForegroundColor Yellow
    Run-SSH "cd $REMOTE_DIR && pm2 restart ecosystem.config.js"
} else {
    Write-Host "   Starting bot for the first time..." -ForegroundColor Yellow
    Run-SSH "cd $REMOTE_DIR && pm2 start ecosystem.config.js"
    Run-SSH "pm2 save"
    Run-SSH "sudo env PATH=`$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu 2>/dev/null; true"
}

# ─── Done! ──────────────────────────────────────────────────

Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host "  Deployment complete!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""

Run-SSH "pm2 list --no-color 2>/dev/null"

Write-Host ""
Write-Host "Recent logs:" -ForegroundColor Yellow
Run-SSH "pm2 logs slack-posthog-bot --lines 5 --nostream --no-color 2>/dev/null"

Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Cyan
Write-Host "  ssh -i $SSH_KEY ${EC2_USER}@$EC2_IP 'pm2 logs slack-posthog-bot'    - Watch logs"
Write-Host "  ssh -i $SSH_KEY ${EC2_USER}@$EC2_IP 'pm2 restart slack-posthog-bot' - Restart"
Write-Host "  ssh -i $SSH_KEY ${EC2_USER}@$EC2_IP 'pm2 status'                    - Status"
