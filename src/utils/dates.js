/**
 * Date utility helpers.
 * All dates are in YYYY-MM-DD format, which PostHog expects.
 */

function formatDate(date) {
  return date.toISOString().split("T")[0];
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); // Go back to Monday
  return d;
}

function endOfWeek(date) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6); // Monday + 6 = Sunday
  return d;
}

/**
 * Get a date N weeks ago, then apply a transform function.
 * Example: weeksAgo(1, startOfWeek) → start of last week
 */
function weeksAgo(n, transformFn) {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  return transformFn ? transformFn(d) : d;
}

module.exports = { formatDate, yesterday, startOfWeek, endOfWeek, weeksAgo };
