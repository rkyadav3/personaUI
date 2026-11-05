import { Link } from 'react-router-dom';
import Icon from './portfolio/Icon.jsx';

export default function AdminTabs({ label, items, value, onChange, disabled = false }) {
  return <nav className="page-tabs-wrap admin-local-tabs" aria-label={label}>
    {items.map(item => {
      const content = <>{item.icon && <Icon n={item.icon} size={18} />}<span>{item.label}</span>{item.count != null && <span className="page-tab-badge">{item.count}</span>}</>;
      return item.to ? <Link key={item.id} to={item.to} className="page-tab-btn">{content}</Link> : <button type="button" key={item.id} className={`page-tab-btn${value === item.id ? ' active' : ''}`} aria-pressed={value === item.id} disabled={disabled} onClick={() => onChange(item.id)}>{content}</button>;
    })}
  </nav>;
}
