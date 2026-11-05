import { useEffect, useId, useState } from 'react';
import JSZip from 'jszip';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { breadcrumbs, fmtSize, idOrNull } from '../lib/format.js';
import { useFolders, useOp, useTopics } from '../lib/hooks.js';
import { uploadToSigned } from '../lib/storage.js';
import { Confirm, Crumbs, Field, Loading, Notice, Progress } from '../components/Ui.jsx';
import { FolderSelect, TopicSelect } from '../components/Selects.jsx';
import AdminDialog from '../components/AdminDialog.jsx';
import AdminTabs from '../components/AdminTabs.jsx';
import Icon from '../components/portfolio/Icon.jsx';
import { LibraryFileList } from '../components/LibraryFileList.jsx';
import { filterLibraryFiles } from '../lib/fileLibrary.js';
import { openFileDownload } from '../lib/fileDownload.js';

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
  if (waiting > 0) return [{ kind: 'info', t: `${waiting} passages are waiting to become searchable. Open Library → AI knowledge and choose Sync published material to finish.` }];
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
  const titleId = useId();
  const [file, setFile] = useState(null);
  const [name, setName] = useState(''), [topic, setTopic] = useState(null), [text, setText] = useState(''), [dest, setDest] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [loadError, setLoadError] = useState(''), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0);
  const [downloadBusy, setDownloadBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadError('');
    api('files.get', { id }).then(f => {
      if (!active) return;
      if (!f) return setLoadError('This file no longer exists.');
      setFile(f); setName(f.name); setTopic(f.topic_id); setText(f.text_content || ''); setDest(f.folder_id); setMsgs([]);
    }, error => { if (active) setLoadError(error.message); });
    return () => { active = false; };
  }, [id, attempt]);

  if (!file) return <AdminDialog titleId={titleId} onClose={onClose}><h2 id={titleId}>File details</h2><Loading error={loadError} label="Loading file…" compact />{loadError && <button className="btn" onClick={() => setAttempt(value => value + 1)}>Retry</button>}</AdminDialog>;
  const editable = EDITABLE.test(file.name);
  const trail = file.folder_id ? breadcrumbs(folders, file.folder_id) : [];

  async function save(status) {
    if (busy) return;
    setBusy(true);
    try {
      const savedName = name.trim() || file.name;
      await api('files.save', { id, name: savedName, topicId: topic, status, text: editable ? text : null });
      setName(savedName);
      setFile(value => ({ ...value, name: savedName, topic_id: topic, status }));
      const r = await api('index.refresh', { kind: 'file', id }).catch(error => ({ error: error.message }));
      const out = [{ kind: 'success', t: status === 'draft' ? 'Saved as a private draft.' : 'Saved for AI indexing.' }];
      if (r.error) out.push({ kind: 'warn', t: `Saved, but indexing needs attention: ${r.error}` });
      else if (r.waiting > 0) out.push({ kind: 'info', t: `${r.waiting} passages are waiting to become searchable. Sync published material in Library → AI knowledge.` });
      setMsgs(out); onChanged();
    } catch (e) { setMsgs([{ kind: 'error', t: e.message }]); }
    finally { setBusy(false); }
  }

  async function download() {
    if (downloadBusy) return;
    setDownloadBusy(true);
    try { await openFileDownload({ id }); } catch (error) { setMsgs([{ kind: 'warn', t: error.message || 'Download unavailable. Try again.' }]); }
    finally { setDownloadBusy(false); }
  }

  async function changeFile(op, args, close = false) {
    if (busy) return;
    setBusy(true);
    try {
      await api(op, args);
      onChanged();
      if (close) onClose();
      else { setFile(value => ({ ...value, folder_id: dest })); setMsgs([{ kind: 'success', t: 'File moved.' }]); }
    } catch (e) { setMsgs([{ kind: 'error', t: e.message }]); }
    finally { setBusy(false); }
  }

  return (
    <AdminDialog titleId={titleId} onClose={onClose} busy={busy}>
      <fieldset className="admin-form-body" disabled={busy}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 id={titleId} style={{ margin: 0 }}>Manage file</h2>
        </div>

        <Crumbs parts={['All files', ...trail.map(c => c.name), file.name]} />

        <div className="cols c332" style={{ marginTop: 10 }}>
          <Field label="File Name"><input type="text" value={name} onChange={e => setName(e.target.value)} /></Field>
          <TopicSelect value={topic} onChange={setTopic} topics={topics} />
          <div><button className="btn block" style={{ marginTop: 22 }} onClick={download} disabled={downloadBusy}><Icon n="download" size={18} />{downloadBusy ? 'Preparing…' : 'Download'}</button></div>
        </div>

        {editable ? (
          <Field label="File Content">
            <textarea rows={12} value={text} onChange={e => setText(e.target.value)} />
          </Field>
        ) : (
          <p className="muted" style={{ fontSize: '.88rem', margin: '10px 0' }}>
            Edit this file on your device. Published documents with extracted text can be searched by your AI persona.
          </p>
        )}

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => save('draft')}>Save private draft</button>
          <button className="btn primary" onClick={() => save('published')}>{busy ? 'Saving…' : 'Save & publish to AI'}</button>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        {msgs.map((m, i) => <Notice key={i} kind={m.kind}>{m.t}</Notice>)}

        <div className="row" style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)', alignItems: 'flex-end' }}>
          <div className="grow"><FolderSelect label="Move to Folder" value={dest} onChange={setDest} folders={folders} /></div>
          <button className="btn" style={{ marginBottom: 12 }} onClick={() => changeFile('files.move', { id, folderId: dest })}>Move</button>
          <span style={{ marginBottom: 12 }}>
            <Confirm label="Delete File" warn="Are you sure? This removes the file and its searchable chunks from your AI persona." onConfirm={() => changeFile('files.delete', { id }, true)} />
          </span>
        </div>
      </fieldset>
    </AdminDialog>
  );
}

