const count = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

/** Rank only this profile's visible catalog; untracked items retain their Store order. */
export function popularChatProducts(products) {
  return [...products].sort((a, b) =>
    count(b.clicks) - count(a.clicks) || count(b.views) - count(a.views) || count(b.ratingCount) - count(a.ratingCount)
  ).slice(0, 3);
}
