export const ADMIN_SECTIONS = [
  { id: 'profile', label: 'Public profile', icon: 'globe', description: 'Build your public page and manage what you offer.', pages: [
    { id: 'editor', label: 'Page editor', to: '/admin/portfolio', icon: 'template' },
    { id: 'details', label: 'Profile & offerings', to: '/admin/profile', icon: 'users' },
  ] },
  { id: 'content', label: 'Content', icon: 'pen', description: 'Write articles, reuse templates and organize research topics.', pages: [
    { id: 'articles', label: 'Articles', to: '/admin/writing?tab=posts', icon: 'pen' },
    { id: 'templates', label: 'Templates', to: '/admin/templates', icon: 'template' },
    { id: 'topics', label: 'Research topics', to: '/admin/topics', icon: 'layers' },
  ] },
  { id: 'library', label: 'Library', icon: 'folder', description: 'Store source material and check what your AI can search.', pages: [
    { id: 'files', label: 'Files & notes', to: '/admin/files', icon: 'folder' },
    { id: 'knowledge', label: 'AI knowledge', to: '/admin/knowledge', icon: 'book' },
  ] },
  { id: 'activity', label: 'Activity', icon: 'chart', description: 'Manage events, purchases and conversations from your public page.', pages: [
    { id: 'updates', label: 'Events & updates', to: '/admin/updates', icon: 'calendar' },
    { id: 'purchases', label: 'Purchases', to: '/admin/purchases', icon: 'box' },
    { id: 'enquiries', label: 'Enquiries', to: '/admin/enquiries', icon: 'email' },
    { id: 'questions', label: 'Visitor Q&A', to: '/admin/questions', icon: 'chat' },
  ] },
  { id: 'administration', label: 'Administration', icon: 'shield', adminOnly: true, description: 'Manage accounts and access to Studio.', pages: [
    { id: 'users', label: 'People', to: '/admin/superadmin', icon: 'users' },
    { id: 'invites', label: 'Invite links', to: '/admin/superadmin?tab=invites', icon: 'email' },
  ] },
];

export function adminLocation(pathname, search = '') {
  const path = pathname.replace(/\/+$/, ''), tab = new URLSearchParams(search).get('tab');
  const route = path.split('/')[2];
  const routes = {
    portfolio: ['profile', 'editor'], profile: ['profile', 'details'],
    writing: ['content', path === '/admin/writing' && tab === 'templates' ? 'templates' : 'articles'],
    templates: ['content', tab === 'posts' ? 'articles' : 'templates'], topics: ['content', 'topics'],
    files: ['library', 'files'], add: ['library', 'files'], knowledge: ['library', 'knowledge'],
    updates: ['activity', 'updates'], purchases: ['activity', 'purchases'], enquiries: ['activity', 'enquiries'], questions: ['activity', 'questions'],
    superadmin: ['administration', tab === 'invites' ? 'invites' : 'users'], invites: ['administration', 'invites'], users: ['administration', 'users'],
  };
  if (!path.startsWith('/admin/') || !routes[route]) return null;
  const [group, page] = routes[route];
  return { group, page };
}
