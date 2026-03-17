<p align="center">
  <img src="assets/logo.svg" alt="MetricLens Logo" width="120" height="120" />
</p>

<h1 align="center">MetricLens</h1>

<p align="center">
  <strong>AI-powered observability tool that connects PostHog analytics to Slack.<br/>Ask questions in plain English, get human-friendly insights.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Slack-Bolt%20v4-4A154B?style=flat-square&logo=slack&logoColor=white" alt="Slack" />
  <img src="https://img.shields.io/badge/PostHog-Analytics-F9BD2B?style=flat-square&logo=posthog&logoColor=black" alt="PostHog" />
  <img src="https://img.shields.io/badge/OpenAI-Codex%20CLI-412991?style=flat-square&logo=openai&logoColor=white" alt="OpenAI Codex" />
  <img src="https://img.shields.io/badge/AWS-EC2-FF9900?style=flat-square&logo=amazon-aws&logoColor=white" alt="AWS EC2" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="MIT License" />
</p>

---

## What is MetricLens?

MetricLens is an observability tool that lives in your Slack workspace. Instead of switching to dashboards, your team asks questions in plain English:

> *"How many active users do we have?"*
> *"Who stopped using the app this week?"*
> *"How's onboarding going?"*

MetricLens fetches data from PostHog, pipes it through OpenAI Codex for analysis, and delivers clear, human-friendly answers — complete with insights, comparisons, and actionable takeaways.

It also runs automated daily and weekly reports on a cron schedule, and includes session replay links so your team can watch exactly what happened before a user churned.

---

## How is MetricLens Different?

There are existing tools that connect PostHog to Slack. Here's why MetricLens takes a different approach:

| Solution | What it does | Limitation |
|---|---|---|
| **PostHog Slack Integration** (built-in) | Sends webhook alerts when events fire | One-way notifications only. Can't ask questions or get reports on demand. No AI analysis. |
| **PostHog MCP Server** | Lets AI agents query PostHog via Model Context Protocol | Requires an MCP-compatible client (Claude Desktop, Cursor, etc.). Not accessible to non-technical team members in Slack. |
| **Zapier / n8n** | Connects PostHog to Slack via automation workflows | Rigid triggers — you define specific flows in advance. No natural language, no ad-hoc questions, no AI explanations. Paid beyond free tier. |
| **Better Stack / Datadog** | Full observability platforms with Slack alerts | Expensive. Focused on infrastructure monitoring, not product analytics. Requires migration away from PostHog. |
| **Custom dashboards** | Grafana, Metabase, etc. connected to PostHog | Team has to leave Slack, log in, navigate dashboards. Nobody checks dashboards daily. |

### What MetricLens does differently

- **Lives where your team already is** — Slack. No context switching, no dashboard fatigue.
- **Natural language, not SQL** — Anyone on the team can ask "who stopped using the app?" without knowing HogQL.
- **AI explains the data** — Instead of raw numbers, you get: *"Only 3.7% of new users came back — that means about 4 out of every 100 visitors returned."*
- **Session replay links** — Churned user reports include clickable links to watch their last session in PostHog. See exactly what happened before they left.
- **Two-step reliability** — Data fetching is pure API calls (never fails). AI only handles formatting. If Codex goes down, fallback formatting still works.
- **Zero infrastructure cost** — Runs on a single EC2 instance (t2.micro free tier eligible). Socket Mode means no domain, no SSL, no load balancer, no Elastic IP.
- **Fully self-hosted** — Your data never touches third-party analytics platforms. PostHog API → your EC2 → your Slack. That's it.

---

## Infrastructure

MetricLens is designed to run on minimal infrastructure with zero additional cost.

```
┌─────────────────────────────────────────────────────┐
│                    AWS EC2 (Ubuntu)                  │
│                  t2.micro / t3.micro                 │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │  MetricLens  │  │  Codex CLI   │  │    PM2    │ │
│  │  (Node.js)   │  │  (OpenAI)    │  │ (Process  │ │
│  │              │◄─┤              │  │  Manager) │ │
│  └──────┬───────┘  └──────────────┘  └───────────┘ │
│         │                                           │
│         │ Outbound only (no inbound ports needed)   │
└─────────┼───────────────────────────────────────────┘
          │
          ▼
    ┌─────────────┐          ┌──────────────┐
    │ Slack API   │          │ PostHog API  │
    │ (WebSocket) │          │ (HTTPS)      │
    └─────────────┘          └──────────────┘
```

