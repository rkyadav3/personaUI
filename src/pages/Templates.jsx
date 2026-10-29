import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useOp } from '../lib/hooks.js';
import { Field, Loading } from '../components/Ui.jsx';

function Row({ t, reload }) {
  const nav = useNavigate();
  const [name, setName] = useState(t.name), [html, setHtml] = useState(t.html);
  return (
    <details className="exp">
      <summary>{t.name}</summary>
      <div style={{ paddingTop: 12 }}>
        <Field label="Name"><input type="text" value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="HTML"><textarea rows={7} value={html} onChange={e => setHtml(e.target.value)} /></Field>
        <div className="row">
          <button className="btn" onClick={async () => { await api('templates.save', { id: t.id, name, html }); reload(); }}>Update</button>
          <button className="btn" onClick={async () => { const p = await api('posts.create', { html: t.html, templateId: t.id }); nav(`/admin/writing/${p.id}`); }}>Start a post</button>
          <button className="btn danger" onClick={async () => { await api('templates.delete', { id: t.id }); reload(); }}>Delete</button>
        </div>
      </div>
    </details>
  );
}

export default function Templates() {
  const { data: tpls, reload, error } = useOp('templates.list');
  const [name, setName] = useState(''), [html, setHtml] = useState('');
  return (
    <>
      <h1>Templates</h1>
      <p className="muted">Templates are starting layouts for new posts. Write HTML, then start a post from it.</p>
      <div className="cols c12">
        <form className="card" onSubmit={async e => { e.preventDefault(); if (!name.trim()) return; await api('templates.save', { name, html }); setName(''); setHtml(''); reload(); }}>
          <h3>New template</h3>
          <Field label="Name"><input type="text" value={name} onChange={e => setName(e.target.value)} /></Field>
          <Field label="HTML"><textarea rows={9} value={html} onChange={e => setHtml(e.target.value)} /></Field>
          <button className="btn primary">Save template</button>
        </form>
        <section className="card">
          <h3>Your templates</h3>
          {!tpls && <Loading error={error} />}
          {tpls?.map(t => <Row key={`${t.id}-${t.name}`} t={t} reload={reload} />)}
        </section>
      </div>
    </>
  );
}
