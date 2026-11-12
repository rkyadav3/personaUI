import { Link, useLocation } from 'react-router-dom';
import { CONTENT_TABS, contentHref, contentTab } from '../lib/contentNavigation.js';
import Icon from './portfolio/Icon.jsx';

export default function ContentNavigation({ active }) {
  const { pathname, search } = useLocation();
  const selected = active || contentTab(pathname, search);
  return <nav className="admin-section-tabs content-section-tabs" aria-label="Content sections">{CONTENT_TABS.map(tab => <Link key={tab.id} to={contentHref(tab.id)} className={selected === tab.id ? 'active' : ''} aria-current={selected === tab.id ? 'page' : undefined}><Icon n={tab.icon} size={18} />{tab.label}</Link>)}</nav>;
}
