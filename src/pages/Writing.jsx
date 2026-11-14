import { useEffect, useRef, useState } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtDate, idOrNull } from '../lib/format.js';
import { useOp, useTopics } from '../lib/hooks.js';
import { Confirm, Field, Loading, Notice, Pill } from '../components/Ui.jsx';
import { TopicSelect } from '../components/Selects.jsx';
import Icon from '../components/portfolio/Icon.jsx';
import ContentNavigation from '../components/ContentNavigation.jsx';
import FormDialog from '../components/FormDialog.jsx';
import Topics from './Topics.jsx';
import { CONTENT_TABS } from '../lib/contentNavigation.js';

const TOOLBAR = [
  [{ header: [1, 2, 3, false] }, { font: [] }, { size: ['small', false, 'large', 'huge'] }],
  ['bold', 'italic', 'underline', 'strike'], [{ color: [] }, { background: [] }],
  [{ list: 'ordered' }, { list: 'bullet' }, { align: [] }],
  ['blockquote', 'code-block', 'link', 'image'], ['clean'],
];

function TemplateRow({ t, reload, onCreateArticle }) {
  const [name, setName] = useState(t.name), [html, setHtml] = useState(t.html);
  const [source, setSource] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [expanded, setExpanded] = useState(false);
  async function run(action) {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <details className="exp" style={{ marginBottom: 10 }} onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary style={{ padding: '8px 4px', fontWeight: 600 }}><Icon n="template" size={18} />{t.name}</summary>
      {expanded && <div style={{ paddingTop: 12 }}>
        <Field label="Template Name"><input type="text" value={name} onChange={e => setName(e.target.value)} disabled={busy} /></Field>
        <button type="button" className="btn small" onClick={() => setSource(value => !value)}>{source ? 'Use visual editor' : 'Edit HTML source'}</button>
        {source ? <Field label="Template HTML"><textarea rows={6} value={html} onChange={e => setHtml(e.target.value)} disabled={busy} /></Field> : <div className="quill-wrap" aria-label={`Content for ${t.name}`}><ReactQuill theme="snow" value={html} onChange={setHtml} readOnly={busy} modules={{ toolbar: TOOLBAR }} /></div>}
        <Notice kind="error">{error}</Notice>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn small" disabled={busy || !name.trim()} onClick={() => run(async () => { await api('templates.save', { id: t.id, name: name.trim(), html }); reload(); })}>Save template</button>
          <button className="btn small primary" disabled={busy} onClick={() => onCreateArticle({ ...t, html })}>Use for new article</button>
          <Confirm label="Delete" warn="Delete this template? Existing articles will be kept." onConfirm={() => run(async () => { await api('templates.delete', { id: t.id }); reload(); })} />
        </div>
      </div>}
    </details>
  );
}

