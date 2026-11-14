import { readSettingsTab } from './publicPageSettings.js';

export const ADMIN_SECTIONS = [
  { id: 'overview', label: 'Overview', icon: 'home', description: 'Use your assistant and catch up on activity.', pages: [{ id: 'overview', label: 'Overview', to: '/admin', icon: 'home' }] },
  { id: 'store', label: 'Store', icon: 'box', description: 'Manage all products, offerings and categories.', pages: [{ id: 'catalogue', label: 'Store', to: '/admin/store', icon: 'box' }] },
  { id: 'activity', label: 'Activity', icon: 'calendar', description: 'Manage your public work and milestones.', pages: [{ id: 'records', label: 'Activity', to: '/admin/activity', icon: 'calendar' }] },
  { id: 'pipelines', label: 'Content & knowledge', icon: 'layers', description: 'Write articles, organize research, manage files and keep AI knowledge current.', pages: [
    { id: 'content', label: 'Content', to: '/admin/writing?tab=posts', icon: 'pen' },
    { id: 'files', label: 'Files & notes', to: '/admin/files', icon: 'folder' },
    { id: 'knowledge', label: 'AI knowledge', to: '/admin/knowledge', icon: 'book' },
  ] },
  { id: 'inbox', label: 'Inbox', icon: 'email', description: 'Manage orders, enquiries and visitor conversations.', pages: [
    { id: 'purchases', label: 'Orders', to: '/admin/purchases', icon: 'box' },
    { id: 'enquiries', label: 'Enquiries', to: '/admin/enquiries', icon: 'email' },
    { id: 'questions', label: 'Visitor Q&A', to: '/admin/questions', icon: 'chat' },
  ] },
  { id: 'community', label: 'Invite', icon: 'users', description: 'Invite people and track who joins the platform.', pages: [
    { id: 'invites', label: 'Invite links', to: '/admin/invites', icon: 'email' },
  ] },
  { id: 'settings', label: 'Settings', icon: 'shield', description: 'Manage your profile, public pages, privacy and checkout, or get support.', pages: [
    { id: 'details', label: 'Profile', to: '/admin/profile', icon: 'users' },
    { id: 'editor', label: 'Public page editor', to: '/admin/settings', icon: 'template' },
    { id: 'visibility', label: 'Privacy', to: '/admin/settings?tab=privacy', icon: 'shield' },
    { id: 'payments', label: 'Payments', to: '/admin/settings?tab=payments', icon: 'box' },
    { id: 'support', label: 'Support', to: '/admin/support', icon: 'chat' },
    { id: 'suggestions', label: 'Suggestions', to: '/admin/suggestions', icon: 'spark' },
  ] },
];
export const SUPERADMIN_SECTION = { id: 'platform', label: 'SuperAdmin', description: 'Support admins, manage sales and improve the main site.', adminOnly: true, pages: [
  { id: 'dashboard', label: 'SuperAdmin dashboard', to: '/superadmin', icon: 'chart' },
  { id: 'customers', label: 'Customers', to: '/superadmin/customers', icon: 'users' },
  { id: 'sales', label: 'Sales & payments', to: '/superadmin/sales', icon: 'box' },
  { id: 'invites', label: 'Invite links', to: '/superadmin/invites', icon: 'email' },
  { id: 'suggestions', label: 'Suggestions', to: '/superadmin/suggestions', icon: 'spark' },
  { id: 'support', label: 'Support', to: '/superadmin/support', icon: 'chat' },
  { id: 'settings', label: 'Main site settings', to: '/superadmin/settings', icon: 'template' },
] };

export function adminLocation(pathname, search = '') {
  const path = pathname.replace(/\/+$/, ''), tab = new URLSearchParams(search).get('tab');
  if (path === '/superadmin' || path.startsWith('/superadmin/')) return { group: 'platform', page: SUPERADMIN_SECTION.pages.find(page => page.to === path || (page.id === 'support' && path.startsWith(`${page.to}/`)))?.id || 'dashboard' };
  if (path === '/admin') return { group: 'overview', page: 'overview' };
  const route = path.split('/')[2];
  const settingsTab = readSettingsTab(tab);
  const settingsPage = settingsTab === 'privacy' ? 'visibility' : settingsTab === 'payments' ? 'payments' : 'editor';
  const routes = {
    portfolio: ['settings', settingsPage], page: ['settings', 'editor'], profile: tab === 'contrib' ? ['store', 'catalogue'] : tab === 'visibility' ? ['settings', 'visibility'] : ['settings', 'details'],
    writing: ['pipelines', 'content'], templates: ['pipelines', 'content'], topics: ['pipelines', 'content'],
    files: ['pipelines', 'files'], add: ['pipelines', 'files'], knowledge: ['pipelines', 'knowledge'],
    store: ['store', 'catalogue'], activity: ['activity', 'records'], updates: ['activity', 'records'], purchases: ['payments', 'settings'].includes(tab) ? ['settings', 'payments'] : ['inbox', 'purchases'], enquiries: tab === 'form' ? ['settings', 'editor'] : ['inbox', 'enquiries'], questions: ['inbox', 'questions'],
    settings: ['settings', settingsPage], support: ['settings', 'support'], superadmin: ['platform', tab === 'invites' ? 'invites' : 'customers'], invites: ['community', 'invites'], suggestions: ['settings', 'suggestions'], users: ['platform', 'customers'],
  };
  if (!path.startsWith('/admin/') || !Object.hasOwn(routes, route)) return null;
  const [group, page] = routes[route];
  return { group, page };
}
