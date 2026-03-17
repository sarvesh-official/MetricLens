const { fetchAndFormat } = require("../codex/formatter");
const { runCodex, isCodexAvailable } = require("../codex/runner");

function registerEvents(app) {
  app.event("app_mention", async ({ event, client, say }) => {
    const text = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();
    await handleMessage(text, event.channel, client, say);
  });

  app.event("message", async ({ event, client, say }) => {
    if (event.channel_type !== "im" || event.bot_id) return;
    await handleMessage(event.text || "", event.channel, client, say);
  });
}

async function handleMessage(text, channel, client, say) {
  const lower = text.toLowerCase();

  if (lower.includes("help")) {
    await say({
      text: "Here's what I can do:",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: [
              "*PostHog Metrics Bot — Help*",
              "",
              "*Slash Commands:*",
              "  `/metrics` — Yesterday's daily report",
              "  `/metrics weekly` — Weekly comparison report",
              "  `/help` — Show all commands",
              "",
              "*Mention / DM:*",
              "  `daily` — Daily metrics",
              "  `weekly` — Weekly comparison",
              "  Or ask any question in plain English!",
              "  Example: _What features are people using?_",
            ].join("\n"),
          },
        },
      ],
    });
    return;
  }

  if (/^(daily|today|yesterday)$/i.test(lower) || lower === "daily report") {
    const loading = await postLoading(client, channel, "Generating daily report");
    const { text: report } = await fetchAndFormat("retention", "Daily Retention Report");
    await replaceLoading(client, channel, loading, report);
    return;
  }

  if (/^(weekly|week)$/i.test(lower) || lower === "weekly report") {
    const loading = await postLoading(client, channel, "Generating weekly report");
    const { text: report } = await fetchAndFormat("compare-weeks", "Weekly Comparison Report");
    await replaceLoading(client, channel, loading, report);
    return;
  }

  // Natural language → Codex
  const codexAvailable = await isCodexAvailable();

  if (codexAvailable) {
    const loading = await postLoading(client, channel, pickLoadingText(lower));

    try {
      const response = await runCodex(
        `The user asked: "${text}". ` +
          "Query PostHog to answer this question. " +
          "Provide a clear, data-backed answer."
      );

      const slackFormatted = response
        .replace(/\*\*(.+?)\*\*/g, "*$1*")
        .replace(/^#+\s*/gm, "");

      await replaceLoading(client, channel, loading, slackFormatted);
    } catch (err) {
      console.error("Codex error:", err.message);
      await replaceLoading(client, channel, loading, `Sorry, I couldn't process that: ${err.message}`);
    }
  } else {
    await say(
      "I can answer that when running on EC2 with Codex. " +
        "For now, try `daily` or `weekly` for pre-built reports."
    );
  }
}

/**
 * Pick a contextual loading message based on what the user asked.
 * Falls back to a random fun message if no keyword matches.
 */
function pickLoadingText(text) {
  // Contextual messages based on keywords
  if (text.includes("retention") || text.includes("coming back"))
    return "Checking who came back";
  if (text.includes("churn") || text.includes("left") || text.includes("stopped"))
    return "Looking for missing users";
  if (text.includes("active") || text.includes("dau") || text.includes("how many users"))
    return "Counting active users";
  if (text.includes("feature") || text.includes("using") || text.includes("usage"))
    return "Checking feature usage";
  if (text.includes("onboarding") || text.includes("signup"))
    return "Checking the onboarding funnel";
  if (text.includes("page") || text.includes("traffic") || text.includes("visit"))
    return "Finding the most popular pages";
  if (text.includes("country") || text.includes("where") || text.includes("geography"))
    return "Mapping out your users";
  if (text.includes("device") || text.includes("mobile") || text.includes("browser"))
    return "Checking devices and browsers";
  if (text.includes("chat") || text.includes("message") || text.includes("conversation"))
    return "Analyzing chat activity";
  if (text.includes("compare") || text.includes("vs") || text.includes("last week"))
    return "Comparing the numbers";
  if (text.includes("overview") || text.includes("how are we") || text.includes("summary"))
    return "Pulling together an overview";

  // Random fun messages for everything else
  const random = [
    "Digging into the data",
    "Crunching the numbers",
    "Asking PostHog nicely",
    "Fetching your insights",
    "Running the analysis",
    "Querying the data warehouse",
    "On it — pulling the numbers",
    "Looking into it",
    "Gathering the metrics",
    "Let me check the data",
  ];
  return random[Math.floor(Math.random() * random.length)];
}

/**
 * Post a loading message with animated dots.
 * Returns an object with ts and a stop function to clear the animation.
 *
 * The message cycles through:
 *   "Analyzing your question"
 *   "Analyzing your question."
 *   "Analyzing your question.."
 *   "Analyzing your question..."
 */
async function postLoading(client, channel, baseText) {
  const res = await client.chat.postMessage({
    token: process.env.SLACK_BOT_TOKEN,
    channel,
    text: `${baseText}...`,
  });

  let dots = 0;
  const interval = setInterval(async () => {
    dots = (dots + 1) % 4;
    const dotStr = ".".repeat(dots);
    try {
      await client.chat.update({
        token: process.env.SLACK_BOT_TOKEN,
        channel,
        ts: res.ts,
        text: `${baseText}${dotStr}`,
      });
    } catch (e) {
      // Ignore update errors during animation
    }
  }, 2000);

  return { ts: res.ts, stop: () => clearInterval(interval) };
}

/**
 * Replace the loading message with the actual content.
 * Stops the dot animation and updates the message.
 */
async function replaceLoading(client, channel, loading, content) {
  loading.stop();

  const payload = {
    token: process.env.SLACK_BOT_TOKEN,
    channel,
    ts: loading.ts,
  };

  if (typeof content === "string") {
    payload.text = content;
  } else {
    payload.text = content.text || "";
    payload.blocks = content.blocks || [];
  }

  try {
    await client.chat.update(payload);
  } catch (err) {
    console.error("Failed to update message:", err.message);
    // If update fails, post as a new message instead
    try {
      if (typeof content === "string") {
        await client.chat.postMessage({ token: process.env.SLACK_BOT_TOKEN, channel, text: content });
      } else {
        await client.chat.postMessage({ token: process.env.SLACK_BOT_TOKEN, channel, ...content });
      }
    } catch (e) {
      console.error("Failed to post fallback message:", e.message);
    }
  }
}

module.exports = { registerEvents };
