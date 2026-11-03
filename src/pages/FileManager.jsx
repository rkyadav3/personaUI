import { useEffect, useState } from 'react';
import JSZip from 'jszip';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { breadcrumbs, fmtDate, fmtSize, idOrNull } from '../lib/format.js';
import { useFolders, useOp, useTopics } from '../lib/hooks.js';
import { uploadToSigned } from '../lib/storage.js';
import { Confirm, Crumbs, Field, Notice, Pill, Progress } from '../components/Ui.jsx';
import { FolderSelect, TopicSelect } from '../components/Selects.jsx';

const MB = 1048576;
const EDITABLE = /\.(txt|md|markdown|csv|tsv|json|xml|html|htm|tex|js|py|r|yaml|yml|log|bib)$/i;

async function finishIndexing(ids) {
  if (!ids.length) return [];
  let error = null;
  for (let i = 0; i < ids.length; i += 20) {
    try { await api('index.sources', { kind: 'file', ids: ids.slice(i, i + 20) }); } catch (e) { error = e.message; }
  }
  let waiting = 0;
  try { waiting = (await api('index.embed', { seconds: 40 })).remaining; } catch (e) { error = error || e.message; }
  if (error) return [{ kind: 'warn', t: `Files are saved, but embedding needs attention: ${error}` }];
  if (waiting > 0) return [{ kind: 'info', t: `${waiting} chunks are still waiting to be embedded. Open Knowledge index and press Sync to finish.` }];
  return [{ kind: 'success', t: 'Indexed. The chatbot can now search and answer from these files.' }];
}

async function expandFiles(files, unzip, errors) {
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
        items.push({ rel: [base, ...parts].join('/'), get: () => e.async('blob') });
      }
    } else items.push({ rel: file.name, get: async () => file });
  }
  return items;
}

