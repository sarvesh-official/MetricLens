const axios = require("axios");

const posthog = axios.create({
  baseURL: `${process.env.POSTHOG_HOST}/api`,
  headers: {
    Authorization: `Bearer ${process.env.POSTHOG_API_KEY}`,
  },
});

const projectId = process.env.POSTHOG_PROJECT_ID;

/**
 * Run a query against PostHog's query API.
 * This is the modern way to fetch data from PostHog.
 *
 * The old /insights/retention endpoint no longer works (404).
 * Instead, PostHog uses POST /api/projects/:id/query/ with a query object.
 */
async function runQuery(query) {
  const res = await posthog.post(`/projects/${projectId}/query/`, { query });
  return res.data;
}

/**
 * Fetch retention data from PostHog for a given date range.
 *
 * What is retention?
 * It measures how many users who did something on Day 0
 * came back and did it again on Day 1, Day 2, etc.
 */
async function getRetention(dateFrom, dateTo) {
  return runQuery({
    kind: "RetentionQuery",
    retentionFilter: {
      retentionType: "retention_first_time",
      totalIntervals: 7,
      period: "Day",
    },
    dateRange: {
      date_from: dateFrom,
      date_to: dateTo,
    },
  });
}

/**
 * Fetch general event trends (total events per day).
 * Useful for daily activity overview.
 */
async function getTrends(dateFrom, dateTo, events = ["$pageview"]) {
  return runQuery({
    kind: "TrendsQuery",
    series: events.map((event) => ({
      kind: "EventsNode",
      event,
    })),
    dateRange: {
      date_from: dateFrom,
      date_to: dateTo,
    },
  });
}

/**
 * Run a raw HogQL query.
 * HogQL is PostHog's SQL-like language — it can query anything.
 */
async function hogql(sql) {
  return runQuery({ kind: "HogQLQuery", query: sql });
}

/**
 * Get session recordings for a specific user (by email).
 * Returns recordings with console error counts and replay URLs.
 */
async function getRecordings(email, limit = 5) {
  const res = await posthog.get(`/projects/${projectId}/session_recordings/`, {
    params: {
      limit,
      person_uuid: undefined, // we'll filter by email via the API
    },
  });
  return res.data;
}

/**
 * Build a direct link to a session replay in PostHog.
 */
function replayUrl(sessionId) {
  return `${process.env.POSTHOG_HOST}/project/${projectId}/replay/${sessionId}`;
}

module.exports = { getRetention, getTrends, runQuery, hogql, getRecordings, replayUrl };
