export const EDITOR_TABS = {
  home: { hero: 'Introduction', numbers: 'Numbers', about: 'About' },
  activity: { projects: 'Layout & visibility' },
  store: { store: 'Layout & display' },
  chat: { persona: 'Chat settings' },
  contact: { contact: 'Contact settings' },
  appearance: { look: 'Appearance', design: 'Navigation & footer' },
};
export const EDITOR_AREAS = { home: 'Home', activity: 'Activity', store: 'Store', chat: 'Chat', contact: 'Contact', appearance: 'Appearance' };
export const EDITOR_PREVIEW = { hero: 'home', numbers: 'home', about: 'home', projects: 'activity', talks: 'talks', recognition: 'activity', certificates: 'activity', testimonials: 'activity', experience: 'experience', products: 'store', store: 'store', persona: 'chat', contact: 'contact', look: 'home', design: 'home' };

export function readSettingsTab(value) {
  if (value === 'visibility') return 'privacy';
  if (value === 'settings') return 'payments';
  if (value === 'privacy' || value === 'payments' || Object.hasOwn(EDITOR_PREVIEW, value)) return value;
  return 'hero';
}

/** Old bookmarks retain their editor selection and query context in the single Settings page. */
export function settingsHref(search = '', tab) {
  const params = new URLSearchParams(search);
  const value = tab || params.get('tab');
  params.set('tab', readSettingsTab(value));
  return `/admin/settings?${params}`;
}