### Why this setup works

| Concern | How MetricLens handles it |
|---|---|
| **No Elastic IP** | Socket Mode connects *outbound* to Slack — IP changes don't matter |
| **No domain or SSL** | WebSocket connection, not HTTP webhooks — no public URL needed |
| **No load balancer** | Single process handles everything (Slack events + cron + API calls) |
| **No database** | Stateless — all data comes from PostHog's API on demand |
| **Auto-recovery** | PM2 restarts the bot on crash, survives EC2 reboots |
| **Cost** | Runs on t2.micro (AWS free tier) — **$0/month** for the first year |

### Security

- No inbound ports open (security group only needs outbound HTTPS on 443)
- Secrets stored in `.env` on EC2, never committed to git
- PostHog API key scoped to read-only with specific project access
- Codex runs in a sandboxed subprocess

---

## Features

| Feature | Description |
|---|---|
| **Natural Language Queries** | Ask anything via `@mention` or DM — Codex interprets, fetches data, and responds in plain English |
| **14 Query Commands** | Retention, trends, DAU/WAU/MAU, feature usage, onboarding funnels, churn analysis, top pages, geography, devices, chat engagement, error sessions |
| **Slash Commands** | `/metrics`, `/report`, `/help` with subcommands like `/report churned`, `/report features` |
| **Automated Reports** | Daily retention reports and weekly comparisons posted automatically to Slack |
| **Session Replay Links** | Churned user reports include direct PostHog replay URLs — watch what happened before a user left |
| **Two-Step AI** | Data is fetched first (reliable), then formatted by Codex (human-friendly). Fallback formatting if Codex is unavailable |
| **Dynamic Loading** | Context-aware indicators — "Checking who came back" for retention, "Looking for missing users" for churn |
| **Week-over-Week** | Compare retention and event trends with percentage changes and directional signals |
| **Full Report Mode** | 6 parallel PostHog queries for a comprehensive overview in one shot |
| **Socket Mode** | No public URL or ngrok — connects via WebSocket, works from any machine including EC2 |
| **One-Command Deploy** | PowerShell and Bash scripts handle SSH, upload, npm install, PM2 setup in one command |
| **PM2 Management** | Auto-restart on crash, boot persistence, structured logging |

---

## Architecture

```
                          Slack Workspace
                               |
                     (Socket Mode WebSocket)
                               |
                    +----------+-----------+
                    |    Slack Bolt App     |
                    |     (src/app.js)      |
                    +----------+-----------+
                               |
              +----------------+----------------+
              |                |                |
     +---------+------+  +----+-----+  +-------+--------+
     | Slash Commands  |  | Events   |  | Cron Scheduler |
     | /metrics        |  | @mention |  | Daily  9:00UTC |
     | /report         |  | DM       |  | Weekly 9:30UTC |
     | /help           |  |          |  | (node-cron)    |
     +---------+------+  +----+-----+  +-------+--------+
              |                |                |
              +--------+-------+--------+-------+
                       |                |
               +-------+-------+ +-----+--------+
               | Codex Formatter| | Codex Runner |
               | (Two-Step)     | | (Full NL)    |
               +-------+-------+ +-----+--------+
                       |                |
                 +-----+-----+   +-----+-----+
                 | Query Tool |   | Codex CLI |
                 | (14 cmds)  |   | (OpenAI)  |
                 +-----+------+   +-----------+
                       |
              +--------+--------+
              |  PostHog Client  |
              |  (Axios + HogQL) |
              +---------+-------+
                        |
                  PostHog Cloud API
```

**Slash commands and cron reports (two-step):**
1. Query tool fetches raw JSON from PostHog (fast, reliable)
2. Codex CLI formats the JSON into a human-friendly Slack message
3. If Codex is unavailable, a fallback formatter produces a basic summary

**Natural language queries:**
1. User's question is sent to Codex CLI with a system prompt
2. Codex decides which query tool command(s) to run
3. Codex executes the query, reads the JSON, and writes a summary
4. The summary is posted back to Slack

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Runtime | **Node.js 20+** | JavaScript runtime |
| Slack SDK | **@slack/bolt v4** | Slash commands, events, Socket Mode |
| Analytics | **PostHog Cloud API** | Retention, trends, HogQL queries, session replays |
| AI | **OpenAI Codex CLI** | Natural language understanding and data summarization |
| HTTP | **Axios** | PostHog API calls |
| Scheduling | **node-cron** | Daily and weekly automated reports |
| Process Mgmt | **PM2** | Production process management on EC2 |
| Infrastructure | **AWS EC2** (Ubuntu) | Hosting |
| Config | **dotenv** | Environment variable management |

