export const HOME_DEFAULTS = {
  siteName: '', eyebrow: 'CREATIVE & TECHNOLOGY LEADERS', headline: 'Meet industry’s', highlight: 'top-rated', headlineEnd: 'professionals',
  subtitle: 'Discover experts, builders and thought leaders. Explore their work and find your next collaboration.',
  searchPlaceholder: 'Search profiles, expertise, or industries…', profilesTitle: '', profilesDescription: '', productsTitle: 'Top Products',
  footer: 'Discover people. Explore possibilities.', accent: '#168032', background: '#ffffff', showFeatured: true, showProducts: true, showInviteLink: true, defaultSort: 'rated',
};
export const HOME_TEXT_LIMITS = { siteName: 80, eyebrow: 100, headline: 100, highlight: 80, headlineEnd: 100, subtitle: 400, searchPlaceholder: 120, profilesTitle: 100, profilesDescription: 300, productsTitle: 100, footer: 200 };
export function normalizeHomeSettings(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}, settings = { ...HOME_DEFAULTS };
  for (const [key, max] of Object.entries(HOME_TEXT_LIMITS)) if (typeof source[key] === 'string') settings[key] = source[key].trim().slice(0, max);
  for (const key of ['accent', 'background']) if (/^#[0-9a-f]{6}$/i.test(source[key])) settings[key] = source[key];
  for (const key of ['showFeatured', 'showProducts', 'showInviteLink']) if (typeof source[key] === 'boolean') settings[key] = source[key];
  if (['rated', 'views', 'new', 'name'].includes(source.defaultSort)) settings.defaultSort = source.defaultSort;
  return settings;
}