function ListView({ defaultTab = 'posts' }) {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab') || defaultTab;
  const tab = CONTENT_TABS.some(item => item.id === requestedTab) ? requestedTab : 'posts';

  const { data: posts, reload: reloadPosts, error: postsError } = useOp('posts.list');
  const { data: topics, reload: reloadTopics } = useTopics();
  const previousTab = useRef(tab);
  useEffect(() => {
    if (previousTab.current === 'topics' && tab !== 'topics') reloadTopics();
    previousTab.current = tab;
  }, [tab, reloadTopics]);
  const { data: tpls, reload: reloadTpls, error: tplsError } = useOp('templates.list');

  const [selectedTpl, setSelectedTpl] = useState('');
  const [selectedTopic, setSelectedTopic] = useState(() => idOrNull(params.get('topic')));
  const [creating, setCreating] = useState(() => params.get('action') === 'add' ? 'post' : null);
  const [startingTemplate, setStartingTemplate] = useState(null);
  const [searchPost, setSearchPost] = useState('');

  // New Template form
  const [newTplName, setNewTplName] = useState('');
  const [newTplHtml, setNewTplHtml] = useState('');
  const [templateSource, setTemplateSource] = useState(false), [busy, setBusy] = useState(false), [operationError, setOperationError] = useState('');

  const topicName = Object.fromEntries((topics || []).map(t => [t.id, t.name]));
  const tid = selectedTpl;

  async function createPost() {
    if (busy) return;
    setBusy(true); setOperationError('');
    try {
      const t = startingTemplate || tpls?.find(x => String(x.id) === String(tid));
      const post = await api('posts.create', { html: t?.html || '', topicId: selectedTopic, templateId: t?.id ?? null });
      nav(`/admin/writing/${post.id}`);
    } catch (e) { setOperationError(e.message); } finally { setBusy(false); }
  }

  async function saveNewTemplate(e) {
    e.preventDefault();
    if (!newTplName.trim()) return;
    if (busy) return;
    setBusy(true); setOperationError('');
    try {
      await api('templates.save', { name: newTplName.trim(), html: newTplHtml });
      setNewTplName('');
      setNewTplHtml('');
      setCreating(null);
      reloadTpls();
    } catch (error) { setOperationError(error.message); } finally { setBusy(false); }
  }

  const filteredPosts = (posts || []).filter(p => {
    const q = searchPost.trim().toLowerCase();
    return !q || (p.title || '').toLowerCase().includes(q) || (topicName[p.topic_id] || '').toLowerCase().includes(q);
  });

  return (
    <>
      <div className="head">
        <div>
          <h1>Content</h1>
          <p className="muted" style={{ margin: 0 }}>
            Templates start your drafts, articles hold your writing, and research topics group related articles and files.
          </p>
        </div>
      </div>
      <ContentNavigation active={tab} />

      {/* UX Guide Banner */}
      {tab !== 'topics' && <div className="ux-guide-banner">
        <div className="ux-guide-icon"><Icon n={tab === 'templates' ? 'template' : 'pen'} size={24} /></div>
        <div className="ux-guide-content">
          <h4>{tab === 'templates' ? 'Template → article → publish' : 'Draft → review → publish'}</h4>
          <p>
            {tab === 'templates' ? 'Templates are reusable starting points. They become AI knowledge only when an article using them is published and indexed.' : 'Drafts stay private. Published articles are indexed so your persona can reference them in public chat. Check AI knowledge if indexing needs attention.'}
          </p>
        </div>
      </div>}

      <Notice kind="error">{operationError}</Notice>
      {tab === 'topics' && <Topics embedded />}

      {/* TAB 1: POSTS & ARTICLES */}
      {tab === 'posts' && (
        <>
          <button type="button" className="btn primary" onClick={() => { setOperationError(''); setStartingTemplate(null); setCreating('post'); }}>New article</button>
          {creating === 'post' && <FormDialog title="New article" busy={busy} onClose={() => setCreating(null)}><form className="admin-create-form" onSubmit={event => { event.preventDefault(); createPost(); }}>
            <div className="grow">
              <label className="f" style={{ margin: 0 }}>
                Starting template (optional)
                <select value={tid ?? ''} onChange={e => { setSelectedTpl(e.target.value); setStartingTemplate(null); }}>
                  <option value="">Blank article</option>
                  {(tpls || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
            </div>
            <div className="grow">
              <TopicSelect label="Assign to Topic" value={selectedTopic} onChange={setSelectedTopic} topics={topics || []} />
            </div>
            <Notice kind="error">{operationError}</Notice>
            <button className="btn primary" disabled={busy}>
              <Icon n="plus" size={18} />{busy ? 'Creating…' : 'Start writing'}
            </button>
          </form></FormDialog>}

          <section className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <input
                type="search"
                aria-label="Search articles"
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
                {searchPost.trim() ? 'No articles match your search.' : 'No articles yet. Choose a blank article or a template above to start writing.'}
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
                    onConfirm={async () => { try { await api('posts.delete', { id: p.id }); reloadPosts(); } catch (e) { setOperationError(e.message); } }}
                  />
                </div>
              </div>
            ))}
          </section>
        </>
      )}

      {/* TAB 2: ARTICLE TEMPLATES */}
      {tab === 'templates' && (
        <div className="content-templates">
          <button type="button" className="btn primary" onClick={() => { setOperationError(''); setCreating('template'); }}>New template</button>
          {creating === 'template' && <FormDialog title="Create new template" busy={busy} onClose={() => setCreating(null)}><form onSubmit={saveNewTemplate}>
            <p className="muted" style={{ fontSize: '.86rem', margin: '0 0 14px' }}>
              Define reusable structures, section headings, or boilerplate for your future articles.
            </p>
            <Field label="Template Name">
              <input
                type="text"
                placeholder="e.g. Research Paper Summary"
                value={newTplName}
                disabled={busy}
                onChange={e => setNewTplName(e.target.value)}
                required
              />
            </Field>
            <button type="button" className="btn small" onClick={() => setTemplateSource(value => !value)}>{templateSource ? 'Use visual editor' : 'Edit HTML source'}</button>
            {templateSource ? <Field label="Template HTML (optional)">
              <textarea
                rows={9}
                placeholder="<h2>Introduction</h2><p>Overview of the topic...</p><h2>Key Findings</h2>"
                value={newTplHtml}
                disabled={busy}
                onChange={e => setNewTplHtml(e.target.value)}
              />
            </Field> : <div className="quill-wrap" aria-label="New template content"><ReactQuill theme="snow" value={newTplHtml} onChange={setNewTplHtml} readOnly={busy} modules={{ toolbar: TOOLBAR }} placeholder="Add headings and prompts for your article…" /></div>}
            <button className="btn primary" disabled={busy || !newTplName.trim()}>{busy ? 'Saving…' : 'Save template'}</button>
            <Notice kind="error">{operationError}</Notice>
          </form></FormDialog>}

          <section className="card">
            <h3>Saved Templates ({tpls?.length || 0})</h3>
            <p className="muted" style={{ fontSize: '.86rem', margin: '0 0 14px' }}>
              Click any template to view, edit, or immediately start writing a post from it.
            </p>
            {!tpls && <Loading error={tplsError} />}
            {tpls && !tpls.length && <p className="muted">No templates yet. Create an outline to reuse across your articles.</p>}
            {tpls?.map(t => <TemplateRow key={`${t.id}-${t.name}`} t={t} reload={reloadTpls} onCreateArticle={template => { setSelectedTpl(String(template.id)); setStartingTemplate(template); setOperationError(''); setCreating('post'); const next = new URLSearchParams(params); next.set('tab', 'posts'); setParams(next); }} />)}
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
  const [loadError, setLoadError] = useState(''), [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api('posts.get', { id }).then(p => {
      if (!active) return;
      if (!p) return nav('/admin/writing');
      setPost(p);
      setTitle(p.title);
      setTopic(p.topic_id);
      setHtml(p.html);
      setState(p.status === 'published' ? 'Published' : 'Draft');
    }, error => { if (active) setLoadError(error.message); });
    return () => { active = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!post) return <Loading error={loadError} label="Loading article…" />;

  async function save(status) {
    if (busy) return;
    setBusy(true);
    try {
      await api('posts.save', { id, title, html, topicId: idOrNull(topic), status });
      const r = await api('index.refresh', { kind: 'post', id }).catch(error => ({ error: error.message }));
      setState(status === 'draft' ? 'Draft saved' : r.error || r.waiting > 0 ? 'Published · indexing needs attention' : 'Published & ready for AI');
      setMsgs(
        r.error
          ? [{ kind: 'warn', t: `Saved, but indexing needs attention: ${r.error}` }]
          : r.waiting > 0
          ? [{ kind: 'info', t: `${r.waiting} passages are waiting to become searchable. Sync published material in Library → AI knowledge.` }]
          : [{ kind: 'success', t: status === 'draft' ? 'Draft saved privately.' : 'Published and ready for AI answers.' }]
      );
    } catch (e) {
      setMsgs([{ kind: 'error', t: e.message }]);
    } finally { setBusy(false); }
  }

  return (
    <>
      <ContentNavigation active="posts" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Link to="/admin/writing" className="btn small">← Back to Articles</Link>
        <span className="muted" style={{ fontSize: '.88rem' }}>Status: <b>{state}</b></span>
      </div>

      <input
        type="text"
        aria-label="Post Title"
        disabled={busy}
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
          <button className="btn" disabled={busy} onClick={() => save('draft')}>Save draft</button>
          <button className="btn primary" disabled={busy} onClick={() => save('published')}>{busy ? 'Saving…' : 'Publish to AI'}</button>
        </div>
      </div>

      {msgs.map((m, i) => <Notice key={i} kind={m.kind}>{m.t}</Notice>)}

      {mode === 'visual' ? (
        <div className="quill-wrap">
          <ReactQuill theme="snow" value={html} onChange={setHtml} readOnly={busy} modules={{ toolbar: TOOLBAR }} placeholder="Write your article here..." />
        </div>
      ) : (
        <textarea rows={22} value={html} onChange={e => setHtml(e.target.value)} disabled={busy} aria-label="HTML Source" />
      )}

      <div style={{ marginTop: 18 }}>
        <Confirm
          label="Delete Post"
          warn="Are you sure you want to delete this post? It will be removed from your persona's index."
          confirmLabel="Yes, delete"
          onConfirm={async () => { if (busy) return; setBusy(true); try { await api('posts.delete', { id }); nav('/admin/writing'); } catch (e) { setMsgs([{ kind: 'error', t: e.message }]); } finally { setBusy(false); } }}
        />
      </div>
    </>
  );
}

export default function Writing({ defaultTab = 'posts' }) {
  const { id } = useParams();
  return id ? <EditorView id={Number(id)} key={id} /> : <ListView defaultTab={defaultTab} />;
}
