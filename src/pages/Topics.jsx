import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useOp } from '../lib/hooks.js';
import { Confirm, Crumbs, Field, Loading, Pill } from '../components/Ui.jsx';

function Detail({ id }) {
  const nav = useNavigate();
  const { data: topics, reload } = useOp('topics.list');
  const { data: files } = useOp('files.all'), { data: posts } = useOp('posts.list');
  const topic = topics?.find(t => t.id === id);
  const [name, setName] = useState(''), [desc, setDesc] = useState('');

  useEffect(() => {
    if (topic) { setName(topic.name); setDesc(topic.description || ''); }
  }, [topic?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!topics) return <Loading />;
  if (!topic) return <><p className="muted">That topic no longer exists.</p><Link to="/admin/topics">← All topics</Link></>;

  const myFiles = (files || []).filter(f => f.topic_id === id);
  const myPosts = (posts || []).filter(p => p.topic_id === id);

  async function newPost() {
    const [tpl] = await api('templates.list');
    const post = await api('posts.create', { html: tpl?.html || '', topicId: id, templateId: tpl?.id ?? null });
    nav(`/admin/writing/${post.id}`);
  }

  return (
    <>
      <div className="head" style={{ marginBottom: 12 }}>
        <Crumbs parts={[{ label: 'Research Topics', onClick: () => nav('/admin/topics') }, topic.name]} />
        <Link className="btn small" to="/admin/topics">← All Topics</Link>
      </div>

      <div className="cols c12">
        <section className="card">
          <h3>Topic Information</h3>
          <Field label="Topic Title">
            <input type="text" value={name} onChange={e => setName(e.target.value)} />
          </Field>
          <Field label="Description &amp; Key Themes">
            <textarea rows={5} value={desc} onChange={e => setDesc(e.target.value)} />
          </Field>
          <button
            className="btn primary"
            disabled={!name.trim()}
            onClick={async () => { await api('topics.update', { id, name, description: desc }); reload(); }}
          >
            Save Changes
          </button>
        </section>

        <section className="card">
          <h3>Associated Files ({myFiles.length})</h3>
          {!myFiles.length && <p className="muted" style={{ fontSize: '.88rem' }}>No files assigned to this topic yet.</p>}
          <div style={{ display: 'grid', gap: 6, margin: '8px 0 16px' }}>
            {myFiles.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>📄</span>
                <Link to={`/admin/files?${f.folder_id ? `folder=${f.folder_id}&` : ''}file=${f.id}`}>
                  {f.name}
                </Link>
              </div>
            ))}
          </div>

          <h3 style={{ marginTop: 20 }}>Associated Writing ({myPosts.length})</h3>
          {!myPosts.length && <p className="muted" style={{ fontSize: '.88rem' }}>No posts written under this topic yet.</p>}
          <div style={{ display: 'grid', gap: 8, margin: '8px 0 16px' }}>
            {myPosts.map(p => (
              <div className="row" key={p.id}>
                <span>✍️</span>
                <Link to={`/admin/writing/${p.id}`} style={{ fontWeight: 600 }}>{p.title}</Link>
                <Pill status={p.status} />
              </div>
            ))}
          </div>

          <div className="row" style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <button className="btn small primary" onClick={newPost}>+ New Post in this Topic</button>
            <Confirm
              label="Delete Topic"
              warn="Files and articles will be kept safely, but they will be unlinked from this topic."
              confirmLabel="Yes, delete topic"
              onConfirm={async () => { await api('topics.delete', { id }); nav('/admin/topics'); }}
            />
          </div>
        </section>
      </div>
    </>
  );
}

function List() {
  const { data: topics, reload, error } = useOp('topics.list');
  const [name, setName] = useState(''), [desc, setDesc] = useState('');

  return (
    <>
      <div className="head">
        <div>
          <h1>Research Topics</h1>
          <p className="muted" style={{ margin: 0 }}>
            Organize your knowledge base into thematic subject areas and domains.
          </p>
        </div>
      </div>

      <div className="ux-guide-banner">
        <div className="ux-guide-icon">💡</div>
        <div className="ux-guide-content">
          <h4>Why Use Topics?</h4>
          <p>
            Topics organize your research papers, notes, and articles into focused domains (e.g. "Artificial Intelligence", "IoT Hardware", "Product Strategy"). Your Persona uses these to organize answers and cite specific topics.
          </p>
        </div>
      </div>

      <div className="cols c12">
        <form className="card" onSubmit={async e => {
          e.preventDefault();
          if (!name.trim()) return;
          await api('topics.create', { name: name.trim(), description: desc });
          setName(''); setDesc(''); reload();
        }}>
          <h3>Create New Topic</h3>
          <p className="muted" style={{ fontSize: '.86rem', margin: '0 0 14px' }}>
            Define a research subject or domain you work in.
          </p>
          <Field label="Topic Name">
            <input
              type="text"
              placeholder="e.g. Edge Computing &amp; IoT"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </Field>
          <Field label="Description (What does this topic cover?)">
            <textarea
              rows={4}
              placeholder="Brief summary of the concepts, tools, and methodologies included in this domain…"
              value={desc}
              onChange={e => setDesc(e.target.value)}
            />
          </Field>
          <button className="btn primary">+ Create Topic</button>
        </form>

        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>All Research Topics ({topics?.length || 0})</h3>
            <button className="btn small" onClick={() => reload()}>Refresh</button>
          </div>

          {!topics && <Loading error={error} />}
          {topics && !topics.length && (
            <p className="muted" style={{ textAlign: 'center', padding: '24px 0' }}>
              No topics created yet. Add your first topic on the left to start grouping files.
            </p>
          )}

          <div style={{ display: 'grid', gap: 10 }}>
            {topics?.map(t => (
              <div
                key={t.id}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 14,
                  padding: '12px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div>
                  <Link to={`/admin/topics/${t.id}`} style={{ fontWeight: 600, fontSize: '.98rem', color: '#0f172a' }}>
                    💡 {t.name}
                  </Link>
                  {t.description && (
                    <p style={{ margin: '4px 0 0', fontSize: '.82rem', color: '#64748b', lineClamp: 1 }}>
                      {t.description}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <span className="pill" style={{ background: '#ede9fe', color: '#6366f1', fontSize: '.78rem' }}>
                    {t.files || 0} files
                  </span>
                  <span className="pill" style={{ background: '#ecfeff', color: '#0891b2', fontSize: '.78rem' }}>
                    {t.posts || 0} posts
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

export default function Topics() {
  const { id } = useParams();
  return id ? <Detail id={Number(id)} /> : <List />;
}
