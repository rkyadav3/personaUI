import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useOp } from '../lib/hooks.js';
import { Confirm, Crumbs, Field, Loading, Notice, Pill } from '../components/Ui.jsx';
import Icon from '../components/portfolio/Icon.jsx';
import FormDialog from '../components/FormDialog.jsx';
import ContentNavigation from '../components/ContentNavigation.jsx';

function Detail({ id }) {
  const nav = useNavigate();
  const { data: topics, reload, error: topicsError } = useOp('topics.list');
  const { data: files, error: filesError } = useOp('files.all'), { data: posts, error: postsError } = useOp('posts.list');
  const topic = topics?.find(t => t.id === id);
  const [name, setName] = useState(''), [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(null);
  async function run(action, success) {
    if (busy) return;
    setBusy(true); setMessage(null);
    try { await action(); if (success) setMessage({ kind: 'success', text: success }); }
    catch (e) { setMessage({ kind: 'error', text: e.message }); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (topic) { setName(topic.name); setDesc(topic.description || ''); }
  }, [topic?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!topics) return <Loading error={topicsError} label="Loading topic…" />;
  if (!topic) return <><p className="muted">That topic no longer exists.</p><Link to="/admin/writing?tab=topics">← All topics</Link></>;

  const myFiles = (files || []).filter(f => f.topic_id === id);
  const myPosts = (posts || []).filter(p => p.topic_id === id);

  function newPost() {
    nav(`/admin/writing?action=add&topic=${encodeURIComponent(id)}`);
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
            disabled={busy || !name.trim()}
            onClick={() => run(async () => { await api('topics.update', { id, name: name.trim(), description: desc }); reload(); }, 'Topic saved.')}
          >
            Save Changes
          </button>
        </section>

        <section className="card">
          <h3>Associated Files ({myFiles.length})</h3>
          {!files && <Loading error={filesError} compact label="Loading associated files…" />}
          {files && !myFiles.length && <p className="muted" style={{ fontSize: '.88rem' }}>No files assigned to this topic yet. Assign a topic when uploading or managing a file in Library.</p>}
          <div style={{ display: 'grid', gap: 6, margin: '8px 0 16px' }}>
            {myFiles.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon n="file" size={18} />
                <Link to={`/admin/files?${f.folder_id ? `folder=${f.folder_id}&` : ''}file=${f.id}`}>
                  {f.name}
                </Link>
              </div>
            ))}
          </div>

          <h3 style={{ marginTop: 20 }}>Associated Writing ({myPosts.length})</h3>
          {!posts && <Loading error={postsError} compact label="Loading associated articles…" />}
          {posts && !myPosts.length && <p className="muted" style={{ fontSize: '.88rem' }}>No articles assigned to this topic yet.</p>}
          <div style={{ display: 'grid', gap: 8, margin: '8px 0 16px' }}>
            {myPosts.map(p => (
              <div className="row" key={p.id}>
                <Icon n="pen" size={18} />
                <Link to={`/admin/writing/${p.id}`} style={{ fontWeight: 600 }}>{p.title}</Link>
                <Pill status={p.status} />
              </div>
            ))}
          </div>

          <div className="row" style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <button className="btn small primary" disabled={busy} onClick={newPost}><Icon n="plus" size={18} />New article in this topic</button>
            <Confirm
              label="Delete Topic"
              warn="Files and articles will be kept safely, but they will be unlinked from this topic."
              confirmLabel="Yes, delete topic"
              onConfirm={() => run(async () => { await api('topics.delete', { id }); nav('/admin/topics'); })}
            />
          </div>
        </section>
      </div>
      {message && <Notice kind={message.kind}>{message.text}</Notice>}
    </>
  );
}

function List({ embedded = false }) {
  const { data: topics, reload, error } = useOp('topics.list');
  const [name, setName] = useState(''), [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(null), [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const visibleTopics = (topics || []).filter(topic => `${topic.name} ${topic.description || ''}`.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <>
      <div className="head">
        <div>
          {embedded ? <h2>Research topics</h2> : <h1>Research Topics</h1>}
          <p className="muted" style={{ margin: 0 }}>
            Group related files and articles so your source material is easier to find.
          </p>
        </div>
      </div>

      <div className="ux-guide-banner">
        <div className="ux-guide-icon"><Icon n="layers" size={24} /></div>
        <div className="ux-guide-content">
          <h4>Why Use Topics?</h4>
          <p>
            Create a topic, then assign it to files and articles. Topics organize your material; your AI uses the published, indexed content inside them to answer questions.
          </p>
        </div>
      </div>

      <button type="button" className="btn primary" onClick={() => { setMessage(null); setCreating(true); }}>New research topic</button>
      {creating && <FormDialog title="Create new topic" busy={busy} onClose={() => setCreating(false)}><form onSubmit={async e => {
          e.preventDefault();
          if (!name.trim() || busy) return;
          setBusy(true); setMessage(null);
          try {
            await api('topics.create', { name: name.trim(), description: desc });
            setName(''); setDesc(''); setCreating(false); reload(); setMessage({ kind: 'success', text: 'Topic created. Assign it to a file or article to start organizing.' });
          } catch (error) { setMessage({ kind: 'error', text: error.message }); }
          finally { setBusy(false); }
        }}>
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
          <button className="btn primary" disabled={busy || !name.trim()}><Icon n="plus" size={18} />{busy ? 'Creating…' : 'Create topic'}</button>
          {message && <Notice kind={message.kind}>{message.text}</Notice>}
        </form></FormDialog>}

      <div>
        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>All Research Topics ({topics?.length || 0})</h3>
            <button className="btn small" onClick={() => reload()}>Refresh</button>
          </div>

          {!topics && <Loading error={error} />}
          <Field label="Find a topic"><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search topics…" /></Field>
          {topics && !topics.length && (
            <p className="muted" style={{ textAlign: 'center', padding: '24px 0' }}>
              No topics created yet. Add your first topic to start grouping files.
            </p>
          )}

          <div style={{ display: 'grid', gap: 10 }}>
            {topics && !!topics.length && !visibleTopics.length && <p className="muted">No topics match your search.</p>}
            {visibleTopics.map(t => (
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
                    <Icon n="layers" size={18} /> {t.name}
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

export default function Topics({ embedded = false }) {
  const { id } = useParams();
  return <>{!embedded && <ContentNavigation active="topics" />}{id ? <Detail key={id} id={Number(id)} /> : <List embedded={embedded} />}</>;
}
