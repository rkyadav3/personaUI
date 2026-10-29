import { useEffect, useState } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtDate, idOrNull } from '../lib/format.js';
import { useOp, useTopics } from '../lib/hooks.js';
import { Confirm, Loading, Notice, Pill } from '../components/Ui.jsx';
import { TopicSelect } from '../components/Selects.jsx';

const TOOLBAR = [
  [{ header: [1, 2, 3, false] }, { font: [] }, { size: ['small', false, 'large', 'huge'] }],
  ['bold', 'italic', 'underline', 'strike'], [{ color: [] }, { background: [] }],
  [{ list: 'ordered' }, { list: 'bullet' }, { align: [] }],
  ['blockquote', 'code-block', 'link', 'image'], ['clean'],
];

function ListView() {
  const nav = useNavigate();
  const { data: posts, reload, error } = useOp('posts.list');
  const { data: topics } = useTopics(), { data: tpls } = useOp('templates.list');
  const [tpl, setTpl] = useState(''), [topic, setTopic] = useState(null);
  const topicName = Object.fromEntries((topics || []).map(t => [t.id, t.name]));
  const tid = tpl || tpls?.[0]?.id;

  async function create() {
    const t = tpls?.find(x => String(x.id) === String(tid));
    const post = await api('posts.create', { html: t?.html || '', topicId: topic, templateId: t?.id ?? null });
    nav(`/admin/writing/${post.id}`);
  }

  return (
    <>
      <h1>Writing</h1>
      <section className="card row" style={{ alignItems: 'flex-end' }}>
        <label className="f grow">Start from template
          <select value={tid ?? ''} onChange={e => setTpl(e.target.value)}>{(tpls || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        </label>
        <div className="grow"><TopicSelect label="Topic" value={topic} onChange={setTopic} topics={topics || []} /></div>
        <button className="btn primary" style={{ marginBottom: 12 }} onClick={create}>New post</button>
      </section>
      <section className="card">
        <div className="th posts-grid"><span>Title</span><span>Topic</span><span>Status</span><span>Updated</span><span /></div>
        {!posts && <Loading error={error} />}
        {posts && !posts.length && <p className="muted" style={{ marginTop: 12 }}>No posts yet. Write your first one.</p>}
        {posts?.map(p => (
          <div className="tr posts-grid" key={p.id}>
            <Link to={`/admin/writing/${p.id}`}>{p.title}</Link>
            <span>{topicName[p.topic_id] || ''}</span><Pill status={p.status} /><span className="muted">{fmtDate(p.updated_at)}</span>
            <Confirm label="Delete" warn="Delete this post?" onConfirm={async () => { await api('posts.delete', { id: p.id }); reload(); }} />
          </div>
        ))}
      </section>
    </>
  );
}

function EditorView({ id }) {
  const nav = useNavigate();
  const { data: topics } = useTopics();
  const [post, setPost] = useState(null);
  const [title, setTitle] = useState(''), [topic, setTopic] = useState(null), [html, setHtml] = useState(''), [mode, setMode] = useState('visual');
  const [state, setState] = useState(''), [msgs, setMsgs] = useState([]);
  useEffect(() => {
    api('posts.get', { id }).then(p => { if (!p) return nav('/admin/writing'); setPost(p); setTitle(p.title); setTopic(p.topic_id); setHtml(p.html); setState(p.status === 'published' ? 'Published' : 'Draft'); });
  }, [id]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!post) return <Loading />;

  async function save(status) {
    try {
      await api('posts.save', { id, title, html, topicId: idOrNull(topic), status });
      const r = await api('index.refresh', { kind: 'post', id });
      setState(status === 'draft' ? 'Draft saved' : 'Published');
      setMsgs(r.error ? [{ kind: 'warn', t: `Saved, but indexing needs attention: ${r.error}` }]
        : r.waiting > 0 ? [{ kind: 'info', t: `${r.waiting} chunks are waiting to be embedded. Press Sync in Knowledge index.` }] : []);
    } catch (e) { setMsgs([{ kind: 'error', t: e.message }]); }
  }

  return (
    <>
      <input type="text" aria-label="Title" placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} style={{ fontSize: '1.4rem', marginBottom: 12 }} />
      <div className="row" style={{ marginBottom: 12 }}>
        <div style={{ width: 240 }}><TopicSelect label="Topic" value={topic} onChange={setTopic} topics={topics || []} /></div>
        <div className="row" role="radiogroup" aria-label="Editor">
          {[['visual', 'Visual'], ['source', 'HTML source']].map(([k, l]) => (
            <label key={k} className="row" style={{ gap: 4 }}><input type="radio" name="mode" checked={mode === k} onChange={() => setMode(k)} />{l}</label>
          ))}
        </div>
        <button className="btn" onClick={() => save('draft')}>Save as draft</button>
        <button className="btn primary" onClick={() => save('published')}>Publish</button>
        <span className="muted">{state}</span>
        <Link className="btn" to="/admin/writing">Back to list</Link>
      </div>
      {msgs.map((m, i) => <Notice key={i} kind={m.kind}>{m.t}</Notice>)}
      {mode === 'visual'
        ? <div className="quill-wrap"><ReactQuill theme="snow" value={html} onChange={setHtml} modules={{ toolbar: TOOLBAR }} placeholder="Write here..." /></div>
        : <textarea rows={22} value={html} onChange={e => setHtml(e.target.value)} aria-label="HTML" />}
      <div style={{ marginTop: 16 }}>
        <Confirm label="Delete post" warn="This removes the post and its searchable chunks." onConfirm={async () => { await api('posts.delete', { id }); nav('/admin/writing'); }} />
      </div>
    </>
  );
}

export default function Writing() {
  const { id } = useParams();
  return id ? <EditorView id={Number(id)} key={id} /> : <ListView />;
}
