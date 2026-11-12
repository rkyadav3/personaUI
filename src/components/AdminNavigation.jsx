import { Link, useLocation } from 'react-router-dom';
import { ADMIN_SECTIONS, SUPERADMIN_SECTION, adminLocation } from '../lib/adminNavigation.js';
import Icon from './portfolio/Icon.jsx';

export function AdminSectionTabs({ user, unread = 0 }) {
  const { pathname, search } = useLocation();
  const active = adminLocation(pathname, search);
  const section = [...ADMIN_SECTIONS, SUPERADMIN_SECTION].find(item => item.id === active?.group);
  if (!section || section.pages.length === 1 || (section.adminOnly && !user?.isSuperAdmin)) return null;
  return <section className="admin-section-header">
    <div className="admin-section-context"><span>{section.label}</span><p>{section.description}</p></div>
    <nav className="admin-section-tabs" aria-label={`${section.label} pages`}>
      {section.pages.filter(page => !page.adminOnly || user?.isSuperAdmin).map(page => <Link key={page.id} to={page.to} aria-current={active.page === page.id ? 'page' : undefined} className={active.page === page.id ? 'active' : ''}>
        <Icon n={page.icon} size={18} />{page.label}{page.id === 'enquiries' && unread > 0 && <span className="studio-badge">{unread}</span>}
      </Link>)}
    </nav>
  </section>;
}

export function AdminQuickActions() {
  return <nav className="admin-quick-actions" aria-label="Quick actions"><Link to="/admin/profile?tab=contrib&action=add"><Icon n="plus" size={17} />Add category</Link><Link to="/admin/settings?tab=products"><Icon n="box" size={17} />Products</Link><Link to="/admin/updates"><Icon n="calendar" size={17} />Events & updates</Link><Link to="/admin/files?tab=upload"><Icon n="attachment" size={17} />Upload files</Link><Link to="/admin/purchases"><Icon n="box" size={17} />Orders</Link><Link to="/admin/enquiries"><Icon n="email" size={17} />Enquiries</Link><Link to="/admin/questions"><Icon n="chat" size={17} />Persona conversations</Link></nav>;
}
