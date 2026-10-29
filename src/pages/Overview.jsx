import { Link } from 'react-router-dom';
import { useOp } from '../lib/hooks.js';
import { Loading, Notice, Stats } from '../components/Ui.jsx';

export default function Overview() {
  const { data, error } = useOp('overview');
  if (!data) return <Loading error={error} />;
  const { counts: c, recent } = data;
  const waiting = c.chunks - c.embedded;
  return (
    <>
      <h1>Overview</h1>
      <Stats items={[
        { n: c.files, label: 'files', sub: `${(c.bytes / 1048576).toFixed(1)} MB stored` },
        { n: c.posts, label: 'posts', sub: `${c.drafts} drafts` },
        { n: c.topics, label: 'research topics' },
        { n: c.chunks, label: 'indexed chunks', sub: `${c.embedded} embedded` },
      ]} />
      {waiting > 0 && <Notice kind="warn">{waiting} chunks are waiting to be embedded. Open <Link to="/admin/knowledge">Knowledge index</Link> and press Sync.</Notice>}
      <div className="cols c2">
        <section className="card">
          <h3>Start something</h3>
          <div className="cols c2" style={{ marginBottom: 8 }}>
            <Link className="btn" to="/admin/writing">Write a post</Link>
            <Link className="btn" to="/admin/add">Add files</Link>
            <Link className="btn" to="/admin/files">File manager</Link>
            <Link className="btn" to="/admin/topics">New topic</Link>
          </div>
          <p className="muted">The persona only answers from published files and published posts. Drafts stay private.</p>
        </section>
        <section className="card">
          <h3>Recently changed files</h3>
          {!recent.length && <p className="muted">Nothing uploaded yet. Add your first research file.</p>}
          {recent.map(f => (
            <Link key={f.id} className="btn block" style={{ marginBottom: 6 }} to={`/admin/files?${f.folder_id ? `folder=${f.folder_id}&` : ''}file=${f.id}`}>{f.name}</Link>
          ))}
        </section>
      </div>
    </>
  );
}
