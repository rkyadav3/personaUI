import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './portfolio/Icon.jsx';
import { saleMoney } from '../pages/PlatformPayments.jsx';
import '../styles/adminActivity.css';

export function ActivityGlimpse({ summary, onClose }) {
  const [leaving, setLeaving] = useState(false), [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const fade = setTimeout(() => setLeaving(true), 9000), finish = setTimeout(onClose, 9500);
    return () => { clearTimeout(fade); clearTimeout(finish); };
  }, [onClose, paused]);
  if (!summary?.hasChanges) return null;
  return <aside className={`admin-glimpse${leaving ? ' leaving' : ''}`} aria-label="Activity since your last visit" onMouseEnter={() => { setPaused(true); setLeaving(false); }} onMouseLeave={() => setPaused(false)} onFocus={() => { setPaused(true); setLeaving(false); }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
    <header><div><h2>While you were away</h2><p>Since {new Date(summary.since).toLocaleString()}</p></div><button type="button" aria-label="Dismiss activity summary" onClick={onClose}><Icon n="x" size={18} /></button></header>
    <div className="admin-glimpse-metrics" role="status">{summary.metrics.filter(row => row.increase > 0).map(row => <Link to={row.href} key={row.key}><strong>+{row.increase}<Icon n="chart" size={16} /></strong><span>{row.label}</span><small>{row.current} total</small></Link>)}</div>
    {summary.revenue.filter(row => row.increase !== 0).map(row => <p className="admin-glimpse-revenue" key={row.currency}>{row.currency} earnings {row.increase > 0 ? '+' : '−'}{saleMoney(Math.abs(row.increase), row.currency)} <small>after refunds</small></p>)}
    <small>Net increases since your last active check. This glimpse closes automatically; reopen it from Recent activity.</small>
  </aside>;
}
export function AnalyticsPanels({ data }) {
  if (!data) return null;
  const maximum = Math.max(1, ...data.dailySales.map(row => row.sales));
  return <section className="assistant-insights" aria-label="Admin activity data"><h3>Your activity at a glance</h3><div className="assistant-insight-metrics">{data.metrics.map(row => <div key={row.label}><strong>{row.value}</strong><span>{row.label}</span></div>)}</div>
    {!!data.revenue.length && <table><caption>Lifetime net earnings after refunds, before fees or payouts</caption><thead><tr><th>Currency</th><th>Net earnings</th></tr></thead><tbody>{data.revenue.map(row => <tr key={row.currency}><td>{row.currency}</td><td>{saleMoney(row.net, row.currency)}</td></tr>)}</tbody></table>}
    {!!data.dailySales.length && <><h4>Daily paid sales · last 30 days (UTC)</h4><div className="assistant-sales-bars" aria-hidden="true">{data.dailySales.map(row => <div key={row.day} title={`${row.day}: ${row.sales} paid sales`}><span style={{ height: `${Math.max(4, row.sales / maximum * 100)}%` }} /><small>{row.day.slice(5)}</small></div>)}</div><details><summary>View daily paid sales data</summary><table><caption>Daily paid sales</caption><thead><tr><th>Date (UTC)</th><th>Paid sales</th></tr></thead><tbody>{data.dailySales.map(row => <tr key={row.day}><td>{row.day}</td><td>{row.sales}</td></tr>)}</tbody></table></details></>}
    <small>Recorded at {data.asOf ? new Date(data.asOf).toLocaleString() : 'the latest refresh'}. Persona exchanges are visitor question-and-answer pairs.</small>
  </section>;
}
