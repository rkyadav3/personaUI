import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useOp } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { greetingForHour } from '../../shared/studio.js';
import Icon from '../components/portfolio/Icon.jsx';
import StudioAssistant from '../components/StudioAssistant.jsx';
import { Loading } from '../components/Ui.jsx';
import '../styles/studio.css';

export function OverviewContent({ user, data, error, hour = new Date().getHours(), onApplied }) {
  const [params] = useSearchParams();
  const first = String(user?.name || '').trim().split(/\s+/)[0] || 'there';
  const counts = data?.counts, waiting = Math.max(0, (counts?.chunks || 0) - (counts?.embedded || 0));
  if (params.get('tab') === 'dashboard') return <div className="studio-dashboard">
    <div className="head"><div><h1>Dashboard</h1><p className="muted">Your content, knowledge and recent workspace activity.</p></div><Link className="btn primary" to="/admin">Open assistant</Link></div>
    {error ? <p role="alert">Could not load your dashboard: {error}</p> : !counts ? <Loading label="Loading your dashboard…" /> : <>
      <div className="studio-metrics">{[[counts.files, 'Files'], [counts.posts, 'Published posts'], [counts.topics, 'Research topics'], [counts.embedded, 'Searchable knowledge chunks']].map(([value, label]) => <div key={label}><strong>{value || 0}</strong><span>{label}</span></div>)}</div>
      <section className="card"><h2>AI knowledge</h2><p>{waiting ? `${waiting} ${waiting === 1 ? 'chunk is' : 'chunks are'} waiting to sync.` : 'Your published knowledge is ready for Chat.'}</p><Link className="btn" to="/admin/knowledge">Manage AI knowledge</Link></section>
      <section className="card"><h2>Recent files</h2>{data.recent?.length ? <div className="studio-recent">{data.recent.map(file => <Link key={file.id} to={`/admin/files?${file.folder_id ? `folder=${file.folder_id}&` : ''}file=${file.id}`}><Icon n="file" size={17} />{file.name}</Link>)}</div> : <p className="muted">No files yet. Add your source material in Data Pipelines.</p>}</section>
      <div className="row"><Link className="btn" to="/admin/purchases">View orders</Link><Link className="btn" to="/admin/enquiries">View enquiries</Link><Link className="btn" to="/admin/questions">View visitor Q&amp;A</Link></div>
    </>}
  </div>;
  return <div className="studio-overview">
    <section className="studio-overview-hero">
      <div className="studio-greeting"><Icon n="spark" size={19} /><span>{greetingForHour(hour)}, {first}</span></div>
      <h1>What would you like to do <em>today?</em></h1>
      <p className="studio-overview-subtitle">Tell me what to create, edit, organize or remove. Review every change before it is applied.</p>
      <StudioAssistant user={user} focusCommand={params.get('focus') === 'command'} onApplied={onApplied} />
    </section>
    <details className="studio-activity"><summary>Workspace activity <Icon n="chevron" size={16} /></summary>
      {error ? <p role="alert">Could not load workspace activity: {error}</p> : !counts ? <Loading compact label="Loading your workspace…" /> : <>
        <div className="studio-metrics">{[[counts.files, 'Files'], [counts.posts, 'Published posts'], [counts.topics, 'Research topics'], [counts.embedded, 'Knowledge chunks']].map(([value, label]) => <div key={label}><strong>{value || 0}</strong><span>{label}</span></div>)}</div>
        <p className="studio-sync">{waiting ? <>{waiting} knowledge chunks are waiting to sync. <Link to="/admin/knowledge">Sync knowledge</Link></> : <>Your published knowledge is ready for portfolio Chat. <Link to="/admin/knowledge">Manage knowledge</Link></>}</p>
        {!!data.recent?.length && <div className="studio-recent"><h2>Recently updated files</h2>{data.recent.map(file => <Link key={file.id} to={`/admin/files?${file.folder_id ? `folder=${file.folder_id}&` : ''}file=${file.id}`}><Icon n="folder" size={17} />{file.name}</Link>)}</div>}
      </>}
    </details>
  </div>;
}

export default function Overview() {
  const { user } = useAuth(), { data, error, reload } = useOp('overview');
  useEffect(() => { document.title = 'Studio overview'; }, []);
  return <OverviewContent user={user} data={data} error={error} onApplied={() => { reload(); window.dispatchEvent(new Event('studio-changed')); window.dispatchEvent(new Event('enquiries-changed')); }} />;
}
