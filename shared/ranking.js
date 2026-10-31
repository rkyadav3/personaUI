// Pure ranking for the home page rails. Used by the browser (so the category filter re-ranks instantly) and by tests.
// Item shape: { id, createdAt, views, clicks, ratingAvg, ratingCount }

const byNewest = (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
const MIN_VOTES = 5;   // a rating needs about this many votes before it can beat the platform average

/** Bayesian average: one 5-star vote cannot outrank forty 4.8s. `mean` is the average rating across the whole platform. */
export const bayes = (avg, n, mean, m = MIN_VOTES) => (n / (n + m)) * avg + (m / (n + m)) * mean;

export function buildRails(items, limit = 10) {
  const rated = items.filter(i => i.ratingCount > 0);
  const total = rated.reduce((s, i) => s + i.ratingCount, 0);
  const mean = total ? rated.reduce((s, i) => s + i.ratingAvg * i.ratingCount, 0) / total : 0;
  const top = (list, score) => [...list].sort((a, b) => score(b) - score(a) || byNewest(a, b)).slice(0, limit);
  return {
    topRated: top(rated, i => bayes(i.ratingAvg, i.ratingCount, mean)),
    mostViewed: top(items.filter(i => i.views > 0), i => i.views),
    inDemand: top(items.filter(i => i.clicks > 0), i => i.clicks),
    latest: [...items].sort(byNewest).slice(0, limit),
  };
}
