const { getTrends, getRetention } = require("../posthog/client");
const { formatDate, startOfWeek, endOfWeek, weeksAgo } = require("../utils/dates");

/**
 * Build weekly comparison report.
 * Compares this week vs last week for retention and event trends.
 */
async function buildWeeklyReport() {
  const thisWeekStart = formatDate(weeksAgo(1, startOfWeek));
  const thisWeekEnd = formatDate(weeksAgo(1, endOfWeek));
  const lastWeekStart = formatDate(weeksAgo(2, startOfWeek));
  const lastWeekEnd = formatDate(weeksAgo(2, endOfWeek));

  try {
    const [thisWeekTrends, lastWeekTrends, thisWeekRetention, lastWeekRetention] =
      await Promise.all([
        getTrends(thisWeekStart, thisWeekEnd),
        getTrends(lastWeekStart, lastWeekEnd),
        getRetention(thisWeekStart, thisWeekEnd),
        getRetention(lastWeekStart, lastWeekEnd),
      ]);

    const comparison = buildComparison(thisWeekTrends, lastWeekTrends);
    const retentionComparison = buildRetentionComparison(thisWeekRetention, lastWeekRetention);

    return {
      text: `Weekly Report: ${thisWeekStart} to ${thisWeekEnd}`,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "Weekly Comparison Report" },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Period:* ${thisWeekStart} to ${thisWeekEnd} vs ${lastWeekStart} to ${lastWeekEnd}`,
          },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Event Trends:*\n${comparison}` },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Retention:*\n${retentionComparison}` },
        },
        {
          type: "context",
          elements: [{ type: "mrkdwn", text: "Data from PostHog | Auto-generated weekly report" }],
        },
      ],
    };
  } catch (err) {
    console.error("Failed to build weekly report:", err.message);
    return { text: `Weekly report failed: ${err.message}` };
  }
}

function buildComparison(thisWeek, lastWeek) {
  if (!thisWeek?.results?.length) return "_No data_";

  return thisWeek.results
    .map((series) => {
      const thisCount = series.count || 0;
      const lastSeries = lastWeek?.results?.find((s) => s.label === series.label);
      const lastCount = lastSeries?.count || 0;

      const diff = thisCount - lastCount;
      const pct = lastCount > 0 ? ((diff / lastCount) * 100).toFixed(1) : "N/A";
      const arrow = diff > 0 ? "up" : diff < 0 ? "down" : "flat";

      return `• *${series.label}*: ${thisCount.toLocaleString()} (${arrow} ${pct}% vs last week)`;
    })
    .join("\n");
}

function buildRetentionComparison(thisWeek, lastWeek) {
  if (!thisWeek?.results?.length) return "_No retention data_";

  const thisAvg = avgRetention(thisWeek);
  const lastAvg = avgRetention(lastWeek);
  const diff = (thisAvg - lastAvg).toFixed(1);
  const arrow = diff > 0 ? "up" : diff < 0 ? "down" : "flat";

  return `• Avg Day-1 retention: *${thisAvg.toFixed(1)}%* (${arrow} ${diff}pp vs last week's ${lastAvg.toFixed(1)}%)`;
}

function avgRetention(data) {
  if (!data?.results?.length) return 0;

  const rates = data.results
    .map((cohort) => {
      const total = cohort.values?.[0]?.count || 0;
      const retained = cohort.values?.[1]?.count || 0;
      return total > 0 ? (retained / total) * 100 : null;
    })
    .filter((r) => r !== null);

  if (rates.length === 0) return 0;
  return rates.reduce((a, b) => a + b, 0) / rates.length;
}

module.exports = { buildWeeklyReport };
