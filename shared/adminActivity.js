const counters = [
  ['sales', 'Paid sales', '/admin/purchases'], ['views', 'Profile views', '/admin'],
  ['exchanges', 'Persona exchanges', '/admin/questions'], ['enquiries', 'Enquiries', '/admin/enquiries'],
];
const count = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
export function activitySummary({ since, asOf, previous, current = {} } = {}) {
  const metrics = counters.map(([key, label, href]) => ({ key, label, href, current: count(current[key]), increase: since && previous ? Math.max(0, count(current[key]) - count(previous[key])) : 0 }));
  const revenue = (current.revenue || []).map(row => ({ currency: row.currency, current: Number(row.net), increase: since && previous ? Number(row.net) - Number(previous.revenue?.find(old => old.currency === row.currency)?.net || 0) : 0 }));
  return { since: since || null, asOf, metrics, revenue, hasChanges: Boolean(since && previous && (metrics.some(row => row.increase > 0) || revenue.some(row => row.increase !== 0))) };
}
export function analyticsPanels(report = {}) {
  const snapshot = report.snapshot || {};
  return {
    metrics: counters.map(([key, label, href]) => ({ label, value: count(snapshot[key]), href })),
    revenue: (snapshot.revenue || []).filter(row => /^[A-Z]{3}$/.test(row.currency) && Number.isSafeInteger(Number(row.net))).map(row => ({ currency: row.currency, net: Number(row.net) })),
    dailySales: (report.dailySales || []).slice(-30).map(row => ({ day: String(row.day).slice(0, 10), sales: count(row.sales) })),
    asOf: report.asOf, since: report.since,
  };
}
