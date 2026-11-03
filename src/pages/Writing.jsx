import { useEffect, useState } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtDate, idOrNull } from '../lib/format.js';
import { useOp, useTopics } from '../lib/hooks.js';
import { Confirm, Field, Loading, Notice, Pill } from '../components/Ui.jsx';
import { TopicSelect } from '../components/Selects.jsx';

const TOOLBAR = [
  [{ header: [1, 2, 3, false] }, { font: [] }, { size: ['small', false, 'large', 'huge'] }],
  ['bold', 'italic', 'underline', 'strike'], [{ color: [] }, { background: [] }],
  [{ list: 'ordered' }, { list: 'bullet' }, { align: [] }],
  ['blockquote', 'code-block', 'link', 'image'], ['clean'],
];

function TemplateRow({ t, reload }) {
  const nav = useNavigate();
  const [name, setName] = useState(t.name), [html, setHtml] = useState(t.html);
  return (
    <details className="exp" style={{ marginBottom: 10 }}>
      <summary style={{ padding: '8px 4px', fontWeight: 600 }}>📋 {t.name}</summary>
      <div style={{ paddingTop: 12 }}>
        <Field label="Template Name"><input type="text" value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="HTML Layout Structure"><textarea rows={6} value={html} onChange={e => setHtml(e.target.value)} /></Field>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn small" onClick={async () => { await api('templates.save', { id: t.id, name, html }); reload(); }}>Update</button>
          <button className="btn small primary" onClick={async () => { const p = await api('posts.create', { html: t.html, templateId: t.id }); nav(`/admin/writing/${p.id}`); }}>Start Post with Template</button>
          <button className="btn small danger" onClick={async () => { await api('templates.delete', { id: t.id }); reload(); }}>Delete</button>
        </div>
      </div>
    </details>
  );
}

