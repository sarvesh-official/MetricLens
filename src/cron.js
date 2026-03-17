const cron = require("node-cron");
const { fetchAndFormat } = require("./codex/formatter");

/**
 * Start scheduled cron jobs for automatic reports.
 *
 * Both daily and weekly reports now go through Codex for formatting.
 * If Codex is unavailable, the fallback formatting still works.
 *
 * Cron syntax: minute hour day-of-month month day-of-week
 * Times are in the server's timezone (EC2 = UTC by default).
 * 9:00 UTC = 2:30 PM IST
 */
function startCronJobs(app) {
  const channel = process.env.SLACK_REPORT_CHANNEL || "posthog-alerts";

  // Daily report: every day at 9:00 AM UTC (2:30 PM IST)
  cron.schedule("0 9 * * *", async () => {
    console.log("Running daily report cron...");
    try {
      const { text } = await fetchAndFormat("retention", "Daily Retention Report");
      await app.client.chat.postMessage({
        token: process.env.SLACK_BOT_TOKEN,
        channel,
        text,
      });
      console.log("Daily report sent!");
    } catch (err) {
      console.error("Daily report cron failed:", err.message);
    }
  });

  // Weekly report: every Monday at 9:30 AM UTC (3:00 PM IST)
  cron.schedule("30 9 * * 1", async () => {
    console.log("Running weekly report cron...");
    try {
      const { text } = await fetchAndFormat("compare-weeks", "Weekly Comparison Report");
      await app.client.chat.postMessage({
        token: process.env.SLACK_BOT_TOKEN,
        channel,
        text,
      });
      console.log("Weekly report sent!");
    } catch (err) {
      console.error("Weekly report cron failed:", err.message);
    }
  });

  console.log("Cron jobs scheduled: daily at 9:00 UTC, weekly Monday 9:30 UTC");
}

module.exports = { startCronJobs };
