import { bayes } from '../../shared/ranking.js';
import { fmtPrice } from './money.js';
const text = values => values.filter(Boolean).join(' ').toLocaleLowerCase();
const newest = (a, b) => String(b.joined || b.createdAt || '').localeCompare(String(a.joined || a.createdAt || ''));
function rank(items) {
  const count = items.reduce((n, item) => n + (item.ratingCount || 0), 0);
  const mean = count ? items.reduce((n, item) => n + (item.ratingAvg || 0) * (item.ratingCount || 0), 0) / count : 0;
  const score = item => item.ratingCount > 0 ? bayes(item.ratingAvg || 0, item.ratingCount, mean) : 0;
  return [...items].sort((a, b) => Number(b.ratingCount >= 5) - Number(a.ratingCount >= 5) || score(b) - score(a) || (b.views || 0) - (a.views || 0) || (b.clicks || 0) - (a.clicks || 0) || newest(a, b) || String(a.name || a.title || '').localeCompare(String(b.name || b.title || '')));
}
export function directoryModel(feed = {}, {
  query = '',
  sort = 'rated'
} = {}) {
  const needle = String(query).trim().toLocaleLowerCase(),
    source = feed.products || feed.offers || [];
  const productText = new Map();
  for (const product of source) productText.set(product.slug, `${productText.get(product.slug) || ''} ${text([product.title, product.description, product.category, product.typeLabel])}`);
  const ownText = member => text([member.name, member.designation, member.purpose, member.location, ...(member.expertise || []), ...(member.categories || [])]);
  const members = (feed.members || []).filter(member => !needle || `${ownText(member)} ${productText.get(member.slug) || ''}`.includes(needle));
  const matching = new Set(members.filter(member => !needle || ownText(member).includes(needle)).map(member => member.slug));
  const products = source.filter(product => !needle || matching.has(product.slug) || text([product.title, product.description, product.member, product.category, product.typeLabel]).includes(needle));
  const sorted = sort === 'name' ? [...members].sort((a, b) => a.name.localeCompare(b.name)) : sort === 'views' ? [...members].sort((a, b) => (b.views || 0) - (a.views || 0) || newest(a, b)) : sort === 'new' ? [...members].sort(newest) : rank(members);
  return {
    members: sorted,
    products: rank(products),
    featured: sorted[0] || null,
    hasReviews: members.some(member => member.ratingCount > 0),
    filtering: !!needle
  };
}
export function checkoutItem(product) {
  return {
    ...product,
    summary: product.description || '',
    amount: product.pricing === 'free' ? 0 : product.price,
    price: fmtPrice(product),
    url: product.link || '',
    checkout: ['free', 'paid'].includes(product.pricing) ? {
      kind: product.kind || 'offering',
      id: String(product.id)
    } : null
  };
}
export function applyHomeRating(feed, product, result) {
  if (!feed) return feed;
  const same = item => (item.kind || 'offering') === 'offering' && String(item.id) === String(product.id);
  const previous = (feed.products || feed.offers || []).find(same) || product;
  const patch = item => same(item) ? {
    ...item,
    ratingAvg: result.avg,
    ratingCount: result.count
  } : item;
  const members = (feed.members || []).map(member => {
    if (member.slug !== product.slug) return member;
    const count = Math.max(0, (member.ratingCount || 0) - (previous.ratingCount || 0) + result.count);
    const total = (member.ratingAvg || 0) * (member.ratingCount || 0) - (previous.ratingAvg || 0) * (previous.ratingCount || 0) + result.avg * result.count;
    return {
      ...member,
      ratingCount: count,
      ratingAvg: count ? Math.round(total / count * 10) / 10 : 0
    };
  });
  return {
    ...feed,
    members,
    products: (feed.products || feed.offers || []).map(patch),
    ...(feed.offers ? {
      offers: feed.offers.map(patch)
    } : {})
  };
}
