import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useOp } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { greetingForHour, resolveStudioAction, STUDIO_SHORTCUTS } from '../../shared/studio.js';
import Icon from '../components/portfolio/Icon.jsx';
import '../styles/studio.css';

export function OverviewContent({ user, data, error, hour = new Date().getHours() }) {
  const navigate = useNavigate(), [params] = useSearchParams(), inputRef = useRef(null);
  const [query, setQuery] = useState(''), [notice, setNotice] = useState('');
  const first = String(user?.name || '').trim().split(/\s+/)[0] || 'there';
  useEffect(() => { if (params.get('focus') === 'command') inputRef.current?.focus(); }, [params]);
  function submit(event) {
    event.preventDefault();
    const action = resolveStudioAction(query);
    if (action) navigate(action.to);
    else { setNotice('Try asking about projects, templates, posts, your persona, files, or your shop.'); inputRef.current?.focus(); }
  }
  const counts = data?.counts, waiting = Math.max(0, (counts?.chunks || 0) - (counts?.embedded || 0));
  return <div className="studio-overview">
    <section className="studio-overview-hero">
      <div className="studio-greeting"><Icon n="spark" size={19} /><span>{greetingForHour(hour)}, {first} <span aria-hidden="true">👋</span></span></div>
      <h1>What would you like to do <em>today?</em></h1>
      <p className="studio-overview-subtitle">Find the right tools to create, edit, organize, or manage your studio.</p>
      <form className="studio-command" onSubmit={submit}>
        <Icon n="spark" size={24} />
        <label className="studio-sr-only" htmlFor="studio-command-input">What would you like to do?</label>
        <input id="studio-command-input" ref={inputRef} aria-label="What would you like to do?" aria-describedby={notice ? 'studio-command-notice' : undefined} value={query} onChange={event => { setQuery(event.target.value); setNotice(''); }} maxLength={500} placeholder="e.g. “Create a new template for a conference talk…”" autoComplete="off" />
        <Link className="studio-attach" to="/admin/files?tab=upload" aria-label="Upload files" title="Upload files"><Icon n="attachment" size={21} /></Link>
        <button type="submit" className="studio-command-send" disabled={!query.trim()} aria-label="Open workspace tool"><Icon n="send" size={20} /></button>
      </form>
      {notice && <p id="studio-command-notice" className="studio-command-notice" role="status">{notice}</p>}
      <div className="studio-suggestions"><p>Try something like:</p><div>{STUDIO_SHORTCUTS.map(item => <Link key={item.label} className="studio-shortcut" to={item.to}><Icon n={item.icon} size={18} /><span>{item.label}</span></Link>)}</div></div>
    </section>
    <details className="studio-activity"><summary>Workspace activity <Icon n="chevron" size={16} /></summary>
      {error ? <p role="alert">Could not load workspace activity: {error}</p> : !counts ? <p role="status">Loading your workspace…</p> : <>
        <div className="studio-metrics">{[[counts.files, 'Files'], [counts.posts, 'Published posts'], [counts.topics, 'Research topics'], [counts.embedded, 'Knowledge chunks']].map(([value, label]) => <div key={label}><strong>{value || 0}</strong><span>{label}</span></div>)}</div>
        <p className="studio-sync">{waiting ? <>{waiting} knowledge chunks are waiting to sync. <Link to="/admin/knowledge">Sync knowledge</Link></> : <>Your published knowledge is ready for portfolio Chat. <Link to="/admin/knowledge">Manage knowledge</Link></>}</p>
        {!!data.recent?.length && <div className="studio-recent"><h2>Recently updated files</h2>{data.recent.map(file => <Link key={file.id} to={`/admin/files?${file.folder_id ? `folder=${file.folder_id}&` : ''}file=${file.id}`}><Icon n="folder" size={17} />{file.name}</Link>)}</div>}
      </>}
    </details>
  </div>;
}

export default function Overview() {
  const { user } = useAuth(), { data, error } = useOp('overview');
  useEffect(() => { document.title = 'Studio overview'; }, []);
  return <OverviewContent user={user} data={data} error={error} />;
}
