import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import GlassShell from './GlassShell.jsx';
import Icon from './portfolio/Icon.jsx';
import Login from '../pages/Login.jsx';
import '../styles/studio.css';

const PRIMARY = [
  { to: '/admin', label: 'Overview', icon: 'home', end: true },
  { to: '/admin/portfolio?tab=projects', label: 'Projects', icon: 'folder' },
  { to: '/admin/templates', label: 'Templates', icon: 'template' },
  { to: '/admin/files', label: 'Files & Storage', icon: 'folder' },
  { to: '/admin/knowledge', label: 'Knowledge Base', icon: 'box' },
];
const MANAGE = [
  { to: '/admin/profile', label: 'Profile & Offerings', icon: 'users' },
  { to: '/admin/updates', label: 'Updates & Schedule', icon: 'calendar' },
  { to: '/admin/purchases', label: 'Purchases', icon: 'box' },
  { to: '/admin/enquiries', label: 'Enquiries', icon: 'email', badge: true },
  { to: '/admin/writing', label: 'Writing & Posts', icon: 'pen' },
  { to: '/admin/topics', label: 'Research Topics', icon: 'layers' },
];

function StudioMark() {
  return <svg width="25" height="25" viewBox="0 0 28 28" aria-hidden="true"><path fill="#17ad55" d="M12 4c-4-4-9 1-6 5-5 0-6 6-1 8 4 2 7-3 10-6z" /><path fill="#30c970" d="M17 3c5-2 9 4 5 7-2 2-5 1-6-1z" /><path fill="#57d991" d="M18 13c6-1 8 5 4 8-2 1-4-1-4-3l-3 6c-3 5-8 1-5-3z" /></svg>;
}

