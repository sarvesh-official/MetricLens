require("dotenv").config();

const { App } = require("@slack/bolt");
const { registerCommands } = require("./commands");
const { registerEvents } = require("./events");
const { startCronJobs } = require("./cron");

// Create the Slack app using Socket Mode (no public URL needed)
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// Register slash commands (e.g. /metrics)
registerCommands(app);

// Register event handlers (e.g. @bot mentions)
registerEvents(app);

// Start the app
(async () => {
  await app.start();
  console.log("⚡ Bot is running in Socket Mode!");

  // Start scheduled daily/weekly reports
  startCronJobs(app);
})();
