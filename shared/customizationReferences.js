import { normalizePortfolio } from './portfolio.js';
export function customizationReferences(portfolio, offerings = []) {
  const p = normalizePortfolio(portfolio);
  return {
    homeFeaturedItems: [...p.products.map(row => ({ id: `product:${row.id}`, title: row.title })), ...offerings.map(row => ({ id: `offering:${row.id}`, title: row.title }))],
    homeAwards: [...p.awards.map(row => ({ id: `highlight:${row.id}`, title: row.title || row.sub })), ...p.recognition.flatMap(row => row.kind === 'award' ? [{ id: `recognition:${row.id}`, title: row.title }] : [])],
  };
}
export function resolveHomeAwards(portfolio, selections) {
  const p = normalizePortfolio(portfolio);
  return selections.map(ref => { const [kind, id] = ref.split(':'); return kind === 'highlight' ? p.awards.find(row => row.id === id) : kind === 'recognition' ? p.recognition.find(row => row.id === id && row.kind === 'award') : null; }).filter(Boolean).map(row => ({ ...row, sub: row.sub || row.issuer }));
}
