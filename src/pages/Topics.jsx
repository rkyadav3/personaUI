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
  useEffect(() => { if (topic) { setName(topic.name); setDesc(topic.description || ''); } }, [topic?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!topics) return <Loading />;
  if (!topic) return <><p className="muted">That topic no longer exists.</p><Link to="/admin/topics">All topics</Link></>;
  const myFiles = (files || []).filter(f => f.topic_id === id), myPosts = (posts || []).filter(p => p.topic_id === id);

  async function newPost() {
    const [tpl] = await api('templates.list');
    const post = await api('posts.create', { html: tpl?.html || '', topicId: id, templateId: tpl?.id ?? null });
    nav(`/admin/writing/${post.id}`);
  }

  return (
    <>
      <div className="head"><Crumbs parts={[{ label: 'Research topics', onClick: () => nav('/admin/topics') }, topic.name]} /><Link className="btn" to="/admin/topics">All topics</Link></div>
      <div className="cols c12">
        <section className="card">
          <h3>Details</h3>
          <Field label="Name"><input type="text" value={name} onChange={e => setName(e.target.value)} /></Field>
          <Field label="Description"><textarea rows={5} value={desc} onChange={e => setDesc(e.target.value)} /></Field>
          <button className="btn primary" disabled={!name.trim()} onClick={async () => { await api('topics.update', { id, name, description: desc }); reload(); }}>Save</button>
        </section>
        <section className="card">
          <h3>Files</h3>
          {!myFiles.length && <p className="muted">No files yet. Assign this topic when uploading, or from a file's page.</p>}
          {myFiles.map(f => <div key={f.id}><Link to={`/admin/files?${f.folder_id ? `folder=${f.folder_id}&` : ''}file=${f.id}`}>{f.name}</Link></div>)}
          <h3 style={{ marginTop: 18 }}>Writing</h3>
          {myPosts.map(p => <div className="row" key={p.id}><Link to={`/admin/writing/${p.id}`}>{p.title}</Link><Pill status={p.status} /></div>)}
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" onClick={newPost}>New post in this topic</button>
            <Confirm label="Delete topic" warn="Files and posts are kept; they just lose this topic." confirmLabel="Delete" onConfirm={async () => { await api('topics.delete', { id }); nav('/admin/topics'); }} />
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
      <h1>Research topics</h1>
      <div className="cols c12">
        <form className="card" onSubmit={async e => { e.preventDefault(); if (!name.trim()) return; await api('topics.create', { name, description: desc }); setName(''); setDesc(''); reload(); }}>
          <h3>New topic</h3>
          <Field label="Name"><input type="text" value={name} onChange={e => setName(e.target.value)} /></Field>
          <Field label="What is it about?"><textarea rows={4} value={desc} onChange={e => setDesc(e.target.value)} /></Field>
          <button className="btn primary">Create topic</button>
        </form>
        <section className="card">
          <h3>All topics</h3>
          {!topics && <Loading error={error} />}
          {topics && !topics.length && <p className="muted">No topics yet. Create one, then attach files and posts to it.</p>}
          {topics?.map(t => (
            <div className="row" key={t.id} style={{ justifyContent: 'space-between', padding: '6px 0' }}>
              <Link to={`/admin/topics/${t.id}`}>{t.name}</Link>
              <span className="muted">{t.files} files, {t.posts} posts</span>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

export default function Topics() {
  const { id } = useParams();
  return id ? <Detail id={Number(id)} /> : <List />;
}
