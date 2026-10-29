import JSZip from 'jszip';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { idOrNull } from '../lib/format.js';
import { useFolders, useTopics } from '../lib/hooks.js';
import { uploadToSigned } from '../lib/storage.js';
import { Field, Notice, Progress } from '../components/Ui.jsx';
import { FolderSelect, TopicSelect } from '../components/Selects.jsx';

const MB = 1048576;

/** Chunk every new file, then embed as much as the free tier allows. Returns notices to show. */
async function finish(ids) {
  if (!ids.length) return [];
  let error = null;
  for (let i = 0; i < ids.length; i += 20) {
    try { await api('index.sources', { kind: 'file', ids: ids.slice(i, i + 20) }); } catch (e) { error = e.message; }
  }
  let waiting = 0;
  try { waiting = (await api('index.embed', { seconds: 40 })).remaining; } catch (e) { error = error || e.message; }
  if (error) return [{ kind: 'warn', t: `Files are saved, but embedding needs attention: ${error}` }];
  if (waiting > 0) return [{ kind: 'info', t: `${waiting} chunks are still waiting to be embedded (free-tier rate limit). Open Knowledge index and press Sync to continue.` }];
  return [{ kind: 'success', t: 'Indexed. The chatbot can use these files now.' }];
}

/** Expand picked files (and zips, when asked) into { rel, blob } items. */
async function expand(files, unzip, errors) {
  const items = [];
  for (const file of files) {
    if (unzip && file.name.toLowerCase().endsWith('.zip')) {
      const base = file.name.replace(/\.[^.]+$/, '');
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter(e => !e.dir);
      const total = entries.reduce((s, e) => s + (e._data?.uncompressedSize || 0), 0);
      if (entries.length > 2000 || total > 300 * MB) { errors.push(`${file.name} is too large to unzip here.`); continue; }
      for (const e of entries) {
        const parts = e.name.split('/').filter(p => p && p !== '.' && p !== '..');
        if (!parts.length || parts[0] === '__MACOSX' || (e._data?.uncompressedSize || 0) > 50 * MB) continue;
        items.push({ rel: [base, ...parts].join('/'), get: () => e.async('blob') });   // never writes using the zip's own paths
      }
    } else items.push({ rel: file.name, get: async () => file });
  }
  return items;
}

function UploadCard({ folders, topics, cur }) {
  const [files, setFiles] = useState([]), [unzip, setUnzip] = useState(true);
  const [dest, setDest] = useState(cur), [topic, setTopic] = useState(null);
  const [busy, setBusy] = useState(false), [pct, setPct] = useState(0), [msgs, setMsgs] = useState([]);

  async function upload() {
    setBusy(true); setPct(0); setMsgs([]);
    const errors = [], newIds = [];
    try {
      const items = await expand(files, unzip, errors);
      for (let b = 0; b < items.length; b += 50) {
        const batch = items.slice(b, b + 50);
        const signed = await api('files.signUploads', { names: batch.map(i => i.rel.split('/').pop()) });
        for (let k = 0; k < batch.length; k++) {
          const { rel } = batch[k], parts = rel.split('/'), name = parts.pop();
          try {
            const blob = await batch[k].get();
            await uploadToSigned(signed[k].path, signed[k].token, blob);
            const row = await api('files.register', { path: signed[k].path, name, folderId: dest, folderParts: parts, topicId: topic, size: blob.size });
            newIds.push(row.id);
          } catch (e) { errors.push(`${rel}: ${e.message}`); }
          setPct((b + k + 1) / Math.max(1, items.length));
        }
      }
      const out = errors.map(t => ({ kind: 'error', t }));
      out.push({ kind: 'success', t: `Uploaded ${newIds.length} file(s).` });
      setMsgs([...out, { kind: 'info', t: 'Indexing for search…' }]);
      setMsgs([...out, ...(await finish(newIds))]);
      setFiles([]);
    } catch (e) { setMsgs([{ kind: 'error', t: e.message }]); }
    setBusy(false);
  }

  return (
    <section className="card">
      <h3>Upload files or a zip</h3>
      <Field label="Drop files here (a folder? zip it first)"><input type="file" multiple onChange={e => setFiles([...e.target.files])} key={busy ? 'b' : files.length} /></Field>
      <label className="row" style={{ marginBottom: 12 }}><input type="checkbox" checked={unzip} onChange={e => setUnzip(e.target.checked)} /> Unzip zip files into folders</label>
      <FolderSelect value={dest} onChange={setDest} folders={folders} />
      <TopicSelect value={topic} onChange={setTopic} topics={topics} />
      <p className="muted">{files.length ? `${files.length} file(s) chosen.` : 'No files chosen.'}</p>
      <button className="btn primary" disabled={!files.length || busy} onClick={upload}>{busy ? 'Uploading…' : 'Upload'}</button>
      {busy && <Progress value={pct} />}
      {msgs.map((m, i) => <Notice key={i} kind={m.kind}>{m.t}</Notice>)}
    </section>
  );
}

