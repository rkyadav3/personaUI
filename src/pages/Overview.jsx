import { Link } from 'react-router-dom';
import { useOp } from '../lib/hooks.js';
import { Loading, Notice, Stats } from '../components/Ui.jsx';

export default function Overview() {
  const { data, error } = useOp('overview');
  if (!data) return <Loading error={error} />;
  const { counts: c, recent } = data;
  const waiting = c.chunks - c.embedded;

  const statItems = [
    { n: c.files, label: 'Research Files', sub: `${(c.bytes / 1048576).toFixed(1)} MB stored in cloud` },
    { n: c.posts, label: 'Published Posts', sub: `${c.drafts} drafts in progress` },
    { n: c.topics, label: 'Research Domains', sub: 'Topics categorized' },
    { n: c.embedded, label: 'AI Knowledge Chunks', sub: `${waiting} chunks waiting sync` },
  ];

  return (
    <>
      <div className="head" style={{ marginBottom: 4 }}>
        <div>
          <h1>Studio Overview</h1>
          <p className="muted" style={{ margin: 0 }}>
            Welcome to your Creator Workspace. Manage your persona's intelligence, content, and profile.
          </p>
        </div>
      </div>

      <Stats items={statItems} />

      {/* AI Brain Status Notice if chunks waiting */}
      {waiting > 0 ? (
        <Notice kind="warn">
          <strong>⚡ Knowledge Sync Needed:</strong> {waiting} chunks of your published notes are waiting to be embedded into the vector index.{' '}
          <Link to="/admin/knowledge" style={{ textDecoration: 'underline', fontWeight: 600 }}>
            Open Knowledge Index to sync now →
          </Link>
        </Notice>
      ) : (
        <Notice kind="success">
          <strong>✓ AI Brain is Up-To-Date:</strong> All published files and articles are embedded and ready to answer visitor questions.
        </Notice>
      )}

      {/* Quick Action Cards Grid */}
      <div style={{ marginTop: 20 }}>
        <h3 style={{ margin: '0 0 12px' }}>Quick Actions</h3>
        <div className="quick-action-grid">
          <Link to="/admin/files?tab=upload" className="quick-action-card">
            <div className="quick-action-icon" style={{ background: '#ede9fe', color: '#6366f1' }}>📤</div>
            <strong>Upload Files &amp; Notes</strong>
            <span>Add research papers, PDFs, or write new notes to expand your persona.</span>
          </Link>

          <Link to="/admin/writing" className="quick-action-card">
            <div className="quick-action-icon" style={{ background: '#ecfeff', color: '#0891b2' }}>✍️</div>
            <strong>Write an Article</strong>
            <span>Author essays or guides that teach your AI about your latest work.</span>
          </Link>

          <Link to="/admin/profile" className="quick-action-card">
            <div className="quick-action-icon" style={{ background: '#f5f3ff', color: '#7c3aed' }}>👤</div>
            <strong>Profile &amp; Store Offerings</strong>
            <span>Edit your bio, services, products, pricing, and visibility settings.</span>
          </Link>

          <Link to="/admin/settings" className="quick-action-card">
            <div className="quick-action-icon" style={{ background: '#fef3c7', color: '#d97706' }}>⚙️</div>
            <strong>Customize Persona Look</strong>
            <span>Adjust the glowing 3D particle ball and visual appearance.</span>
          </Link>
        </div>
      </div>

      {/* Recently Changed Files */}
      <div className="cols c2" style={{ marginTop: 20 }}>
        <section className="card">
          <h3>Recently Updated Files</h3>
          {!recent.length && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b' }}>
              <p style={{ margin: '0 0 8px' }}>No research files uploaded yet.</p>
              <Link to="/admin/files?tab=upload" className="btn small primary">+ Upload your first file</Link>
            </div>
          )}
          {recent.map(f => (
            <Link
              key={f.id}
              className="btn block"
              style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px' }}
              to={`/admin/files?${f.folder_id ? `folder=${f.folder_id}&` : ''}file=${f.id}`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📄</span>
                <strong>{f.name}</strong>
              </div>
              <span className="muted" style={{ fontSize: '.8rem' }}>Inspect →</span>
            </Link>
          ))}
        </section>

        <section className="card">
          <h3>How Your Persona Works</h3>
          <p className="muted" style={{ fontSize: '.9rem', lineHeight: 1.6 }}>
            Your Persona combines your <b>Profile details</b>, your <b>Store offerings</b>, and your <b>Published research files</b> into a live, interactive 3D conversational assistant.
          </p>
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: '.88rem' }}>
              <span style={{ color: '#10b981' }}>✓</span>
              <span><b>Published files</b> feed the AI knowledge vector database.</span>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: '.88rem' }}>
              <span style={{ color: '#64748b' }}>🔒</span>
              <span><b>Draft files</b> and notes stay completely private to you.</span>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: '.88rem' }}>
              <span style={{ color: '#6366f1' }}>💬</span>
              <span>Visitors on your page can ask questions and receive instant cited answers.</span>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