function ListView({ defaultTab = 'posts' }) {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || defaultTab;
  const setTab = t => setParams({ tab: t });

  const { data: posts, reload: reloadPosts, error: postsError } = useOp('posts.list');
  const { data: topics } = useTopics();
  const { data: tpls, reload: reloadTpls, error: tplsError } = useOp('templates.list');

  const [selectedTpl, setSelectedTpl] = useState('');
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [searchPost, setSearchPost] = useState('');

  // New Template form
  const [newTplName, setNewTplName] = useState('');
  const [newTplHtml, setNewTplHtml] = useState('');

  const topicName = Object.fromEntries((topics || []).map(t => [t.id, t.name]));
  const tid = selectedTpl || tpls?.[0]?.id;

  async function createPost() {
    const t = tpls?.find(x => String(x.id) === String(tid));
    const post = await api('posts.create', { html: t?.html || '', topicId: selectedTopic, templateId: t?.id ?? null });
    nav(`/admin/writing/${post.id}`);
  }

  async function saveNewTemplate(e) {
    e.preventDefault();
    if (!newTplName.trim()) return;
    await api('templates.save', { name: newTplName.trim(), html: newTplHtml });
    setNewTplName('');
    setNewTplHtml('');
    reloadTpls();
  }

  const filteredPosts = (posts || []).filter(p => {
    const q = searchPost.trim().toLowerCase();
    return !q || (p.title || '').toLowerCase().includes(q) || (topicName[p.topic_id] || '').toLowerCase().includes(q);
  });

  return (
    <>
      <div className="head">
        <div>
          <h1>Writing &amp; Content Studio</h1>
          <p className="muted" style={{ margin: 0 }}>
            Author articles, tutorials, and research essays that feed your Persona's knowledge.
          </p>
        </div>
      </div>

      {/* UX Guide Banner */}
      <div className="ux-guide-banner">
        <div className="ux-guide-icon">✍️</div>
        <div className="ux-guide-content">
          <h4>Publishing Articles Feeds Your Persona</h4>
          <p>
            Posts saved as "Published" are indexed into your knowledge base so your Persona can cite and discuss them with visitors. Drafts remain completely private to you.
          </p>
        </div>
      </div>

      {/* Page Tabs */}
      <div className="page-tabs-wrap">
        <button className={`page-tab-btn ${tab === 'posts' ? 'active' : ''}`} onClick={() => setTab('posts')}>
          <span>✍️ Posts &amp; Articles</span>
          {posts && <span className="page-tab-badge">{posts.length}</span>}
        </button>
        <button className={`page-tab-btn ${tab === 'templates' ? 'active' : ''}`} onClick={() => setTab('templates')}>
          <span>📋 Article Templates</span>
          {tpls && <span className="page-tab-badge">{tpls.length}</span>}
        </button>
      </div>

      {/* TAB 1: POSTS & ARTICLES */}
      {tab === 'posts' && (
        <>
          <section className="card row" style={{ alignItems: 'flex-end', background: '#fafbfc', border: '1px solid #e2e8f0' }}>
            <div className="grow">
              <label className="f" style={{ margin: 0 }}>
                Choose Starting Template
                <select value={tid ?? ''} onChange={e => setSelectedTpl(e.target.value)}>
                  {(tpls || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
            </div>
            <div className="grow">
              <TopicSelect label="Assign to Topic" value={selectedTopic} onChange={setSelectedTopic} topics={topics || []} />
            </div>
            <button className="btn primary" onClick={createPost}>
              + Write New Post
            </button>
          </section>

          <section className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <input
                type="search"
                placeholder="Search articles by title or topic…"
                value={searchPost}
                onChange={e => setSearchPost(e.target.value)}
                style={{ width: 300 }}
              />
              <span className="muted" style={{ fontSize: '.86rem' }}>
                {filteredPosts.length} post(s) found
              </span>
            </div>

            <div className="th posts-grid">
              <span>Post Title</span>
              <span>Topic</span>
              <span>Status</span>
              <span>Updated</span>
              <span style={{ textAlign: 'right' }}>Actions</span>
            </div>

            {!posts && <Loading error={postsError} />}
            {posts && !filteredPosts.length && (
              <p className="muted" style={{ textAlign: 'center', padding: '24px 0' }}>
                No posts found. Click "+ Write New Post" above to begin.
              </p>
            )}

            {filteredPosts.map(p => (
              <div className="tr posts-grid" key={p.id}>
                <Link to={`/admin/writing/${p.id}`} style={{ fontWeight: 600, color: '#0f172a' }}>
                  {p.title || '(Untitled Draft)'}
                </Link>
                <span>{topicName[p.topic_id] || <span className="muted">—</span>}</span>
                <span><Pill status={p.status} /></span>
                <span className="muted" style={{ fontSize: '.84rem' }}>{fmtDate(p.updated_at)}</span>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <Confirm
                    label="Delete"
                    warn="Are you sure you want to delete this post?"
                    confirmLabel="Yes, delete"
                    onConfirm={async () => { await api('posts.delete', { id: p.id }); reloadPosts(); }}
                  />
                </div>
              </div>
            ))}
          </section>
        </>
      )}

      {/* TAB 2: ARTICLE TEMPLATES */}
      {tab === 'templates' && (
        <div className="cols c12">
          <form className="card" onSubmit={saveNewTemplate}>
            <h3>Create New Template</h3>
            <p className="muted" style={{ fontSize: '.86rem', margin: '0 0 14px' }}>
              Define reusable structures, section headings, or boilerplate for your future articles.
            </p>
            <Field label="Template Name">
              <input
                type="text"
                placeholder="e.g. Research Paper Summary"
                value={newTplName}
                onChange={e => setNewTplName(e.target.value)}
                required
              />
            </Field>
            <Field label="HTML Skeleton">
              <textarea
                rows={9}
                placeholder="<h2>Introduction</h2><p>Overview of the topic...</p><h2>Key Findings</h2>"
                value={newTplHtml}
                onChange={e => setNewTplHtml(e.target.value)}
              />
            </Field>
            <button className="btn primary">Save Template</button>
          </form>

          <section className="card">
            <h3>Saved Templates ({tpls?.length || 0})</h3>
            <p className="muted" style={{ fontSize: '.86rem', margin: '0 0 14px' }}>
              Click any template to view, edit, or immediately start writing a post from it.
            </p>
            {!tpls && <Loading error={tplsError} />}
            {tpls?.map(t => <TemplateRow key={`${t.id}-${t.name}`} t={t} reload={reloadTpls} />)}
          </section>
        </div>
      )}
    </>
  );
}

function EditorView({ id }) {
  const nav = useNavigate();
  const { data: topics } = useTopics();
  const [post, setPost] = useState(null);
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState(null);
  const [html, setHtml] = useState('');
  const [mode, setMode] = useState('visual');
  const [state, setState] = useState('');
  const [msgs, setMsgs] = useState([]);

  useEffect(() => {
    api('posts.get', { id }).then(p => {
      if (!p) return nav('/admin/writing');
      setPost(p);
      setTitle(p.title);
      setTopic(p.topic_id);
      setHtml(p.html);
      setState(p.status === 'published' ? 'Published' : 'Draft');
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!post) return <Loading />;

  async function save(status) {
    try {
      await api('posts.save', { id, title, html, topicId: idOrNull(topic), status });
      const r = await api('index.refresh', { kind: 'post', id });
      setState(status === 'draft' ? 'Draft saved' : 'Published & indexed');
      setMsgs(
        r.error
          ? [{ kind: 'warn', t: `Saved, but indexing needs attention: ${r.error}` }]
          : r.waiting > 0
          ? [{ kind: 'info', t: `${r.waiting} chunks waiting to embed. Sync in Knowledge Index.` }]
          : [{ kind: 'success', t: status === 'draft' ? 'Draft saved privately.' : 'Published to your AI Persona!' }]
      );
    } catch (e) {
      setMsgs([{ kind: 'error', t: e.message }]);
    }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Link to="/admin/writing" className="btn small">← Back to Articles</Link>
        <span className="muted" style={{ fontSize: '.88rem' }}>Status: <b>{state}</b></span>
      </div>

      <input
        type="text"
        aria-label="Post Title"
        placeholder="Enter post title…"
        value={title}
        onChange={e => setTitle(e.target.value)}
        style={{ fontSize: '1.5rem', fontWeight: 700, padding: '12px 16px', marginBottom: 14 }}
      />

      <div className="row" style={{ marginBottom: 14, background: '#f8fafc', padding: '10px 14px', borderRadius: 14, border: '1px solid #e2e8f0' }}>
        <div style={{ width: 240 }}>
          <TopicSelect label="Topic" value={topic} onChange={setTopic} topics={topics || []} />
        </div>

        <div className="row" role="radiogroup" aria-label="Editor Mode">
          <label className="row" style={{ gap: 4, cursor: 'pointer', fontSize: '.9rem' }}>
            <input type="radio" name="mode" checked={mode === 'visual'} onChange={() => setMode('visual')} />
            Visual Editor
          </label>
          <label className="row" style={{ gap: 4, cursor: 'pointer', fontSize: '.9rem' }}>
            <input type="radio" name="mode" checked={mode === 'source'} onChange={() => setMode('source')} />
            HTML Source
          </label>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => save('draft')}>Save Draft (Private)</button>
          <button className="btn primary" onClick={() => save('published')}>Publish to AI Persona</button>
        </div>
      </div>

      {msgs.map((m, i) => <Notice key={i} kind={m.kind}>{m.t}</Notice>)}

      {mode === 'visual' ? (
        <div className="quill-wrap">
          <ReactQuill theme="snow" value={html} onChange={setHtml} modules={{ toolbar: TOOLBAR }} placeholder="Write your article here..." />
        </div>
      ) : (
        <textarea rows={22} value={html} onChange={e => setHtml(e.target.value)} aria-label="HTML Source" />
      )}

      <div style={{ marginTop: 18 }}>
        <Confirm
          label="Delete Post"
          warn="Are you sure you want to delete this post? It will be removed from your persona's index."
          confirmLabel="Yes, delete"
          onConfirm={async () => { await api('posts.delete', { id }); nav('/admin/writing'); }}
        />
      </div>
    </>
  );
}

export default function Writing({ defaultTab = 'posts' }) {
  const { id } = useParams();
  return id ? <EditorView id={Number(id)} key={id} /> : <ListView defaultTab={defaultTab} />;
}
