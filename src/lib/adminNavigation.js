export const ADMIN_SECTIONS = [
  { id: 'overview', label: 'Overview & Dashboard & Profile', icon: 'home', description: 'Use your assistant, review your dashboard and manage your public identity.', pages: [
    { id: 'overview', label: 'Overview', to: '/admin', icon: 'home' },
    { id: 'dashboard', label: 'Dashboard', to: '/admin?tab=dashboard', icon: 'chart' },
    { id: 'details', label: 'Profile', to: '/admin/profile', icon: 'users' },
    { id: 'editor', label: 'Home & page editor', to: '/admin/portfolio?tab=hero', icon: 'template' },
    { id: 'contact', label: 'Contact page', to: '/admin/portfolio?tab=contact', icon: 'email' },
  ] },
  { id: 'activity', label: 'Activity & Orders', icon: 'calendar', description: 'Publish your activities and manage orders, enquiries and visitor conversations.', pages: [
    { id: 'projects', label: 'Projects', to: '/admin/portfolio?tab=projects', icon: 'briefcase' },
    { id: 'updates', label: 'Events & updates', to: '/admin/updates', icon: 'calendar' },
    { id: 'talks', label: 'Talks', to: '/admin/portfolio?tab=talks', icon: 'mic' },
    { id: 'recognition', label: 'Recognition & awards', to: '/admin/portfolio?tab=recognition', icon: 'trophy' },
    { id: 'certificates', label: 'Certificates', to: '/admin/portfolio?tab=certificates', icon: 'book' },
    { id: 'testimonials', label: 'Testimonials', to: '/admin/portfolio?tab=testimonials', icon: 'heart' },
    { id: 'experience', label: 'Experience', to: '/admin/portfolio?tab=experience', icon: 'briefcase' },
    { id: 'purchases', label: 'Orders', to: '/admin/purchases', icon: 'box' },
    { id: 'enquiries', label: 'Enquiries', to: '/admin/enquiries', icon: 'email' },
    { id: 'questions', label: 'Visitor Q&A', to: '/admin/questions', icon: 'chat' },
  ] },
  { id: 'offerings', label: 'Offerings', icon: 'box', description: 'Manage your offering categories, store products, pricing and access links.', pages: [
    { id: 'categories', label: 'Offerings & categories', to: '/admin/profile?tab=contrib', icon: 'layers' },
    { id: 'products', label: 'Store products', to: '/admin/portfolio?tab=products', icon: 'box' },
  ] },
  { id: 'pipelines', label: 'Data Pipelines', icon: 'layers', description: 'Create source content, organize files and sync published knowledge to your persona.', pages: [
    { id: 'files', label: 'Files & notes', to: '/admin/files', icon: 'folder' },
    { id: 'articles', label: 'Articles', to: '/admin/writing?tab=posts', icon: 'pen' },
    { id: 'templates', label: 'Templates', to: '/admin/templates', icon: 'template' },
    { id: 'topics', label: 'Research topics', to: '/admin/topics', icon: 'layers' },
    { id: 'knowledge', label: 'AI knowledge', to: '/admin/knowledge', icon: 'book' },
  ] },
  { id: 'settings', label: 'Settings', icon: 'shield', description: 'Set appearance, chat preferences, privacy and payments.', pages: [
    { id: 'look', label: 'Appearance', to: '/admin/portfolio?tab=look', icon: 'template' },
    { id: 'persona', label: 'Chat', to: '/admin/portfolio?tab=persona', icon: 'chat' },
    { id: 'visibility', label: 'Privacy', to: '/admin/profile?tab=visibility', icon: 'shield' },
    { id: 'payments', label: 'Payments', to: '/admin/purchases?tab=payments', icon: 'box' },
    { id: 'users', label: 'People', to: '/admin/superadmin', icon: 'users', adminOnly: true },
    { id: 'invites', label: 'Invite links', to: '/admin/superadmin?tab=invites', icon: 'email', adminOnly: true },
  ] },
];

export function adminLocation(pathname, search = '') {
  const path = pathname.replace(/\/+$/, ''), tab = new URLSearchParams(search).get('tab');
  if (path === '/admin') return { group: 'overview', page: tab === 'dashboard' ? 'dashboard' : 'overview' };
  const route = path.split('/')[2];
  const editorTabs = {
    projects: ['activity', 'projects'], talks: ['activity', 'talks'], recognition: ['activity', 'recognition'], certificates: ['activity', 'certificates'], testimonials: ['activity', 'testimonials'], experience: ['activity', 'experience'],
    products: ['offerings', 'products'], look: ['settings', 'look'], store: ['settings', 'look'], design: ['settings', 'look'], persona: ['settings', 'persona'], contact: ['overview', 'contact'],
  };
  const routes = {
    portfolio: Object.hasOwn(editorTabs, tab) ? editorTabs[tab] : ['overview', 'editor'], profile: tab === 'contrib' ? ['offerings', 'categories'] : tab === 'visibility' ? ['settings', 'visibility'] : ['overview', 'details'],
    writing: ['pipelines', path === '/admin/writing' && tab === 'templates' ? 'templates' : 'articles'],
    templates: ['pipelines', tab === 'posts' ? 'articles' : 'templates'], topics: ['pipelines', 'topics'],
    files: ['pipelines', 'files'], add: ['pipelines', 'files'], knowledge: ['pipelines', 'knowledge'],
    updates: ['activity', 'updates'], purchases: ['payments', 'settings'].includes(tab) ? ['settings', 'payments'] : ['activity', 'purchases'], enquiries: ['activity', 'enquiries'], questions: ['activity', 'questions'],
    settings: ['settings', 'persona'], superadmin: ['settings', tab === 'invites' ? 'invites' : 'users'], invites: ['settings', 'invites'], users: ['settings', 'users'],
  };
  if (!path.startsWith('/admin/') || !Object.hasOwn(routes, route)) return null;
  const [group, page] = routes[route];
  return { group, page };
}
