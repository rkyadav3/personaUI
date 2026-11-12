import { readSettingsTab } from './publicPageSettings.js';

export const ADMIN_SECTIONS = [
  { id: 'overview', label: 'Overview', icon: 'home', description: 'Use your assistant and catch up on activity.', pages: [{ id: 'overview', label: 'Overview', to: '/admin', icon: 'home' }] },
  { id: 'activity', label: 'Activity & Orders', icon: 'calendar', description: 'Publish your activities and manage orders, enquiries and visitor conversations.', pages: [
    { id: 'updates', label: 'Events & updates', to: '/admin/updates', icon: 'calendar' },
    { id: 'purchases', label: 'Orders', to: '/admin/purchases', icon: 'box' },
    { id: 'enquiries', label: 'Enquiries', to: '/admin/enquiries', icon: 'email' },
    { id: 'questions', label: 'Visitor Q&A', to: '/admin/questions', icon: 'chat' },
  ] },
  { id: 'offerings', label: 'Offerings', icon: 'box', description: 'Manage your offering categories, pricing and access links.', pages: [
    { id: 'categories', label: 'Offerings & categories', to: '/admin/profile?tab=contrib', icon: 'layers' },
  ] },
  { id: 'pipelines', label: 'Data Pipelines', icon: 'layers', description: 'Create source content, organize files and sync published knowledge to your persona.', pages: [
    { id: 'files', label: 'Files & notes', to: '/admin/files', icon: 'folder' },
    { id: 'articles', label: 'Articles', to: '/admin/writing?tab=posts', icon: 'pen' },
    { id: 'templates', label: 'Templates', to: '/admin/templates', icon: 'template' },
    { id: 'topics', label: 'Research topics', to: '/admin/topics', icon: 'layers' },
    { id: 'knowledge', label: 'AI knowledge', to: '/admin/knowledge', icon: 'book' },
  ] },
  { id: 'settings', label: 'Settings', icon: 'shield', description: 'Manage every public page, its appearance, privacy and checkout in one place.', pages: [
    { id: 'details', label: 'Profile', to: '/admin/profile', icon: 'users' },
    { id: 'editor', label: 'Public page editor', to: '/admin/settings', icon: 'template' },
    { id: 'visibility', label: 'Privacy', to: '/admin/settings?tab=privacy', icon: 'shield' },
    { id: 'payments', label: 'Payments', to: '/admin/settings?tab=payments', icon: 'box' },
    { id: 'invites', label: 'Invite links', to: '/admin/invites', icon: 'email' },
    { id: 'suggestions', label: 'Suggestions', to: '/admin/suggestions', icon: 'spark' },
  ] },
];
export const SUPERADMIN_SECTION = { id: 'platform', label: 'SuperAdmin', description: 'Support admins, manage sales and improve the main site.', adminOnly: true, pages: [
  { id: 'dashboard', label: 'SuperAdmin dashboard', to: '/superadmin', icon: 'chart' },
  { id: 'customers', label: 'Customers', to: '/superadmin/customers', icon: 'users' },
  { id: 'sales', label: 'Sales & payments', to: '/superadmin/sales', icon: 'box' },
  { id: 'invites', label: 'Invite links', to: '/superadmin/invites', icon: 'email' },
  { id: 'suggestions', label: 'Suggestions', to: '/superadmin/suggestions', icon: 'spark' },
  { id: 'settings', label: 'Main site settings', to: '/superadmin/settings', icon: 'template' },
] };

export function adminLocation(pathname, search = '') {
  const path = pathname.replace(/\/+$/, ''), tab = new URLSearchParams(search).get('tab');
  if (path === '/superadmin' || path.startsWith('/superadmin/')) return { group: 'platform', page: SUPERADMIN_SECTION.pages.find(page => page.to === path)?.id || 'dashboard' };
  if (path === '/admin') return { group: 'overview', page: 'overview' };
  const route = path.split('/')[2];
  const settingsTab = readSettingsTab(tab);
  const settingsPage = settingsTab === 'privacy' ? 'visibility' : settingsTab === 'payments' ? 'payments' : 'editor';
  const routes = {
    portfolio: ['settings', settingsPage], page: ['settings', 'editor'], profile: tab === 'contrib' ? ['offerings', 'categories'] : tab === 'visibility' ? ['settings', 'visibility'] : ['settings', 'details'],
    writing: ['pipelines', path === '/admin/writing' && tab === 'templates' ? 'templates' : 'articles'],
    templates: ['pipelines', tab === 'posts' ? 'articles' : 'templates'], topics: ['pipelines', 'topics'],
    files: ['pipelines', 'files'], add: ['pipelines', 'files'], knowledge: ['pipelines', 'knowledge'],
    updates: ['activity', 'updates'], purchases: ['payments', 'settings'].includes(tab) ? ['settings', 'payments'] : ['activity', 'purchases'], enquiries: tab === 'form' ? ['settings', 'editor'] : ['activity', 'enquiries'], questions: ['activity', 'questions'],
    settings: ['settings', settingsPage], superadmin: ['platform', tab === 'invites' ? 'invites' : 'customers'], invites: ['settings', 'invites'], suggestions: ['settings', 'suggestions'], users: ['platform', 'customers'],
  };
  if (!path.startsWith('/admin/') || !Object.hasOwn(routes, route)) return null;
  const [group, page] = routes[route];
  return { group, page };
}