export default function FileManager({ defaultTab = 'browse' }) {
  const [params, setParams] = useSearchParams();
  const folder = idOrNull(params.get('folder'));
  const openFile = idOrNull(params.get('file'));
  const requestedTab = params.get('tab') || defaultTab;
  const currentTab = ['browse', 'upload', 'note'].includes(requestedTab) ? requestedTab : 'browse';
  const setTab = tab => setParams(p => { const n = Object.fromEntries(p); n.tab = tab; return n; });

  const [searchQuery, setSearchQuery] = useState('');
  const [fileType, setFileType] = useState('all'), [fileStatus, setFileStatus] = useState('all'), [sort, setSort] = useState('newest');
  const { data: foldersData, reload: reloadFolders, error: foldersError } = useFolders();
  const folders = foldersData ?? [];
  const { data: topicsData } = useTopics();
  const topics = topicsData ?? [];
  const { data: files, reload: reloadFiles, error } = useOp('files.list', { folderId: folder, q: searchQuery.trim() }, [folder, searchQuery]);

  const reload = () => { reloadFiles(); reloadFolders(); };
  const kids = searchQuery.trim() ? [] : (folders || []).filter(f => (f.parent_id ?? null) === folder).sort((a, b) => a.name.localeCompare(b.name));
  const topicName = Object.fromEntries((topics || []).map(t => [t.id, t.name]));
  const trail = breadcrumbs(folders || [], folder);
  const visibleFiles = filterLibraryFiles(files || [], { type: fileType, status: fileStatus, sort });
  const filtered = !!searchQuery.trim() || fileType !== 'all' || fileStatus !== 'all';
  const resetFilters = () => { setSearchQuery(''); setFileType('all'); setFileStatus('all'); };
  const chooseFolder = id => { resetFilters(); setParams(id ? { folder: id } : {}); };
  const inspectFile = id => setParams(p => { const n = Object.fromEntries(p); n.file = id; return n; });

  // Upload Tab State
  const [uploadFiles, setUploadFiles] = useState([]);
  const [unzip, setUnzip] = useState(true);
  const [uploadDest, setUploadDest] = useState(folder);
  const [uploadTopic, setUploadTopic] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('published');
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadMsgs, setUploadMsgs] = useState([]);
  const [dragging, setDragging] = useState(false);
  const addUploadFiles = incoming => setUploadFiles(previous => {
    const known = new Set(previous.map(file => `${file.name}:${file.size}:${file.lastModified}`));
    return [...previous, ...Array.from(incoming).filter(file => {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (known.has(key)) return false;
      known.add(key); return true;
    })];
  });

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
  const [folderOpen, setFolderOpen] = useState(false), [folderBusy, setFolderBusy] = useState(false);
  const folderTitleId = useId();
  useEffect(() => { setUploadDest(folder); }, [folder]);

  async function handleUpload() {
    if (uploadBusy || !uploadFiles.length) return;
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
            const row = await api('files.register', { path: signed[k].path, name, folderId: uploadDest, folderParts: parts, topicId: uploadTopic, status: uploadStatus, size: blob.size });
            newIds.push(row.id);
          } catch (e) { errors.push(`${rel}: ${e.message}`); }
          setUploadPct((b + k + 1) / Math.max(1, items.length));
        }
      }
      const out = errors.map(t => ({ kind: 'error', t }));
      if (newIds.length) out.push({ kind: 'success', t: `Uploaded ${newIds.length} file(s).` });
      if (uploadStatus === 'published') out.push(...(await finishIndexing(newIds)));
      else if (newIds.length) out.push({ kind: 'info', t: 'Saved privately. Open a file and publish it when you want the AI to use it.' });
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
    if (!newFolderName.trim() || folderBusy) return;
    setFolderBusy(true); setFolderMsg(null);
    try {
      await api('folders.create', { parentId: folder, name: newFolderName.trim() });
      setFolderMsg({ kind: 'success', t: `Folder "${newFolderName}" created.` });
      setNewFolderName('');
      setFolderOpen(false);
      reload();
    } catch (e) {
      setFolderMsg({ kind: 'error', t: e.message });
    } finally { setFolderBusy(false); }
  }

  return (
    <>
      <div className="head">
        <div>
          <h1>Files & notes</h1>
          <p className="muted" style={{ margin: 0 }}>
            Keep source documents and notes organized. Publish the material your AI should use.
          </p>
        </div>
      </div>

      {/* UX Guide Banner */}
      <div className="ux-guide-banner">
        <div className="ux-guide-icon"><Icon n="folder" size={24} /></div>
        <div className="ux-guide-content">
          <h4>From source material to answers</h4>
          <p>
            Add files → organize them into folders and topics → publish to AI. Draft notes stay private; published material becomes searchable after indexing.
          </p>
        </div>
      </div>

      {/* Page Tab Bar */}
      <AdminTabs label="File tools" value={currentTab} onChange={setTab} disabled={uploadBusy || noteBusy} items={[{ id: 'browse', label: 'Browse', icon: 'folder', count: files?.length }, { id: 'upload', label: 'Upload files', icon: 'upload' }, { id: 'note', label: 'Write a note', icon: 'pen' }]} />

      {/* TAB 1: BROWSE FILES */}
      {currentTab === 'browse' && (
        <>
          <section className="card library-browser">
            <div className="library-toolbar">
              <Crumbs parts={[{ label: 'All files', onClick: () => chooseFolder(null) }, ...trail.map(c => ({ label: c.name, onClick: () => chooseFolder(c.id) }))]} />
              <div className="row">
                <button type="button" className="btn small" onClick={() => { setFolderMsg(null); setFolderOpen(true); }}><Icon n="plus" size={17} />New folder</button>
                <button type="button" className="btn small primary" onClick={() => setTab('upload')}><Icon n="upload" size={17} />Upload</button>
              </div>
            </div>
            <div className="library-filters">
              <Field label="Search all files"><input type="search" placeholder="Name or contents…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></Field>
              <Field label="File type"><select value={fileType} onChange={e => setFileType(e.target.value)}><option value="all">All types</option><option value="documents">Documents</option><option value="text">Text & notes</option><option value="images">Images</option><option value="other">Other files</option></select></Field>
              <Field label="AI access"><select value={fileStatus} onChange={e => setFileStatus(e.target.value)}><option value="all">All statuses</option><option value="published">Published</option><option value="draft">Private drafts</option></select></Field>
              <Field label="Sort by"><select value={sort} onChange={e => setSort(e.target.value)}><option value="newest">Newest first</option><option value="name">Name A–Z</option><option value="largest">Largest first</option></select></Field>
            </div>
            {folderMsg && !folderOpen && <Notice kind={folderMsg.kind}>{folderMsg.t}</Notice>}
            {foldersError && <Notice kind="error">Could not load folders: {foldersError}<button type="button" className="btn small" onClick={reloadFolders}>Retry</button></Notice>}
            {kids.length > 0 && <div className="library-folders">{kids.map(f => <button type="button" key={f.id} onClick={() => chooseFolder(f.id)}><Icon n="folder" size={22} /><span>{f.name}</span><Icon n="arrow" size={16} /></button>)}</div>}
            {!files ? <><Loading error={error} label="Loading your files…" compact />{error && <button type="button" className="btn" onClick={reloadFiles}>Retry</button>}</> : <>
              <div className="library-results"><span>{visibleFiles.length} of {files.length} files in {searchQuery.trim() ? 'this search' : 'this folder'} · {fmtSize(visibleFiles.reduce((total, file) => total + (file.size || 0), 0))}</span>{filtered && <button type="button" className="btn link" onClick={resetFilters}>Clear filters</button>}</div>
              <LibraryFileList files={visibleFiles} topicNames={topicName} filtered={filtered} hasFolders={!!kids.length} onOpen={inspectFile} onUpload={() => setTab('upload')} onReset={resetFilters} />
            </>}
            <p className="library-hint">Published means available for AI indexing. <Link to="/admin/knowledge">Check AI knowledge</Link> for indexing status.</p>
          </section>
          {folderOpen && <AdminDialog titleId={folderTitleId} onClose={() => setFolderOpen(false)} busy={folderBusy}>
            <form onSubmit={handleCreateFolder}>
              <h2 id={folderTitleId}>New folder</h2><p className="muted">Create inside {trail.at(-1)?.name || 'All files'}.</p>
              <Field label="Folder name"><input autoFocus required maxLength={200} placeholder="e.g. Research papers" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} disabled={folderBusy} /></Field>
              {folderMsg?.kind === 'error' && <Notice kind="error">{folderMsg.t}</Notice>}
              <div className="row"><button className="btn primary" disabled={folderBusy || !newFolderName.trim()}>{folderBusy ? 'Creating…' : 'Create folder'}</button><button type="button" className="btn" disabled={folderBusy} onClick={() => setFolderOpen(false)}>Cancel</button></div>
            </form>
          </AdminDialog>}

          {/* File Inspector Modal */}
          {openFile && (
            <FileEditorModal
              key={openFile}
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
          <h3>Add files to your library</h3>
          <p className="muted" style={{ fontSize: '.88rem', margin: '0 0 16px' }}>
            Supported formats: PDF, DOCX, TXT, Markdown, CSV, JSON, and ZIP archives (which unzip automatically into folders).
          </p>

          <div className={`library-dropzone${dragging ? ' dragging' : ''}`} onDragOver={e => { e.preventDefault(); if (!uploadBusy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (!uploadBusy) addUploadFiles(e.dataTransfer.files); }}>
            <Icon n="upload" size={32} /><strong>Drop files here or browse your device</strong><p>Choose multiple documents or a ZIP archive.</p>
            <Field label="Choose files"><input type="file" multiple disabled={uploadBusy} onChange={e => { addUploadFiles(e.target.files); e.target.value = ''; }} /></Field>
          </div>
          {!!uploadFiles.length && <ul className="library-upload-list" aria-label="Selected files">{uploadFiles.map((file, index) => <li key={`${file.name}-${index}`}><Icon n="file" size={18} /><span>{file.name}<small>{fmtSize(file.size)}</small></span><button type="button" className="btn small" disabled={uploadBusy} aria-label={`Remove ${file.name}`} onClick={() => setUploadFiles(items => items.filter((_, i) => i !== index))}><Icon n="x" size={16} /></button></li>)}</ul>}

          <label className="row" style={{ marginBottom: 14 }}>
            <input
              type="checkbox"
              checked={unzip}
              disabled={uploadBusy}
              onChange={e => setUnzip(e.target.checked)}
            />
            <span>Unzip ZIP archives into folders automatically</span>
          </label>

          <fieldset className="admin-form-body" disabled={uploadBusy}><FolderSelect label="Destination Folder" value={uploadDest} onChange={setUploadDest} folders={folders} />
          <TopicSelect label="Assign to Research Topic (Optional)" value={uploadTopic} onChange={setUploadTopic} topics={topics} />
          <Field label="Availability"><select value={uploadStatus} onChange={e => setUploadStatus(e.target.value)}><option value="published">Publish to AI</option><option value="draft">Private draft</option></select></Field>
          <p className="hint">Private drafts are stored in your library. Published files become available for AI answers once indexed.</p></fieldset>

          <p className="muted" style={{ fontSize: '.85rem' }}>
            {uploadFiles.length ? `${uploadFiles.length} file(s) selected.` : 'No files selected yet.'}
          </p>

          <div className="row">
            <button
              className="btn primary"
              disabled={!uploadFiles.length || uploadBusy}
              onClick={handleUpload}
            >
              <Icon n="upload" size={18} />{uploadBusy ? 'Uploading…' : uploadStatus === 'published' ? 'Upload & publish to AI' : 'Upload privately'}
            </button>
            <button className="btn" disabled={uploadBusy} onClick={() => setTab('browse')}>Back to files</button>
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
          <h3>Create a note</h3>
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