function FileEditorModal({ id, folders, topics, onClose, onChanged }) {
  const [file, setFile] = useState(null);
  const [name, setName] = useState(''), [topic, setTopic] = useState(null), [text, setText] = useState(''), [dest, setDest] = useState(null);
  const [msgs, setMsgs] = useState([]);

  useEffect(() => {
    api('files.get', { id }).then(f => {
      if (!f) return onClose();
      setFile(f); setName(f.name); setTopic(f.topic_id); setText(f.text_content || ''); setDest(f.folder_id); setMsgs([]);
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!file) return null;
  const editable = EDITABLE.test(file.name);
  const trail = file.folder_id ? breadcrumbs(folders, file.folder_id) : [];

  async function save(status) {
    try {
      await api('files.save', { id, name, topicId: topic, status, text: editable ? text : null });
      const r = await api('index.refresh', { kind: 'file', id });
      const out = [{ kind: 'success', t: status === 'draft' ? 'Saved as draft.' : !editable ? 'Saved.' : 'Published to AI index.' }];
      if (r.error) out.push({ kind: 'warn', t: `Saved, but indexing needs attention: ${r.error}` });
      else if (r.waiting > 0) out.push({ kind: 'info', t: `${r.waiting} chunks waiting to be embedded. Sync in Knowledge Index.` });
      setMsgs(out); onChanged();
    } catch (e) { setMsgs([{ kind: 'error', t: e.message }]); }
  }

  async function download() {
    try { window.open((await api('files.url', { id })).url, '_blank', 'noopener'); } catch { setMsgs([{ kind: 'warn', t: 'Download unavailable.' }]); }
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>File Inspector: {file.name}</h3>
          <button className="btn small" onClick={onClose}>✕ Close</button>
        </div>

        <Crumbs parts={['All files', ...trail.map(c => c.name), file.name]} />

        <div className="cols c332" style={{ marginTop: 10 }}>
          <Field label="File Name"><input type="text" value={name} onChange={e => setName(e.target.value)} /></Field>
          <TopicSelect value={topic} onChange={setTopic} topics={topics} />
          <div><button className="btn block" style={{ marginTop: 22 }} onClick={download}>Download 📥</button></div>
        </div>

        {editable ? (
          <Field label="File Content">
            <textarea rows={12} value={text} onChange={e => setText(e.target.value)} />
          </Field>
        ) : (
          <p className="muted" style={{ fontSize: '.88rem', margin: '10px 0' }}>
            This binary file (PDF/Word/image) cannot be edited directly in the browser, but its extracted text is searchable by your persona.
          </p>
        )}

        <div className="row" style={{ marginTop: 12 }}>
          {editable ? (
            <>
              <button className="btn" onClick={() => save('draft')}>Save as Draft (Private)</button>
              <button className="btn primary" onClick={() => save('published')}>Save &amp; Publish to AI</button>
            </>
          ) : (
            <button className="btn primary" onClick={() => save(file.status)}>Save Details</button>
          )}
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        {msgs.map((m, i) => <Notice key={i} kind={m.kind}>{m.t}</Notice>)}

        <div className="row" style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)', alignItems: 'flex-end' }}>
          <div className="grow"><FolderSelect label="Move to Folder" value={dest} onChange={setDest} folders={folders} /></div>
          <button className="btn" style={{ marginBottom: 12 }} onClick={async () => { await api('files.move', { id, folderId: dest }); onChanged(); }}>Move</button>
          <span style={{ marginBottom: 12 }}>
            <Confirm label="Delete File" warn="Are you sure? This removes the file and its searchable chunks from your AI persona." onConfirm={async () => { await api('files.delete', { id }); onClose(); onChanged(); }} />
          </span>
        </div>
      </div>
    </div>
  );
}

export default function FileManager({ defaultTab = 'browse' }) {
  const [params, setParams] = useSearchParams();
  const folder = idOrNull(params.get('folder'));
  const openFile = idOrNull(params.get('file'));
  const currentTab = params.get('tab') || defaultTab;
  const setTab = tab => setParams(p => { const n = Object.fromEntries(p); n.tab = tab; return n; });

  const [searchQuery, setSearchQuery] = useState('');
  const { data: folders = [], reload: reloadFolders } = useFolders();
  const { data: topics = [] } = useTopics();
  const { data: files, reload: reloadFiles, error } = useOp('files.list', { folderId: folder, q: searchQuery.trim() }, [folder, searchQuery]);

  const reload = () => { reloadFiles(); reloadFolders(); };
  const kids = searchQuery.trim() ? [] : (folders || []).filter(f => (f.parent_id ?? null) === folder).sort((a, b) => a.name.localeCompare(b.name));
  const topicName = Object.fromEntries((topics || []).map(t => [t.id, t.name]));
  const trail = breadcrumbs(folders || [], folder);

  // Upload Tab State
  const [uploadFiles, setUploadFiles] = useState([]);
  const [unzip, setUnzip] = useState(true);
  const [uploadDest, setUploadDest] = useState(folder);
  const [uploadTopic, setUploadTopic] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadMsgs, setUploadMsgs] = useState([]);

  // New Note Tab State
  const [noteName, setNoteName] = useState('');
  const [noteKind, setNoteKind] = useState('md');
  const [noteTopic, setNoteTopic] = useState(null);
  const [noteBody, setNoteBody] = useState('');
  const [noteMsgs, setNoteMsgs] = useState([]);
  const [noteBusy, setNoteBusy] = useState(false);

  // New Folder State
  const [newFolderName, setNewFolderName] = useState('');
  const [folderMsg, setFolderMsg] = useState(null);

  async function handleUpload() {
    setUploadBusy(true); setUploadPct(0); setUploadMsgs([]);
    const errors = [], newIds = [];
    try {
      const items = await expandFiles(uploadFiles, unzip, errors);
      for (let b = 0; b < items.length; b += 50) {
        const batch = items.slice(b, b + 50);
        const signed = await api('files.signUploads', { names: batch.map(i => i.rel.split('/').pop()) });
        for (let k = 0; k < batch.length; k++) {
          const { rel } = batch[k], parts = rel.split('/'), name = parts.pop();
          try {
            const blob = await batch[k].get();
            await uploadToSigned(signed[k].path, signed[k].token, blob);
            const row = await api('files.register', { path: signed[k].path, name, folderId: uploadDest, folderParts: parts, topicId: uploadTopic, size: blob.size });
            newIds.push(row.id);
          } catch (e) { errors.push(`${rel}: ${e.message}`); }
          setUploadPct((b + k + 1) / Math.max(1, items.length));
        }
      }
      const out = errors.map(t => ({ kind: 'error', t }));
      out.push({ kind: 'success', t: `Successfully uploaded ${newIds.length} file(s).` });
      out.push(...(await finishIndexing(newIds)));
      setUploadMsgs(out);
      setUploadFiles([]);
      reload();
    } catch (e) { setUploadMsgs([{ kind: 'error', t: e.message }]); }
    setUploadBusy(false);
  }

  async function handleCreateNote(status) {
    if (!noteName.trim()) return setNoteMsgs([{ kind: 'error', t: 'Please give your note a name.' }]);
    let fname = noteName.trim().replace(/\//g, '-');
    if (!fname.toLowerCase().endsWith('.' + noteKind)) fname += '.' + noteKind;
    setNoteBusy(true); setNoteMsgs([]);
    try {
      const row = await api('files.createText', { name: fname, folderId: folder, topicId: noteTopic, body: noteBody, status });
      const out = [{ kind: 'success', t: `Created ${fname} (${status}).` }];
      if (status === 'published') out.push(...(await finishIndexing([row.id])));
      setNoteMsgs(out); setNoteName(''); setNoteBody('');
      reload();
    } catch (e) { setNoteMsgs([{ kind: 'error', t: e.message }]); }
    setNoteBusy(false);
  }

  async function handleCreateFolder(e) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      await api('folders.create', { parentId: folder, name: newFolderName.trim() });
      setFolderMsg({ kind: 'success', t: `Folder "${newFolderName}" created.` });
      setNewFolderName('');
      reload();
    } catch (e) {
      setFolderMsg({ kind: 'error', t: e.message });
    }
  }

  return (
    <>
      <div className="head">
        <div>
          <h1>Files &amp; Storage Hub</h1>
          <p className="muted" style={{ margin: 0 }}>
            Upload, organize, and manage documents that feed your AI Persona.
          </p>
        </div>
      </div>

      {/* UX Guide Banner */}
      <div className="ux-guide-banner">
        <div className="ux-guide-icon">📁</div>
        <div className="ux-guide-content">
          <h4>How Your Persona Uses Files</h4>
          <p>
            When you publish files (PDFs, Word docs, notes), their contents are indexed. When a visitor asks a question on your public page, your AI finds the matching text and speaks an answer.
          </p>
        </div>
      </div>

      {/* Page Tab Bar */}
      <div className="page-tabs-wrap">
        <button className={`page-tab-btn ${currentTab === 'browse' ? 'active' : ''}`} onClick={() => setTab('browse')}>
          <span>📁 Browse Library</span>
          {files && <span className="page-tab-badge">{files.length}</span>}
        </button>
        <button className={`page-tab-btn ${currentTab === 'upload' ? 'active' : ''}`} onClick={() => setTab('upload')}>
          <span>📤 Upload Files &amp; ZIP</span>
        </button>
        <button className={`page-tab-btn ${currentTab === 'note' ? 'active' : ''}`} onClick={() => setTab('note')}>
          <span>📝 Write Quick Note</span>
        </button>
      </div>

      {/* TAB 1: BROWSE FILES */}
      {currentTab === 'browse' && (
        <>
          <section className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
              <Crumbs parts={[{ label: 'All Files', onClick: () => setParams({}) }, ...trail.map(c => ({ label: c.name, onClick: () => setParams({ folder: c.id }) }))]} />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="search"
                  placeholder="Search file names…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ width: 220 }}
                />
                <button className="btn small" onClick={() => setTab('upload')}>+ Upload</button>
              </div>
            </div>

            {/* Folder creation toggle / quick create */}
            <form onSubmit={handleCreateFolder} className="row" style={{ marginBottom: 16, background: '#f8fafc', padding: '10px 14px', borderRadius: 14, border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '.86rem', color: '#64748b', fontWeight: 600 }}>Create Subfolder:</span>
              <input
                type="text"
                placeholder="Folder name (e.g. Research Papers)"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                style={{ width: 240, padding: '6px 10px' }}
              />
              <button type="submit" className="btn small primary">+ New Folder</button>
              {folderMsg && <span style={{ fontSize: '.84rem', color: folderMsg.kind === 'error' ? '#ef4444' : '#10b981' }}>{folderMsg.t}</span>}
            </form>

            {/* Folder List */}
            {kids.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 16 }}>
                {kids.map(f => (
                  <button
                    key={f.id}
                    className="btn"
                    style={{ textAlign: 'left', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}
                    onClick={() => setParams({ folder: f.id })}
                  >
                    <span>📁</span>
                    <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</strong>
                  </button>
                ))}
              </div>
            )}

            {/* File Roster Table */}
            <div className="th files-grid">
              <span>File Name</span>
              <span>Topic</span>
              <span>Size</span>
              <span>Status</span>
              <span style={{ textAlign: 'right' }}>Actions</span>
            </div>

            {error && <Notice kind="error">{error}</Notice>}
            {files && !files.length && !kids.length && (
              <div style={{ textAlign: 'center', padding: '36px 0', color: '#64748b' }}>
                <p style={{ margin: '0 0 10px' }}>This folder is currently empty.</p>
                <button className="btn primary small" onClick={() => setTab('upload')}>Upload your first file</button>
              </div>
            )}

            {files?.map(f => (
              <div className="tr files-grid" key={f.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>📄</span>
                  <button
                    className="btn link"
                    style={{ fontWeight: 600, color: 'var(--text)' }}
                    onClick={() => setParams(p => { const n = Object.fromEntries(p); n.file = f.id; return n; })}
                  >
                    {f.name}
                  </button>
                </div>
                <span>{topicName[f.topic_id] || <span className="muted">—</span>}</span>
                <span className="muted" style={{ fontSize: '.84rem' }}>{fmtSize(f.size)}</span>
                <span><Pill status={f.status} /></span>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button
                    className="btn small"
                    onClick={() => setParams(p => { const n = Object.fromEntries(p); n.file = f.id; return n; })}
                  >
                    Inspect / Edit
                  </button>
                </div>
              </div>
            ))}
          </section>

          {/* File Inspector Modal */}
          {openFile && (
            <FileEditorModal
              id={openFile}
              folders={folders}
              topics={topics}
              onClose={() => setParams(p => { const n = Object.fromEntries(p); delete n.file; return n; })}
              onChanged={reload}
            />
          )}
        </>
      )}

      {/* TAB 2: UPLOAD FILES */}
      {currentTab === 'upload' && (
        <section className="card" style={{ maxWidth: 680 }}>
          <h3>Upload Research Files or ZIP</h3>
          <p className="muted" style={{ fontSize: '.88rem', margin: '0 0 16px' }}>
            Supported formats: PDF, DOCX, TXT, Markdown, CSV, JSON, and ZIP archives (which unzip automatically into folders).
          </p>

          <Field label="Choose Files from your device">
            <input
              type="file"
              multiple
              onChange={e => setUploadFiles([...e.target.files])}
              key={uploadBusy ? 'b' : uploadFiles.length}
            />
          </Field>

          <label className="row" style={{ marginBottom: 14 }}>
            <input
              type="checkbox"
              checked={unzip}
              onChange={e => setUnzip(e.target.checked)}
            />
            <span>Unzip ZIP archives into folders automatically</span>
          </label>

          <FolderSelect label="Destination Folder" value={uploadDest} onChange={setUploadDest} folders={folders} />
          <TopicSelect label="Assign to Research Topic (Optional)" value={uploadTopic} onChange={setUploadTopic} topics={topics} />

          <p className="muted" style={{ fontSize: '.85rem' }}>
            {uploadFiles.length ? `${uploadFiles.length} file(s) selected.` : 'No files selected yet.'}
          </p>

          <div className="row">
            <button
              className="btn primary"
              disabled={!uploadFiles.length || uploadBusy}
              onClick={handleUpload}
            >
              {uploadBusy ? 'Uploading & Indexing…' : 'Start Upload'}
            </button>
            <button className="btn" onClick={() => setTab('browse')}>Cancel</button>
          </div>

          {uploadBusy && (
            <div style={{ marginTop: 14 }}>
              <Progress value={uploadPct} />
              <span className="muted" style={{ fontSize: '.8rem' }}>Uploading and chunking for AI search…</span>
            </div>
          )}

          {uploadMsgs.map((m, i) => <Notice key={i} kind={m.kind}>{m.t}</Notice>)}
        </section>
      )}

      {/* TAB 3: NEW NOTE */}
      {currentTab === 'note' && (
        <section className="card" style={{ maxWidth: 680 }}>
          <h3>Write a Research Note</h3>
          <p className="muted" style={{ fontSize: '.88rem', margin: '0 0 16px' }}>
            Write structured notes, technical ideas, or summaries. Once published, your AI persona can cite this note when speaking to visitors.
          </p>

          <div className="cols c2">
            <Field label="Note Title / File Name">
              <input
                type="text"
                placeholder="e.g. quantum-computing-principles"
                value={noteName}
                onChange={e => setNoteName(e.target.value)}
              />
            </Field>
            <Field label="Format">
              <select value={noteKind} onChange={e => setNoteKind(e.target.value)}>
                <option value="md">Markdown (.md)</option>
                <option value="txt">Plain Text (.txt)</option>
                <option value="csv">CSV (.csv)</option>
                <option value="json">JSON (.json)</option>
              </select>
            </Field>
          </div>

          <TopicSelect label="Assign to Topic" value={noteTopic} onChange={setNoteTopic} topics={topics} />

          <Field label="Note Content">
            <textarea
              rows={10}
              placeholder="Write your research notes, bullet points, or reference material here…"
              value={noteBody}
              onChange={e => setNoteBody(e.target.value)}
            />
          </Field>

          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" disabled={noteBusy} onClick={() => handleCreateNote('draft')}>Save as Draft (Private)</button>
            <button className="btn primary" disabled={noteBusy} onClick={() => handleCreateNote('published')}>Create &amp; Publish to AI</button>
            <button className="btn" onClick={() => setTab('browse')}>Cancel</button>
          </div>

          {noteMsgs.map((m, i) => <Notice key={i} kind={m.kind}>{m.t}</Notice>)}
        </section>
      )}
    </>
  );
}
