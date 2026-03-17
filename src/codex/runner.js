const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Run Codex CLI with a prompt and return its response.
 *
 * How this works:
 * 1. We use `codex exec` — the non-interactive mode
 * 2. Codex gets a system prompt telling it about our query tool
 * 3. Codex runs `node src/tools/query.js <command>` to get PostHog data
 * 4. Codex summarizes the data in plain English
 * 5. We capture the output via -o flag and return it
 *
 * No MCP needed — Codex just calls our query scripts directly.
 */

const CODEX_TIMEOUT = 180000; // 3 minutes (Codex needs time to think + run queries)
const PROJECT_ROOT = path.resolve(__dirname, "../..");

function runCodex(prompt) {
  return new Promise((resolve, reject) => {
    const outputFile = path.join(os.tmpdir(), `codex-response-${Date.now()}.txt`);

    // Read system prompt from file
    const systemPromptFile = path.join(__dirname, "system-prompt.txt");
    const systemPrompt = fs.readFileSync(systemPromptFile, "utf-8");

    // Inject current date/time so Codex always knows "today"
    const now = new Date();
    const dateInfo = `CURRENT DATE/TIME: ${now.toISOString().split("T")[0]} (${now.toLocaleDateString("en-US", { weekday: "long" })}), ${now.toLocaleTimeString()}`;

    // Combine system instructions + date + user request
    const fullPrompt = `${systemPrompt}\n\n${dateInfo}\n\nUser's Slack message: "${prompt}"\n\nRun the appropriate query tool now and summarize the results.`;

    // Write prompt to a temp file to avoid shell escaping issues
    const promptFile = path.join(os.tmpdir(), `codex-prompt-${Date.now()}.txt`);
    fs.writeFileSync(promptFile, fullPrompt);

    // Use -C to set working directory to our project root
    // -s danger-full-access = allows network access (needed for PostHog API calls)
    // --full-auto sandbox blocks outbound network, which breaks our query tool
    const cmd = `cat "${promptFile}" | codex exec -s danger-full-access --skip-git-repo-check -C "${PROJECT_ROOT}" -o "${outputFile}" -`;

    // Pass current process env vars to the child process
    // This ensures POSTHOG_API_KEY and other vars are available
    const env = { ...process.env };

    exec(cmd, { timeout: CODEX_TIMEOUT, shell: true, env }, (error, stdout, stderr) => {
      // Read and clean up temp files
      let output = "";
      try {
        if (fs.existsSync(outputFile)) {
          output = fs.readFileSync(outputFile, "utf-8").trim();
          fs.unlinkSync(outputFile);
        }
        if (fs.existsSync(promptFile)) {
          fs.unlinkSync(promptFile);
        }
      } catch (e) {
        // Ignore file cleanup errors
      }

      if (error) {
        if (error.killed) {
          reject(new Error("Codex timed out — the query may be too complex"));
          return;
        }
        // If we got output despite an error, use it
        if (output) {
          resolve(output);
          return;
        }
        reject(new Error(`Codex failed: ${error.message}`));
        return;
      }

      // If -o file is empty, try stdout
      if (!output) {
        output = stdout.trim();
      }

      if (!output) {
        reject(new Error("Codex returned an empty response"));
        return;
      }

      resolve(output);
    });
  });
}

/**
 * Check if Codex CLI is available on this machine.
 */
function isCodexAvailable() {
  return new Promise((resolve) => {
    exec("codex --version", (error) => {
      resolve(!error);
    });
  });
}

module.exports = { runCodex, isCodexAvailable };
