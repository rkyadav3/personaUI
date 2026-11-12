export const CONTENT_TABS = [
  { id: 'posts', label: 'Articles', icon: 'pen' },
  { id: 'templates', label: 'Templates', icon: 'template' },
  { id: 'topics', label: 'Research topics', icon: 'layers' },
];
export function contentTab(pathname, search = '', fallback = 'posts') {
  const requested = new URLSearchParams(search).get('tab');
  if (pathname.startsWith('/admin/topics')) return 'topics';
  if (/^\/admin\/writing\/[^/]+/.test(pathname)) return 'posts';
  const defaultTab = pathname === '/admin/templates' ? 'templates' : fallback;
  return CONTENT_TABS.some(tab => tab.id === requested) ? requested : defaultTab;
}
export const contentHref = tab => `/admin/writing?tab=${CONTENT_TABS.some(item => item.id === tab) ? tab : 'posts'}`;
