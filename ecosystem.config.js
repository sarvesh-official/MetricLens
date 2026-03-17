/**
 * PM2 configuration for running the bot on EC2.
 *
 * PM2 is a process manager that:
 * - Keeps the bot running even if it crashes (auto-restart)
 * - Starts the bot automatically when EC2 reboots
 * - Provides log management
 *
 * Usage on EC2:
 *   pm2 start ecosystem.config.js
 *   pm2 logs slack-posthog-bot
 *   pm2 restart slack-posthog-bot
 *   pm2 stop slack-posthog-bot
 */
module.exports = {
  apps: [
    {
      name: "slack-posthog-bot",
      script: "src/app.js",
      env: {
        NODE_ENV: "production",
      },
      // Restart if the bot crashes
      autorestart: true,
      // Wait 5 seconds between restart attempts
      restart_delay: 5000,
      // Max 10 restarts in 15 minutes (prevents infinite restart loops)
      max_restarts: 10,
      min_uptime: "10s",
      // Keep logs manageable
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "logs/error.log",
      out_file: "logs/output.log",
      merge_logs: true,
    },
  ],
};
