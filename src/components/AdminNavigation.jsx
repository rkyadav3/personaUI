import { Link, useLocation } from 'react-router-dom';
import { ADMIN_SECTIONS, adminLocation } from '../lib/adminNavigation.js';
import Icon from './portfolio/Icon.jsx';

export function AdminSectionTabs({ user, unread = 0 }) {
  const { pathname, search } = useLocation();
  const active = adminLocation(pathname, search);
  const section = ADMIN_SECTIONS.find(item => item.id === active?.group);
  if (!section || (section.adminOnly && !user?.isAdmin)) return null;
  return <section className="admin-section-header">
    <div className="admin-section-context"><span>{section.label}</span><p>{section.description}</p></div>
    <nav className="admin-section-tabs" aria-label={`${section.label} pages`}>
      {section.pages.map(page => <Link key={page.id} to={page.to} aria-current={active.page === page.id ? 'page' : undefined} className={active.page === page.id ? 'active' : ''}>
        <Icon n={page.icon} size={18} />{page.label}{page.id === 'enquiries' && unread > 0 && <span className="studio-badge">{unread}</span>}
      </Link>)}
    </nav>
  </section>;
}
