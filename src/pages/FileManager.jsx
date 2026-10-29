import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { breadcrumbs, fmtSize, idOrNull } from '../lib/format.js';
import { useFolders, useOp, useTopics } from '../lib/hooks.js';
import { Confirm, Crumbs, Field, Notice, Pill } from '../components/Ui.jsx';
import { FolderSelect, TopicSelect } from '../components/Selects.jsx';

const EDITABLE = /\.(txt|md|markdown|csv|tsv|json|xml|html|htm|tex|js|py|r|yaml|yml|log|bib)$/i;

function Editor({ id, folders, topics, onClose, onChanged }) {
  const [file, setFile] = useState(null);
  const [name, setName] = useState(''), [topic, setTopic] = useState(null), [text, setText] = useState(''), [dest, setDest] = useState(null);
  const [msgs, setMsgs] = useState([]);
  useEffect(() => {
    api('files.get', { id }).then(f => {
      if (!f) return onClose();
      setFile(f); setName(f.name); setTopic(f.topic_id); setText(f.text_content || ''); setDest(f.folder_id); setMsgs([]);
    });
  }, [id]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!file) return null;
  const editable = EDITABLE.test(file.name);
  const trail = file.folder_id ? breadcrumbs(folders, file.folder_id) : [];

  async function save(status) {
    try {
      await api('files.save', { id, name, topicId: topic, status, text: editable ? text : null });
      const r = await api('index.refresh', { kind: 'file', id });
      const out = [{ kind: 'success', t: status === 'draft' ? 'Saved as draft.' : !editable ? 'Saved.' : 'Published.' }];
      if (r.error) out.push({ kind: 'warn', t: `Saved, but indexing needs attention: ${r.error}` });
      else if (r.waiting > 0) out.push({ kind: 'info', t: `${r.waiting} chunks are still waiting to be embedded. Press Sync in Knowledge index.` });
      setMsgs(out); onChanged();
    } catch (e) { setMsgs([{ kind: 'error', t: e.message }]); }
  }
  async function download() {
    try { window.open((await api('files.url', { id })).url, '_blank', 'noopener'); } catch { setMsgs([{ kind: 'warn', t: 'Download unavailable.' }]); }
  }

  return (
    <section className="card">
      <Crumbs parts={['All files', ...trail.map(c => c.name), file.name]} />
      <div className="cols c332">
        <Field label="Name"><input type="text" value={name} onChange={e => setName(e.target.value)} /></Field>
        <TopicSelect value={topic} onChange={setTopic} topics={topics} />
        <div><button className="btn block" style={{ marginTop: 22 }} onClick={download}>Download</button></div>
      </div>
      {editable
        ? <Field label="Content"><textarea rows={18} value={text} onChange={e => setText(e.target.value)} /></Field>
        : <p className="muted">This file type can't be edited here and isn't searchable by the persona yet. Rename it, assign a topic, or download it. (Text extracted from PDF and Word files is searchable.)</p>}
      <div className="row">
        {editable
          ? <><button className="btn" onClick={() => save('draft')}>Save as draft</button><button className="btn primary" onClick={() => save('published')}>Save and publish</button></>
          : <button className="btn primary" onClick={() => save(file.status)}>Save details</button>}
        <button className="btn" onClick={onClose}>Close</button>
      </div>
      {msgs.map((m, i) => <Notice key={i} kind={m.kind}>{m.t}</Notice>)}
      <div className="row" style={{ marginTop: 14, alignItems: 'flex-end' }}>
        <div className="grow"><FolderSelect label="Move to folder" value={dest} onChange={setDest} folders={folders} /></div>
        <button className="btn" style={{ marginBottom: 12 }} onClick={async () => { await api('files.move', { id, folderId: dest }); onChanged(); }}>Move</button>
        <span style={{ marginBottom: 12 }}>
          <Confirm label="Delete this file" warn="This removes the file and its searchable chunks." onConfirm={async () => { await api('files.delete', { id }); onClose(); onChanged(); }} />
        </span>
      </div>
    </section>
  );
}

export default function FileManager() {
  const [params, setParams] = useSearchParams();
  const folder = idOrNull(params.get('folder')), openFile = idOrNull(params.get('file'));
  const [q, setQ] = useState('');
  const go = (next) => { const p = {}; if (next.folder != null) p.folder = next.folder; if (next.file != null) p.file = next.file; setParams(p); };
  const { data: folders = [], reload: reloadFolders } = useFolders();
  const { data: topics } = useTopics();
  const { data: files, reload: reloadFiles, error } = useOp('files.list', { folderId: folder, q: q.trim() }, [folder, q]);
  const reload = () => { reloadFiles(); reloadFolders(); };
  const kids = q.trim() ? [] : (folders || []).filter(f => (f.parent_id ?? null) === folder).sort((a, b) => a.name.localeCompare(b.name));
  const topicName = Object.fromEntries((topics || []).map(t => [t.id, t.name]));
  const trail = breadcrumbs(folders || [], folder);

  return (
    <>
      <div className="head">
        <h1>File manager</h1>
        <div className="row" style={{ flex: 1, justifyContent: 'flex-end' }}>
          <input type="text" style={{ maxWidth: 360 }} placeholder="Search names and contents" aria-label="Search" value={q} onChange={e => setQ(e.target.value)} />
          <Link className="btn" to={`/admin/add${folder ? `?folder=${folder}` : ''}`}>Add files</Link>
        </div>
      </div>
      <Crumbs parts={[{ label: 'All files', onClick: () => go({}) }, ...trail.map((c, i) => i < trail.length - 1 ? { label: c.name, onClick: () => go({ folder: c.id }) } : c.name)]} />
      {q.trim() && <div className="crumbs">search results for “{q.trim()}”</div>}

      {openFile && <Editor id={openFile} folders={folders || []} topics={topics || []} onClose={() => go({ folder })} onChanged={reload} />}
      <Notice kind="error">{error}</Notice>

      <section className="card">
        <div className="th files-grid"><span>Name</span><span>Topic</span><span>Status</span><span>Size</span><span /></div>
        {kids.map(f => (
          <div className="tr files-grid" key={`d${f.id}`}>
            <button className="btn link" onClick={() => go({ folder: f.id })}>📁 {f.name}</button>
            <span /><span /><span />
            <div className="row">
              <button className="btn" onClick={async () => { const n = window.prompt('New name', f.name); if (n && n.trim()) { await api('folders.rename', { id: f.id, name: n }); reload(); } }}>Rename</button>
              <Confirm label="Delete" warn="Deletes the folder and everything inside it." confirmLabel="Delete folder" onConfirm={async () => { await api('folders.delete', { id: f.id }); reload(); }} />
            </div>
          </div>
        ))}
        {(files || []).slice(0, 200).map(f => (
          <div className="tr files-grid" key={f.id}>
            <button className="btn link" onClick={() => go({ folder, file: f.id })}>{f.name}</button>
            <span>{topicName[f.topic_id] || ''}</span>
            <Pill status={f.status} />
            <span>{fmtSize(f.size)}</span>
            <Confirm label="Delete" warn="This removes the file and its searchable chunks." onConfirm={async () => { await api('files.delete', { id: f.id }); if (openFile === f.id) go({ folder }); reload(); }} />
          </div>
        ))}
        {files && !files.length && !kids.length && (
          <p className="muted" style={{ marginTop: 12 }}>{q.trim() ? 'No files match your search.' : 'This folder is empty. Use Add files to upload or create something.'}</p>
        )}
      </section>
    </>
  );
}
