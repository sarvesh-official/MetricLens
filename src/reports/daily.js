const { getRetention, getTrends } = require("../posthog/client");
const { formatDate, yesterday } = require("../utils/dates");

/**
 * Build the daily report message.
 * Fetches yesterday's retention + event trends from PostHog
 * and formats them into a readable Slack message.
 */
async function buildDailyReport() {
  const date = yesterday();
  const dateStr = formatDate(date);

  try {
    const [retention, trends] = await Promise.all([
      getRetention(dateStr, dateStr),
      getTrends(dateStr, dateStr),
    ]);

    const retentionRows = formatRetention(retention);
    const trendSummary = formatTrends(trends);

    return {
      text: `Daily Metrics Report — ${dateStr}`,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: `Daily Metrics Report — ${dateStr}` },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Retention (first-time users):*\n${retentionRows}` },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Event Trends:*\n${trendSummary}` },
        },
        {
          type: "context",
          elements: [{ type: "mrkdwn", text: "Data from PostHog | Auto-generated report" }],
        },
      ],
    };
  } catch (err) {
    console.error("Failed to build daily report:", err.message);
    return { text: `Daily report failed for ${dateStr}: ${err.message}` };
  }
}

function formatRetention(data) {
  // Query API uses "results" (not "result")
  if (!data?.results || data.results.length === 0) {
    return "_No retention data available_";
  }

  return data.results
    .slice(0, 5)
    .map((cohort) => {
      const total = cohort.values?.[0]?.count || 0;
      const retained = cohort.values?.[1]?.count || 0;
      const pct = total > 0 ? ((retained / total) * 100).toFixed(1) : "0.0";
      const dateLabel = cohort.date ? cohort.date.split("T")[0] : cohort.label;
      return `• ${dateLabel}: ${total} users, ${pct}% returned next day`;
    })
    .join("\n");
}

function formatTrends(data) {
  if (!data?.results || data.results.length === 0) {
    return "_No trend data available_";
  }

  return data.results
    .map((series) => {
      const total = series.count || 0;
      return `• *${series.label}*: ${total.toLocaleString()} events`;
    })
    .join("\n");
}

module.exports = { buildDailyReport };