---

## Project Structure

```
MetricLens/
|
|-- src/
|   |-- app.js                  # Entry point: Slack app + cron scheduler
|   |-- cron.js                 # Scheduled daily and weekly reports
|   |
|   |-- commands/
|   |   +-- index.js            # /metrics, /report, /help handlers
|   |
|   |-- events/
|   |   +-- index.js            # @mention, DM handlers, loading animations
|   |
|   |-- codex/
|   |   |-- runner.js           # Codex CLI executor for NL queries
|   |   |-- formatter.js        # Two-step: fetch data then format with Codex
|   |   +-- system-prompt.txt   # Instructions for Codex
|   |
|   |-- tools/
|   |   +-- query.js            # CLI tool with 14 PostHog query commands
|   |
|   |-- posthog/
|   |   +-- client.js           # PostHog API: retention, trends, HogQL, replays
|   |
|   |-- reports/
|   |   |-- daily.js            # Daily retention + trends report
|   |   +-- weekly.js           # Week-over-week comparison
|   |
|   +-- utils/
|       +-- dates.js            # Date helpers
|
|-- assets/
|   +-- logo.svg                # MetricLens logo
|
|-- ecosystem.config.js         # PM2 configuration
|-- deploy.ps1                  # PowerShell deploy script (Windows)
|-- deploy.sh                   # Bash deploy script (Linux/Mac)
|-- .env.example                # Environment variable template
+-- package.json                # Dependencies
```

---

## Quick Start

### Prerequisites

- **Node.js 20+**
- A **Slack workspace** where you can install apps
- A **PostHog** account with a project and personal API key
- (Optional) **OpenAI Codex CLI** for natural language queries

### 1. Clone and install

```bash
git clone https://github.com/sarvesh-official/MetricLens.git
cd MetricLens
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your tokens (see [Environment Variables](#environment-variables)).

### 3. Set up the Slack App

See [Slack App Setup](#slack-app-setup) below.

### 4. Start

```bash
# Production
npm start

# Development (auto-restart on changes)
npm run dev
```

---

## Slack App Setup

### 1. Create the app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Name it and select your workspace

### 2. Enable Socket Mode

1. **Settings → Socket Mode** → Enable
2. Create an App-Level Token with `connections:write` scope
3. Copy the `xapp-` token → this is your `SLACK_APP_TOKEN`

### 3. Add Bot Scopes

**OAuth & Permissions → Bot Token Scopes:**

| Scope | Purpose |
|---|---|
| `chat:write` | Send messages |
| `commands` | Slash commands |
| `app_mentions:read` | Respond to @mentions |
| `channels:read` | Read channel info |
| `im:history` | Read DMs |

### 4. Register Slash Commands

| Command | Description | Usage Hint |
|---|---|---|
| `/metrics` | Daily or weekly retention report | `[weekly] [share]` |
| `/report` | Full analytics report | `[churned\|features\|onboarding\|chat] [share]` |
| `/help` | Show all available commands | |

### 5. Subscribe to Events

**Event Subscriptions → Bot Events:**

| Event | Purpose |
|---|---|
| `app_mention` | Respond to @mentions |
| `message.im` | Respond to DMs |

### 6. Install to Workspace

Install the app and copy:
- **Bot User OAuth Token** (`xoxb-`) → `SLACK_BOT_TOKEN`
- **Signing Secret** → `SLACK_SIGNING_SECRET`

---

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `SLACK_BOT_TOKEN` | Bot OAuth Token | `xoxb-123...` |
| `SLACK_SIGNING_SECRET` | Signing Secret | `abc123...` |
| `SLACK_APP_TOKEN` | App-Level Token | `xapp-1-A0B...` |
| `POSTHOG_API_KEY` | Personal API key | `phx_abc...` |
| `POSTHOG_PROJECT_ID` | Project ID (from URL) | `84639` |
| `POSTHOG_HOST` | PostHog instance | `https://us.posthog.com` |
| `SLACK_REPORT_CHANNEL` | Channel for auto-reports | `posthog-alerts` |

---

## Available Commands

### Slash Commands

