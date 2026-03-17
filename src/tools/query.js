#!/usr/bin/env node

/**
 * CLI tool for querying PostHog data.
 * Codex calls this to fetch data, then formats it for Slack.
 *
 * Commands:
 *   retention [--from DATE] [--to DATE]     Day-1 retention cohorts
 *   trends [--from DATE] [--to DATE]        Event trends ($pageview)
 *   compare-weeks                           This week vs last week
 *   active-users                            DAU / WAU / MAU counts
 *   features                                Feature usage breakdown
 *   onboarding                              Onboarding funnel (started → completed)
 *   churned                                 Users active last week but gone this week
 *   top-pages [--limit N]                   Most visited pages
 *   users-by-country                        User breakdown by country
 *   users-by-device                         User breakdown by device type
 *   chat-engagement                         Chat sessions and messages per day
 *   help                                    Show all commands
 *
 * Output is always JSON — Codex reads this and writes a human summary.
 */

require("dotenv").config();

const { getRetention, getTrends, hogql, replayUrl } = require("../posthog/client");
const axios = require("axios");
const { formatDate, yesterday, startOfWeek, endOfWeek, weeksAgo } = require("../utils/dates");

const args = process.argv.slice(2);
const command = args[0];

function getArg(name, fallback) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

async function main() {
  switch (command) {
    case "retention":
      return await cmdRetention();
    case "trends":
      return await cmdTrends();
    case "compare-weeks":
      return await cmdCompareWeeks();
    case "active-users":
      return await cmdActiveUsers();
    case "features":
      return await cmdFeatures();
    case "onboarding":
      return await cmdOnboarding();
    case "churned":
      return await cmdChurned();
    case "churned-details":
      return await cmdChurnedDetails();
    case "full-report":
      return await cmdFullReport();
    case "error-sessions":
      return await cmdErrorSessions();
    case "top-pages":
      return await cmdTopPages();
    case "users-by-country":
      return await cmdUsersByCountry();
    case "users-by-device":
      return await cmdUsersByDevice();
    case "chat-engagement":
      return await cmdChatEngagement();
    case "help":
    default:
      return printHelp();
  }
}