const KINDS = { md: 'Markdown (.md)', txt: 'Plain text (.txt)', html: 'HTML (.html)', csv: 'CSV (.csv)', json: 'JSON (.json)' };

function CreateCard({ folders, topics, cur }) {
  const [name, setName] = useState(''), [kind, setKind] = useState('md'), [folder, setFolder] = useState(cur), [topic, setTopic] = useState(null), [body, setBody] = useState('');
  const [msgs, setMsgs] = useState([]);

  async function create(status) {
    if (!name.trim()) return setMsgs([{ kind: 'error', t: 'Give the file a name.' }]);
    let fname = name.trim().replace(/\//g, '-');
    if (!fname.toLowerCase().endsWith('.' + kind)) fname += '.' + kind;
    try {
      const row = await api('files.createText', { name: fname, folderId: folder, topicId: topic, body, status });
      const out = [{ kind: 'success', t: `Created ${fname}.` }];
      if (status === 'published') out.push(...await finish([row.id]));
      setMsgs(out); setName(''); setBody('');
    } catch (e) { setMsgs([{ kind: 'error', t: e.message }]); }
  }

  return (
    <section className="card">
      <h3>Create a new text file</h3>
      <Field label="File name"><input type="text" value={name} placeholder="e.g. notes-on-method" onChange={e => setName(e.target.value)} /></Field>
      <Field label="Type"><select value={kind} onChange={e => setKind(e.target.value)}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <FolderSelect value={folder} onChange={setFolder} folders={folders} />
      <TopicSelect value={topic} onChange={setTopic} topics={topics} />
      <Field label="Content"><textarea rows={7} value={body} onChange={e => setBody(e.target.value)} /></Field>
      <div className="row"><button className="btn" onClick={() => create('draft')}>Save as draft</button><button className="btn primary" onClick={() => create('published')}>Create and publish</button></div>
      <p className="muted">Drafts stay private. Only published files feed the persona.</p>
      {msgs.map((m, i) => <Notice key={i} kind={m.kind}>{m.t}</Notice>)}
    </section>
  );
}

function FolderCard({ folders, cur }) {
  const [name, setName] = useState(''), [parent, setParent] = useState(cur), [msg, setMsg] = useState(null);
  async function create() {
    if (!name.trim()) return;
    try { await api('folders.create', { parentId: parent, name }); setMsg({ kind: 'success', t: 'Folder created.' }); setName(''); }
    catch (e) { setMsg({ kind: 'error', t: `Couldn't create it (does that name already exist there?): ${e.message}` }); }
  }
  return (
    <section className="card">
      <h3>New folder</h3>
      <Field label="Name"><input type="text" value={name} onChange={e => setName(e.target.value)} /></Field>
      <FolderSelect label="Inside" value={parent} onChange={setParent} folders={folders} />
      <button className="btn" onClick={create}>Create folder</button>
      {msg && <Notice kind={msg.kind}>{msg.t}</Notice>}
    </section>
  );
}

export default function AddFiles() {
  const [params] = useSearchParams();
  const cur = idOrNull(params.get('folder'));
  const { data: folders } = useFolders(), { data: topics } = useTopics();
  if (!folders || !topics) return <p className="muted">Loading…</p>;
  return (
    <>
      <div className="head"><h1>Add files</h1><Link className="btn" to="/admin/files">Go to file manager</Link></div>
      <p className="muted">Add new material here. To browse, rename, move or delete files, use the file manager.</p>
      <div className="cols c332">
        <UploadCard folders={folders} topics={topics} cur={cur} />
        <CreateCard folders={folders} topics={topics} cur={cur} />
        <FolderCard folders={folders} cur={cur} />
      </div>
    </>
  );
}
