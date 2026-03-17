const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Two-step approach for reliable, human-friendly reports:
 *
 * Step 1: Fetch data using our query tool (fast, reliable, no AI needed)
 * Step 2: Ask Codex to format the data into plain English (AI does what it's good at)
 *
 * This is better than asking Codex to do both because:
 * - Data fetching never fails (no MCP, no AI hallucination)
 * - Codex only needs to format/explain, which is faster (~20-30s vs ~60s)
 * - If Codex is unavailable, we still have raw data to fall back on
 */

const CODEX_TIMEOUT = 120000;
const PROJECT_ROOT = path.resolve(__dirname, "../..");

/**
 * Fetch data using our query tool, then ask Codex to explain it.
 * Falls back to raw data if Codex is unavailable.
 *
 * @param {string} queryCommand - e.g. "retention", "trends", "compare-weeks"
 * @param {string} context - e.g. "daily report for yesterday" or "weekly comparison"
 */
async function fetchAndFormat(queryCommand, context) {
  // Step 1: Fetch data (always works, no AI needed)
  const rawData = await runQueryTool(queryCommand);

  // Step 2: Ask Codex to format it
  try {
    const formatted = await formatWithCodex(rawData, context);
    return { text: formatted, isCodexFormatted: true };
  } catch (err) {
    console.error("Codex formatting failed, using raw data:", err.message);
    // Fallback: return a basic summary from the raw data
    return { text: buildFallbackSummary(rawData, context), isCodexFormatted: false };
  }
}

/**
 * Run our query tool and return the JSON output as a string.
 */
function runQueryTool(command) {
  return new Promise((resolve, reject) => {
    exec(
      `node src/tools/query.js ${command}`,
      { cwd: PROJECT_ROOT, timeout: 30000 },
      (error, stdout) => {
        if (error) {
          reject(new Error(`Query tool failed: ${error.message}`));
          return;
        }
        // Remove the dotenv log line from output
        const clean = stdout
          .split("\n")
          .filter((line) => !line.includes("[dotenv"))
          .join("\n")
          .trim();
        resolve(clean);
      }
    );
  });
}

/**
 * Ask Codex to format raw JSON data into a human-friendly Slack message.
 * Since we already have the data, Codex doesn't need to run any tools.
 */
function formatWithCodex(rawData, context) {
  return new Promise((resolve, reject) => {
    const outputFile = path.join(os.tmpdir(), `codex-fmt-${Date.now()}.txt`);
    const promptFile = path.join(os.tmpdir(), `codex-fmt-prompt-${Date.now()}.txt`);

    const prompt = `You are formatting a ${context} for a Slack channel.

Here is the raw PostHog data (JSON):

${rawData}

Write a clear, human-friendly summary of this data for a Slack message. Follow these rules:
- Use Slack formatting: *bold* (single asterisk), _italic_, \`code\`
- Do NOT use markdown ** for bold
- Translate technical names: $pageview = "page views", $autocapture = "user interactions"
- Explain what numbers MEAN, not just what they are
- Example: "Only 3.7% of new users came back the next day — that means out of every 100 new visitors, only about 4 returned"
- For comparisons, highlight whether things improved or declined and by how much
- Add a brief takeaway or insight at the end
- Keep it under 2000 characters
- Do NOT include raw JSON
- Do NOT ask any questions — just write the summary`;

    fs.writeFileSync(promptFile, prompt);

    const cmd = `cat "${promptFile}" | codex exec -s danger-full-access --skip-git-repo-check -o "${outputFile}" -`;

    const env = { ...process.env };
    if (process.env.OPENAI_API_KEY) {
      env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    }

    exec(cmd, { timeout: CODEX_TIMEOUT, shell: true, env }, (error, stdout) => {
      let output = "";
      try {
        if (fs.existsSync(outputFile)) {
          output = fs.readFileSync(outputFile, "utf-8").trim();
          fs.unlinkSync(outputFile);
        }
        if (fs.existsSync(promptFile)) {
          fs.unlinkSync(promptFile);
        }
      } catch (e) {}

      if (error && !output) {
        reject(new Error(`Codex format failed: ${error.message}`));
        return;
      }

      if (!output) output = stdout?.trim() || "";

      if (!output) {
        reject(new Error("Codex returned empty formatting"));
        return;
      }

      // Clean up markdown → Slack formatting
      const slackFormatted = output
        .replace(/\*\*(.+?)\*\*/g, "*$1*")
        .replace(/^#+\s*/gm, "");

      resolve(slackFormatted);
    });
  });
}

/**
 * Basic fallback summary when Codex is unavailable.
 * Not as nice, but better than showing raw JSON.
 */
function buildFallbackSummary(rawData, context) {
  try {
    const data = JSON.parse(rawData);

    if (data.cohorts) {
      // Retention data
      const lines = data.cohorts.map(
        (c) => `• ${c.date}: ${c.new_users} new users, ${c.day1_retention_pct}% returned next day`
      );
      return `*${context}*\n\nRetention (${data.from} to ${data.to}):\n${lines.join("\n")}\n\nAverage Day-1 retention: *${data.average_day1_retention_pct}%*`;
    }

    if (data.this_week && data.last_week) {
      // Compare weeks
      return (
        `*${context}*\n\n` +
        `This week (${data.this_week.from} to ${data.this_week.to}): Day-1 retention *${data.this_week.avg_day1_retention_pct}%*\n` +
        `Last week (${data.last_week.from} to ${data.last_week.to}): Day-1 retention *${data.last_week.avg_day1_retention_pct}%*\n` +
        `Change: *${data.retention_change_pp}pp*`
      );
    }

    if (data.events) {
      // Trends
      const lines = data.events.map((e) => `• ${e.event}: ${e.total_count.toLocaleString()} events`);
      return `*${context}*\n\n${lines.join("\n")}`;
    }

    return `*${context}*\n\n${rawData.substring(0, 1500)}`;
  } catch {
    return `*${context}*\n\nData retrieved but formatting unavailable.`;
  }
}

module.exports = { fetchAndFormat };