export function StudioSidebar({ user, unread = 0, photo, onLogout, onNavigate, navOpen = false, onToggleNav, logoutError }) {
  const [badPhoto, setBadPhoto] = useState(false);
  useEffect(() => setBadPhoto(false), [photo]);
  const link = item => <NavLink key={item.to} to={item.to} end={item.end} className="studio-nav" onClick={onNavigate}><Icon n={item.icon} size={19} /><span>{item.label}</span>{item.badge && unread > 0 && <span className="studio-badge" aria-label={`${unread} new enquiries`}>{unread}</span>}</NavLink>;
  return <aside className="studio-sidebar">
    <div className="studio-brand-row"><Link to="/admin" className="studio-brand" onClick={onNavigate}><StudioMark />Studio</Link><button type="button" className="studio-menu-toggle" aria-label={navOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={navOpen} aria-controls="studio-navigation" onClick={onToggleNav}><Icon n="menu" /></button></div>
    <nav id="studio-navigation" className="studio-navigation" aria-label="Studio">
      <div className="studio-primary-nav">{PRIMARY.map(link)}</div>
      <details className="studio-manage"><summary>Manage portfolio<Icon n="chevron" size={15} />{unread > 0 && <span className="studio-badge">{unread}</span>}</summary><div>{MANAGE.map(link)}</div></details>
      {user.isAdmin && <details className="studio-manage"><summary>Administration<Icon n="chevron" size={15} /></summary><div>{link({ to: '/admin/superadmin', label: 'Super Admin', icon: 'shield' })}{link({ to: '/admin/superadmin?tab=invites', label: 'Invite Links', icon: 'email' })}</div></details>}
    </nav>
    <details className="studio-account"><summary><span className="studio-account-avatar">{photo && !badPhoto ? <img src={photo} alt="" onError={() => setBadPhoto(true)} /> : String(user.name || user.email || 'S').slice(0, 1).toUpperCase()}</span><span className="studio-account-name"><strong>{user.name || user.email}</strong><small>{user.isAdmin ? 'Admin' : 'Creator'}</small></span><Icon n="chevron" size={14} /></summary>
      <div className="studio-account-menu">{user.slug && <a href={`/p/${user.slug}`} target="_blank" rel="noreferrer">View live portfolio ↗</a>}<Link to="/admin/portfolio?tab=hero" onClick={onNavigate}>Edit portfolio</Link><button type="button" onClick={onLogout}>Sign out</button>{logoutError && <p role="alert">{logoutError}</p>}</div>
    </details>
  </aside>;
}

export default function Layout() { return <GlassShell studio><Inner /></GlassShell>; }

function Inner() {
  const { user, logout } = useAuth(), { pathname } = useLocation(), navigate = useNavigate();
  const [needs, setNeeds] = useState(null), [unread, setUnread] = useState(0), [photo, setPhoto] = useState(null), [navOpen, setNavOpen] = useState(false), [logoutError, setLogoutError] = useState('');
  useEffect(() => {
    if (!user) return undefined;
    let active = true; setPhoto(null); setNeeds(null);
    api('profile.get').then(result => { if (active) setNeeds(!result.profile); }, () => { if (active) setNeeds(false); });
    api('site.get').then(result => { if (active) setPhoto(result.heroUrl); }, () => {});
    return () => { active = false; };
  }, [user?.id]);
  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    const load = () => api('enquiries.count').then(result => { if (active) setUnread(result.new || 0); }, () => {});
    load(); window.addEventListener('enquiries-changed', load);
    return () => { active = false; window.removeEventListener('enquiries-changed', load); };
  }, [user?.id, pathname]);
  useEffect(() => {
    const shortcut = event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); navigate('/admin?focus=command'); } if (event.key === 'Escape') setNavOpen(false); };
    window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut);
  }, [navigate]);
  if (user === undefined) return <p className="muted" style={{ padding: 40 }}>Loading…</p>;
  if (!user) return <Login />;
  if (needs === null) return <p className="muted" style={{ padding: 40 }}>Loading…</p>;
  if (needs && !['/admin/profile', '/admin/superadmin', '/admin/invites'].includes(pathname)) return <Navigate to="/admin/profile" replace />;
  const overview = pathname.replace(/\/$/, '') === '/admin';
  return <div className={`studio-shell${navOpen ? ' nav-open' : ''}`}>
    <a className="studio-skip" href="#studio-main">Skip to content</a>
    <StudioSidebar user={user} unread={unread} photo={photo} navOpen={navOpen} onToggleNav={() => setNavOpen(value => !value)} onNavigate={() => setNavOpen(false)} onLogout={async () => { try { await logout(); } catch { setLogoutError('Could not sign out. Please try again.'); } }} logoutError={logoutError} />
    <div className={`studio-stage${overview ? ' is-overview' : ''}`}>
      {overview && <svg className="studio-scenery" viewBox="0 0 1000 800" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0H360C224 100 208 141 114 180C72 200 31 210 0 215Z" fill="#18bd61" opacity=".08" /><path d="M0 0H210C117 110 78 161 0 172Z" fill="#8de5b3" opacity=".12" /><path d="M378 800C670 774 644 627 831 566C902 536 955 530 1000 525V800Z" fill="#19b960" opacity=".07" /><path d="M463 800C738 773 725 640 886 619C932 611 970 607 1000 607V800Z" fill="#27cf72" opacity=".09" /></svg>}
      <header className="studio-toolbar"><Link to="/admin?focus=command" className="studio-tool" aria-label="Search studio tools" title="Search studio tools (Ctrl/⌘ K)"><Icon n="search" size={21} /></Link><Link to="/admin/enquiries" className="studio-tool" aria-label={unread ? `${unread} new enquiries` : 'Open enquiries'} title="Enquiries"><Icon n="bell" size={21} />{unread > 0 && <span className="studio-notification-dot" />}</Link></header>
      <main id="studio-main" className={`studio-main${overview ? ' overview-main' : ''}`} tabIndex={-1}><Outlet context={{ setNeeds }} /></main>
    </div>
  </div>;
}