| Command | What it does | Visibility |
|---|---|---|
| `/metrics` | Yesterday's retention | Only you |
| `/metrics weekly` | Week-over-week comparison | Only you |
| `/metrics share` | Daily report | Everyone |
| `/report` | Full analytics report | Only you |
| `/report churned` | Churned users with emails + replay links | Only you |
| `/report features` | Feature usage breakdown | Only you |
| `/report onboarding` | Onboarding funnel | Only you |
| `/report chat` | Chat engagement | Only you |
| `/report share` | Full report | Everyone |
| `/help` | All commands and examples | Only you |

### Natural Language (via @mention or DM)

| Example | What it does |
|---|---|
| *"How many active users do we have?"* | DAU, WAU, MAU with stickiness ratio |
| *"What features are people using?"* | Usage counts for chat, canvas, PDF, voice, lessons |
| *"How's onboarding going?"* | Funnel: started → completed with drop-off rate |
| *"Who stopped using the app?"* | Churned users with emails, last seen, replay links |
| *"Which pages get the most traffic?"* | Top pages by views and unique visitors |
| *"Where are our users from?"* | Geographic breakdown by country |
| *"How's chat engagement this week?"* | Daily sessions, messages, unique chatters |
| *"Compare this week with last week"* | Retention + trends with % changes |
| *"Give me a full overview"* | Everything in one shot |
| *"Show users who onboarded last week but haven't come back"* | Custom cross-referenced query |

### Query Tool (CLI)

```bash
node src/tools/query.js retention                    # Day-1 retention
node src/tools/query.js trends                       # Page view trends
node src/tools/query.js active-users                 # DAU / WAU / MAU
node src/tools/query.js features                     # Feature usage
node src/tools/query.js onboarding                   # Onboarding funnel
node src/tools/query.js churned                      # Churn rate
node src/tools/query.js churned-details              # Churned users with emails
node src/tools/query.js full-report                  # Everything
node src/tools/query.js error-sessions               # Sessions with console errors
node src/tools/query.js top-pages                    # Most visited pages
node src/tools/query.js users-by-country             # Geographic breakdown
node src/tools/query.js users-by-device              # Device/browser breakdown
node src/tools/query.js chat-engagement              # Chat metrics
node src/tools/query.js compare-weeks                # Week-over-week
```

---

## EC2 Deployment

### One-Command Deploy

```powershell
# Windows (PowerShell)
.\deploy.ps1 <EC2_IP>

# Linux / macOS
bash deploy.sh <EC2_IP>
```

The script handles: SSH connection → code upload → npm install → PM2 start/restart.

### First-Time EC2 Setup

```bash
# SSH into EC2
ssh -i ~/.ssh/your-key.pem ubuntu@<EC2_IP>

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install -g pm2

# Install Codex CLI (for natural language features)
npm install -g @openai/codex

# After deploying, start the bot
cd ~/MetricLens
pm2 start ecosystem.config.js
pm2 save
```

### PM2 Commands

```bash
pm2 status                        # Check status
pm2 logs slack-posthog-bot        # Watch logs
pm2 restart slack-posthog-bot     # Restart
pm2 stop slack-posthog-bot        # Stop
```

---

## Cron Schedule

| Report | UTC | IST | Day |
|---|---|---|---|
| Daily Retention | 09:00 | 2:30 PM | Every day |
| Weekly Comparison | 09:30 | 3:00 PM | Monday |

---

## How Codex Integration Works

### Two-Step Mode (slash commands, cron)

```
/report → Query tool fetches JSON (2-5s) → Codex formats to English (20-30s) → Slack
```

Data fetching is reliable (no AI). Codex only formats. If Codex fails, fallback formatting kicks in.

### Full NL Mode (mentions, DMs)

```
"How's onboarding?" → Codex reads question → Codex runs query tool → Codex writes summary → Slack
```

Codex gets a system prompt with all available commands and decides which to run.

---

## Contributing

1. Fork the repo
2. Create a branch: `git checkout -b feature/my-feature`
3. Make changes and test with `npm run dev`
4. Commit and open a PR

### Adding a New Query Command

1. Add the HogQL query in `src/tools/query.js`
2. Add a `case` to the `switch` in `main()`
3. Update `printHelp()`
4. Add mapping in `src/codex/system-prompt.txt`
5. (Optional) Add a `/report` subcommand
6. (Optional) Add a loading message in `pickLoadingText()`

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  <img src="assets/logo.svg" width="40" />
  <br/>
  <strong>MetricLens</strong> — See your metrics clearly.
  <br/>
  <sub>Built with PostHog, OpenAI Codex, and Slack.</sub>
</p>