// ─── retention ───────────────────────────────────────────────
async function cmdRetention() {
  const from = getArg("--from", formatDate(weeksAgo(1)));
  const to = getArg("--to", formatDate(yesterday()));

  const data = await getRetention(from, to);
  const cohorts = (data.results || []).map((c) => {
    const total = c.values?.[0]?.count || 0;
    const retained = c.values?.[1]?.count || 0;
    return {
      date: (c.date || "").split("T")[0],
      new_users: total,
      returned_next_day: retained,
      day1_retention_pct: total > 0 ? +((retained / total) * 100).toFixed(1) : 0,
    };
  });

  const rates = cohorts.filter((c) => c.new_users > 0).map((c) => c.day1_retention_pct);
  const avg = rates.length ? +(rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(1) : 0;

  output({ command: "retention", from, to, cohorts, average_day1_retention_pct: avg });
}

// ─── trends ──────────────────────────────────────────────────
async function cmdTrends() {
  const from = getArg("--from", formatDate(weeksAgo(1)));
  const to = getArg("--to", formatDate(yesterday()));

  const data = await getTrends(from, to);
  const events = (data.results || []).map((s) => ({
    event: s.label,
    total_count: s.count || 0,
    daily_data: (s.days || []).map((day, i) => ({ date: day, count: s.data?.[i] || 0 })),
  }));

  output({ command: "trends", from, to, events });
}

// ─── compare-weeks ───────────────────────────────────────────
async function cmdCompareWeeks() {
  const thisWeekStart = formatDate(weeksAgo(1, startOfWeek));
  const thisWeekEnd = formatDate(weeksAgo(1, endOfWeek));
  const lastWeekStart = formatDate(weeksAgo(2, startOfWeek));
  const lastWeekEnd = formatDate(weeksAgo(2, endOfWeek));

  const [thisRet, lastRet, thisTrends, lastTrends] = await Promise.all([
    getRetention(thisWeekStart, thisWeekEnd),
    getRetention(lastWeekStart, lastWeekEnd),
    getTrends(thisWeekStart, thisWeekEnd),
    getTrends(lastWeekStart, lastWeekEnd),
  ]);

  output({
    command: "compare-weeks",
    this_week: {
      from: thisWeekStart, to: thisWeekEnd,
      avg_day1_retention_pct: avgRetention(thisRet),
      events: (thisTrends.results || []).map((s) => ({ event: s.label, count: s.count || 0 })),
    },
    last_week: {
      from: lastWeekStart, to: lastWeekEnd,
      avg_day1_retention_pct: avgRetention(lastRet),
      events: (lastTrends.results || []).map((s) => ({ event: s.label, count: s.count || 0 })),
    },
    retention_change_pp: +(avgRetention(thisRet) - avgRetention(lastRet)).toFixed(1),
  });
}

// ─── active-users ────────────────────────────────────────────
async function cmdActiveUsers() {
  const data = await hogql(`
    SELECT
      uniqExactIf(person_id, timestamp >= now() - interval 1 day) as dau,
      uniqExactIf(person_id, timestamp >= now() - interval 7 day) as wau,
      uniqExactIf(person_id, timestamp >= now() - interval 30 day) as mau
    FROM events
    WHERE event = '$pageview' OR event = 'Application Became Active'
  `);

  const row = data.results?.[0] || [0, 0, 0];
  output({
    command: "active-users",
    daily_active_users: row[0],
    weekly_active_users: row[1],
    monthly_active_users: row[2],
    stickiness_dau_mau: row[2] > 0 ? +((row[0] / row[2]) * 100).toFixed(1) : 0,
  });
}

// ─── features ────────────────────────────────────────────────
async function cmdFeatures() {
  const data = await hogql(`
    SELECT
      event,
      count() as usage_count,
      uniqExact(person_id) as unique_users
    FROM events
    WHERE timestamp >= now() - interval 7 day
      AND event IN (
        'chat_message_sent', 'chat_session_started', 'chat_session_ended',
        'feature_canvas_opened', 'feature_image_uploaded',
        'feature_pdf_uploaded', 'feature_voice_used',
        'lesson_accessed', 'lesson_unlocked',
        'live_consult_ondemand_started',
        'credits_deducted'
      )
    GROUP BY event
    ORDER BY usage_count DESC
  `);

  const features = (data.results || []).map((r) => ({
    feature: friendlyName(r[0]),
    event_name: r[0],
    usage_count: r[1],
    unique_users: r[2],
  }));

  output({ command: "features", period: "last 7 days", features });
}

// ─── onboarding ──────────────────────────────────────────────
async function cmdOnboarding() {
  const data = await hogql(`
    SELECT
      countIf(event = 'onboarding_started') as started,
      countIf(event = 'onboarding_completed') as completed,
      uniqExactIf(person_id, event = 'onboarding_started') as unique_started,
      uniqExactIf(person_id, event = 'onboarding_completed') as unique_completed
    FROM events
    WHERE timestamp >= now() - interval 7 day
      AND event IN ('onboarding_started', 'onboarding_completed')
  `);

  const row = data.results?.[0] || [0, 0, 0, 0];
  const completionRate = row[2] > 0 ? +((row[3] / row[2]) * 100).toFixed(1) : 0;

  output({
    command: "onboarding",
    period: "last 7 days",
    started: row[0],
    completed: row[1],
    unique_users_started: row[2],
    unique_users_completed: row[3],
    completion_rate_pct: completionRate,
    drop_off_pct: +(100 - completionRate).toFixed(1),
  });
}

// ─── churned ─────────────────────────────────────────────────
async function cmdChurned() {
  // Lightweight approach: count users per week, then compare
  // Avoids the heavy NOT IN subquery that causes 504 timeouts
  const data = await hogql(`
    SELECT
      uniqExactIf(person_id, timestamp >= now() - interval 14 day AND timestamp < now() - interval 7 day) as active_last_week,
      uniqExactIf(person_id, timestamp >= now() - interval 7 day) as active_this_week,
      uniqExactIf(person_id,
        timestamp >= now() - interval 14 day AND timestamp < now() - interval 7 day
        AND person_id NOT IN (
          SELECT person_id FROM events WHERE timestamp >= now() - interval 7 day
        )
      ) as churned
    FROM events
    WHERE timestamp >= now() - interval 14 day
  `);

  const row = data.results?.[0] || [0, 0, 0];

  // If the NOT IN subquery times out, estimate churn from the two counts
  const activeLastWeek = row[0];
  const activeThisWeek = row[1];
  let churned = row[2];

  // If churned is 0 but users dropped, estimate it
  if (churned === 0 && activeLastWeek > activeThisWeek) {
    churned = activeLastWeek - activeThisWeek;
  }

  const churnRate = activeLastWeek > 0 ? +((churned / activeLastWeek) * 100).toFixed(1) : 0;

  output({
    command: "churned",
    active_last_week: activeLastWeek,
    active_this_week: activeThisWeek,
    churned_users: churned,
    churn_rate_pct: churnRate,
    note: "Churned = users active last week who did not return this week",
  });
}

// ─── churned-details ─────────────────────────────────────────
async function cmdChurnedDetails() {
  const limit = parseInt(getArg("--limit", "20"), 10);
  const from = getArg("--from", "14");  // days ago for "active" period
  const to = getArg("--to", "7");       // days ago for "gone" period

  // Get churned users with their last session ID for replay links
  const data = await hogql(`
    SELECT
      person.properties.email as email,
      person.properties.first_name as name,
      max(timestamp) as last_seen,
      count() as total_events,
      person.properties.$geoip_country_name as country,
      argMax(properties.$session_id, timestamp) as last_session_id
    FROM events
    WHERE timestamp >= now() - interval ${from} day
      AND timestamp < now() - interval ${to} day
      AND person_id NOT IN (
        SELECT person_id FROM events WHERE timestamp >= now() - interval ${to} day
      )
      AND person.properties.email IS NOT NULL
      AND person.properties.email != ''
    GROUP BY email, name, country
    ORDER BY total_events DESC
    LIMIT ${limit}
  `);

  // Also get error counts for these churned users' sessions
  const users = (data.results || []).map((r) => {
    const sessionId = r[5];
    return {
      email: r[0],
      name: r[1] || "(no name)",
      last_seen: r[2],
      events_during_active_period: r[3],
      country: r[4] || "Unknown",
      last_session_replay: sessionId ? replayUrl(sessionId) : null,
    };
  });

  output({
    command: "churned-details",
    period: `Active ${from}-${to} days ago, gone last ${to} days`,
    total_found: users.length,
    posthog_replay_note: "Click the replay links to watch what the user did in their last session",
    users,
  });
}

// ─── error-sessions ──────────────────────────────────────────
async function cmdErrorSessions() {
  const limit = parseInt(getArg("--limit", "10"), 10);
  const host = process.env.POSTHOG_HOST;
  const key = process.env.POSTHOG_API_KEY;
  const pid = process.env.POSTHOG_PROJECT_ID;

  // Fetch recent session recordings (API doesn't support sorting by error count)
  const res = await axios.get(`${host}/api/projects/${pid}/session_recordings/`, {
    headers: { Authorization: `Bearer ${key}` },
    params: { limit: 50 },
  });

  const sessions = (res.data.results || [])
    .filter((r) => r.console_error_count > 0)
    .sort((a, b) => b.console_error_count - a.console_error_count)
    .slice(0, limit)
    .map((r) => ({
      user: r.person?.properties?.email || r.person?.properties?.first_name || "anonymous",
      console_errors: r.console_error_count,
      duration_sec: r.recording_duration,
      date: r.start_time?.split("T")[0],
      replay_link: replayUrl(r.id),
    }));

  output({
    command: "error-sessions",
    period: "recent sessions",
    total_with_errors: sessions.length,
    note: "Click replay links to watch the session and see console errors in PostHog",
    sessions,
  });
}

// ─── full-report ─────────────────────────────────────────────
async function cmdFullReport() {
  // Run multiple queries in parallel for a comprehensive report
  const [activeData, retData, featData, onbData, churnData, chatData] = await Promise.all([
    hogql(`
      SELECT
        uniqExactIf(person_id, timestamp >= now() - interval 1 day) as dau,
        uniqExactIf(person_id, timestamp >= now() - interval 7 day) as wau,
        uniqExactIf(person_id, timestamp >= now() - interval 30 day) as mau
      FROM events
      WHERE event = '$pageview' OR event = 'Application Became Active'
    `),
    getRetention(formatDate(weeksAgo(1)), formatDate(yesterday())),
    hogql(`
      SELECT event, count() as cnt, uniqExact(person_id) as users
      FROM events
      WHERE timestamp >= now() - interval 7 day
        AND event IN ('chat_message_sent','feature_image_uploaded','feature_canvas_opened','feature_voice_used','feature_pdf_uploaded','lesson_accessed','live_consult_ondemand_started')
      GROUP BY event ORDER BY cnt DESC
    `),
    hogql(`
      SELECT
        countIf(event = 'onboarding_started') as started,
        countIf(event = 'onboarding_completed') as completed,
        uniqExactIf(person_id, event = 'onboarding_started') as u_started,
        uniqExactIf(person_id, event = 'onboarding_completed') as u_completed
      FROM events
      WHERE timestamp >= now() - interval 7 day
        AND event IN ('onboarding_started', 'onboarding_completed')
    `),
    hogql(`
      SELECT
        uniqExactIf(person_id, timestamp >= now() - interval 14 day AND timestamp < now() - interval 7 day) as last_week,
        uniqExactIf(person_id, timestamp >= now() - interval 7 day) as this_week
      FROM events WHERE timestamp >= now() - interval 14 day
    `),
    hogql(`
      SELECT
        countIf(event = 'chat_message_sent') as messages,
        countIf(event = 'chat_session_started') as sessions,
        uniqExactIf(person_id, event = 'chat_message_sent') as chatters
      FROM events
      WHERE timestamp >= now() - interval 7 day
        AND event IN ('chat_message_sent', 'chat_session_started')
    `),
  ]);

  const active = activeData.results?.[0] || [0, 0, 0];
  const retCohorts = (retData.results || []).map((c) => {
    const total = c.values?.[0]?.count || 0;
    const retained = c.values?.[1]?.count || 0;
    return total > 0 ? (retained / total) * 100 : null;
  }).filter((r) => r !== null);
  const avgRet = retCohorts.length ? +(retCohorts.reduce((a, b) => a + b, 0) / retCohorts.length).toFixed(1) : 0;
  const features = (featData.results || []).map((r) => ({ feature: friendlyName(r[0]), count: r[1], users: r[2] }));
  const onb = onbData.results?.[0] || [0, 0, 0, 0];
  const churn = churnData.results?.[0] || [0, 0];
  const chat = chatData.results?.[0] || [0, 0, 0];

  output({
    command: "full-report",
    period: "last 7 days",
    active_users: { dau: active[0], wau: active[1], mau: active[2] },
    retention: { avg_day1_pct: avgRet },
    features,
    onboarding: {
      started: onb[2], completed: onb[3],
      completion_rate_pct: onb[2] > 0 ? +((onb[3] / onb[2]) * 100).toFixed(1) : 0,
    },
    churn: {
      active_last_week: churn[0], active_this_week: churn[1],
      estimated_churned: Math.max(0, churn[0] - churn[1]),
    },
    chat: { messages: chat[0], sessions: chat[1], unique_chatters: chat[2] },
  });
}

// ─── top-pages ───────────────────────────────────────────────
async function cmdTopPages() {
  const limit = parseInt(getArg("--limit", "10"), 10);

  const data = await hogql(`
    SELECT
      properties.$current_url as page_url,
      count() as views,
      uniqExact(person_id) as unique_visitors
    FROM events
    WHERE event = '$pageview'
      AND timestamp >= now() - interval 7 day
      AND properties.$current_url IS NOT NULL
    GROUP BY page_url
    ORDER BY views DESC
    LIMIT ${limit}
  `);

  const pages = (data.results || []).map((r) => ({
    url: r[0],
    views: r[1],
    unique_visitors: r[2],
  }));

  output({ command: "top-pages", period: "last 7 days", pages });
}

// ─── users-by-country ────────────────────────────────────────
async function cmdUsersByCountry() {
  const data = await hogql(`
    SELECT
      person.properties.$geoip_country_name as country,
      uniqExact(person_id) as users,
      count() as events
    FROM events
    WHERE timestamp >= now() - interval 7 day
      AND person.properties.$geoip_country_name IS NOT NULL
      AND person.properties.$geoip_country_name != ''
    GROUP BY country
    ORDER BY users DESC
    LIMIT 15
  `);

  const countries = (data.results || []).map((r) => ({
    country: r[0],
    unique_users: r[1],
    total_events: r[2],
  }));

  output({ command: "users-by-country", period: "last 7 days", countries });
}

// ─── users-by-device ─────────────────────────────────────────
async function cmdUsersByDevice() {
  const data = await hogql(`
    SELECT
      person.properties.$device_type as device,
      person.properties.$browser as browser,
      uniqExact(person_id) as users
    FROM events
    WHERE timestamp >= now() - interval 7 day
      AND person.properties.$device_type IS NOT NULL
    GROUP BY device, browser
    ORDER BY users DESC
    LIMIT 15
  `);

  const devices = (data.results || []).map((r) => ({
    device: r[0],
    browser: r[1],
    unique_users: r[2],
  }));

  output({ command: "users-by-device", period: "last 7 days", devices });
}

// ─── chat-engagement ─────────────────────────────────────────
async function cmdChatEngagement() {
  const data = await hogql(`
    SELECT
      toDate(timestamp) as day,
      countIf(event = 'chat_session_started') as sessions_started,
      countIf(event = 'chat_message_sent') as messages_sent,
      uniqExactIf(person_id, event = 'chat_message_sent') as unique_chatters
    FROM events
    WHERE timestamp >= now() - interval 7 day
      AND event IN ('chat_session_started', 'chat_message_sent')
    GROUP BY day
    ORDER BY day
  `);

  const days = (data.results || []).map((r) => ({
    date: r[0],
    sessions_started: r[1],
    messages_sent: r[2],
    unique_chatters: r[3],
  }));

  const totalMessages = days.reduce((s, d) => s + d.messages_sent, 0);
  const totalSessions = days.reduce((s, d) => s + d.sessions_started, 0);

  output({
    command: "chat-engagement",
    period: "last 7 days",
    total_messages: totalMessages,
    total_sessions: totalSessions,
    daily_breakdown: days,
  });
}

// ─── helpers ─────────────────────────────────────────────────

function avgRetention(data) {
  const rates = (data.results || [])
    .map((c) => {
      const total = c.values?.[0]?.count || 0;
      const retained = c.values?.[1]?.count || 0;
      return total > 0 ? (retained / total) * 100 : null;
    })
    .filter((r) => r !== null);
  return rates.length ? +(rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(1) : 0;
}

function friendlyName(event) {
  const map = {
    chat_message_sent: "Chat Messages",
    chat_session_started: "Chat Sessions Started",
    chat_session_ended: "Chat Sessions Ended",
    feature_canvas_opened: "Canvas Opened",
    feature_image_uploaded: "Image Uploads",
    feature_pdf_uploaded: "PDF Uploads",
    feature_voice_used: "Voice Feature",
    lesson_accessed: "Lessons Viewed",
    lesson_unlocked: "Lessons Unlocked",
    live_consult_ondemand_started: "Live Consultations",
    credits_deducted: "Credits Used",
  };
  return map[event] || event;
}

function output(data) {
  console.log(JSON.stringify(data, null, 2));
}

function printHelp() {
  console.log(`
PostHog Query Tool
==================
Commands:
  retention [--from DATE] [--to DATE]   Day-1 retention cohorts
  trends [--from DATE] [--to DATE]      Event trends ($pageview)
  compare-weeks                         This week vs last week comparison
  active-users                          DAU / WAU / MAU counts
  features                              Feature usage breakdown (last 7d)
  onboarding                            Onboarding funnel completion rate
  churned                               Users who left this week
  churned-details [--limit N]           List churned users with emails
  full-report                           Comprehensive report (everything)
  top-pages [--limit N]                 Most visited pages (default top 10)
  users-by-country                      User breakdown by country
  users-by-device                       User breakdown by device/browser
  chat-engagement                       Chat sessions & messages per day
  help                                  Show this message
  `.trim());
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
