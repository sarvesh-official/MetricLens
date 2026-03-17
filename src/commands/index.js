const { fetchAndFormat } = require("../codex/formatter");

/**
 * Register all slash commands.
 *
 * /help                 → Show all available commands
 * /metrics              → Daily report (only visible to you)
 * /metrics weekly       → Weekly report (only visible to you)
 * /metrics share        → Daily report (visible to everyone)
 * /metrics weekly share → Weekly report (visible to everyone)
 */
function registerCommands(app) {
  // ─── /help ───────────────────────────────────────────────
  app.command("/help", async ({ ack, respond }) => {
    await ack();

    await respond({
      text: "PostHog Metrics Bot — Commands",
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "PostHog Metrics Bot" },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Slash Commands:*\n" +
              "`/metrics` — Yesterday's retention report\n" +
              "`/metrics weekly` — Weekly comparison\n" +
              "`/metrics share` — Daily report (visible to all)\n" +
              "`/report` — Full analytics report\n" +
              "`/report churned` — Who stopped using the app (with emails)\n" +
              "`/report features` — Feature usage breakdown\n" +
              "`/report onboarding` — Onboarding funnel\n" +
              "`/report chat` — Chat engagement\n" +
              "`/report share` — Full report (visible to all)\n" +
              "`/help` — This message",
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Ask me anything by @mentioning or DM:*\n" +
              "Just ask in plain English! Examples:\n" +
              "• _How many active users do we have?_\n" +
              "• _What features are people using?_\n" +
              "• _How's onboarding going?_\n" +
              "• _Which pages get the most traffic?_\n" +
              "• _Where are our users from?_\n" +
              "• _What devices do people use?_\n" +
              "• _How's chat engagement this week?_\n" +
              "• _Who stopped using the app?_\n" +
              "• _Compare this week with last week_\n" +
              "• _Give me a full overview_",
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Quick keywords (via @mention or DM):*\n" +
              "`daily` — Yesterday's report\n" +
              "`weekly` — Weekly comparison\n" +
              "`help` — This message",
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "Powered by PostHog + Codex | Reports auto-posted daily at 2:30 PM IST, weekly on Mondays at 3:00 PM IST",
            },
          ],
        },
      ],
    });
  });

  // ─── /report ─────────────────────────────────────────────
  app.command("/report", async ({ command, ack, respond, client }) => {
    await ack();

    const parts = (command.text || "").trim().toLowerCase().split(/\s+/);
    const isShared = parts.includes("share");

    // Determine which report to run
    let queryCmd = "full-report";
    let label = "Full Analytics Report";

    if (parts.includes("churned") || parts.includes("churn")) {
      queryCmd = "churned-details";
      label = "Churned Users Report";
    } else if (parts.includes("features") || parts.includes("usage")) {
      queryCmd = "features";
      label = "Feature Usage Report";
    } else if (parts.includes("onboarding")) {
      queryCmd = "onboarding";
      label = "Onboarding Report";
    } else if (parts.includes("chat")) {
      queryCmd = "chat-engagement";
      label = "Chat Engagement Report";
    }

    if (isShared) {
      const loading = await client.chat.postMessage({
        token: process.env.SLACK_BOT_TOKEN,
        channel: command.channel_id,
        text: `Generating ${label.toLowerCase()}...`,
      });

      const { text } = await fetchAndFormat(queryCmd, label);

      await client.chat.update({
        token: process.env.SLACK_BOT_TOKEN,
        channel: command.channel_id,
        ts: loading.ts,
        text,
      });
    } else {
      await respond(`Generating ${label.toLowerCase()}...`);
      const { text } = await fetchAndFormat(queryCmd, label);
      await respond({ text, replace_original: true });
    }
  });

  // ─── /metrics ────────────────────────────────────────────
  app.command("/metrics", async ({ command, ack, respond, client }) => {
    await ack();

    const parts = (command.text || "").trim().toLowerCase().split(/\s+/);
    const isWeekly = parts.includes("weekly");
    const isShared = parts.includes("share");

    const queryCmd = isWeekly ? "compare-weeks" : "retention";
    const label = isWeekly ? "Weekly Comparison Report" : "Daily Retention Report";

    if (isShared) {
      const loading = await client.chat.postMessage({
        token: process.env.SLACK_BOT_TOKEN,
        channel: command.channel_id,
        text: `Generating ${isWeekly ? "weekly" : "daily"} report...`,
      });

      const { text } = await fetchAndFormat(queryCmd, label);

      await client.chat.update({
        token: process.env.SLACK_BOT_TOKEN,
        channel: command.channel_id,
        ts: loading.ts,
        text,
      });
    } else {
      await respond(`Generating ${isWeekly ? "weekly" : "daily"} report...`);
      const { text } = await fetchAndFormat(queryCmd, label);
      await respond({ text, replace_original: true });
    }
  });
}

module.exports = { registerCommands };
