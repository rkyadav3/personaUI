// All database + storage operations for the admin. Every function takes the tenant-scoped client `db`.
import { randomUUID } from 'node:crypto';
import { BUCKET } from './config.js';
import { extOf, extractText, isText } from './extract.js';
import { paged, raw, run } from './supabase.js';

const nowIso = () => new Date().toISOString();
const first = async q => (await run(q.limit(1)))[0] || null;
const batches = (items, n = 100) => Array.from({ length: Math.ceil(items.length / n) }, (_, i) => items.slice(i * n, i * n + n));
const mimeOf = name => ({ '.pdf': 'application/pdf', '.md': 'text/markdown', '.txt': 'text/plain', '.csv': 'text/csv', '.json': 'application/json',
  '.html': 'text/html', '.htm': 'text/html', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }[extOf(name)] || 'application/octet-stream');

// ---------------- folders ----------------
export const allFolders = db => paged(db, 'folders', '*');
export const children = (db, parentId) => {
  const q = db.from('folders').select('*').order('name');
  return run(parentId == null ? q.is('parent_id', null) : q.eq('parent_id', parentId));
};
export const createFolder = async (db, parentId, name) => (await run(db.from('folders').insert({ parent_id: parentId ?? null, name: name.trim() }).select()))[0];
export const renameFolder = (db, id, name) => run(db.from('folders').update({ name: name.trim() }).eq('id', id));

/** Create nested folders for an uploaded folder/zip path, reusing existing ones. */
export async function ensurePath(db, parentId, parts) {
  let cur = parentId ?? null;
  for (const name of parts.filter(Boolean)) {
    let q = db.from('folders').select('id').eq('name', name);
    q = cur == null ? q.is('parent_id', null) : q.eq('parent_id', cur);
    const hit = await first(q);
    cur = hit ? hit.id : (await createFolder(db, cur, name)).id;
  }
  return cur;
}

export async function deleteFolder(db, id) {
  const fs = await allFolders(db);
  const ids = [id];
  let frontier = [id];
  while (frontier.length) { frontier = fs.filter(f => frontier.includes(f.parent_id)).map(f => f.id); ids.push(...frontier); }
  const files = await paged(db, 'files', 'id,storage_path', q => q.in('folder_id', ids));
  for (const b of batches(files.map(f => f.storage_path))) await raw().storage.from(BUCKET).remove(b);
  for (const b of batches(files.map(f => `file:${f.id}`))) await run(db.from('chunks').delete().in('source_key', b));
  await run(db.from('folders').delete().eq('id', id));   // cascades to subfolders and file rows
}

// ---------------- files ----------------
const FILE_COLS = 'id,folder_id,topic_id,name,mime,size,status,updated_at,created_at';

export const listFiles = (db, folderId) => {
  const q = db.from('files').select(FILE_COLS).order('name');
  return run(folderId == null ? q.is('folder_id', null) : q.eq('folder_id', folderId));
};
export const allFiles = db => paged(db, 'files', FILE_COLS);
export function searchFiles(db, text) {
  const t = String(text || '').replace(/[,()%*]/g, '').trim();
  return t ? run(db.from('files').select(FILE_COLS).or(`name.ilike.%${t}%,text_content.ilike.%${t}%`).limit(100)) : [];
}
export const getFile = (db, id) => first(db.from('files').select('*').eq('id', id));

/** Step 1 of an upload: hand the browser signed URLs so big files go straight to Supabase Storage. */
export async function signUploads(db, names) {
  return Promise.all(names.map(async name => {
    const path = `${db.uid}/${randomUUID()}${extOf(name)}`;
    const { data, error } = await raw().storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { path, token: data.token, name };
  }));
}

/** Step 2: the file is in storage; extract its text and create the row. */
export async function registerFile(db, { path, name, folderId, folderParts = [], topicId, status = 'published', size }) {
  if (!path.startsWith(`${db.uid}/`)) throw new Error('Bad storage path.');
  const dl = await raw().storage.from(BUCKET).download(path);
  if (dl.error) throw new Error(`Upload not found: ${dl.error.message}`);
  const buf = Buffer.from(await dl.data.arrayBuffer());
  const text = await extractText(name, buf);
  const folder = folderParts.length ? await ensurePath(db, folderId, folderParts) : folderId ?? null;
  const [row] = await run(db.from('files').insert({ folder_id: folder, topic_id: topicId ?? null, name, storage_path: path, mime: mimeOf(name),
    size: size ?? buf.length, text_content: text, status }).select());
  return row;
}

/** "Create a new text file": content comes from the editor, so it is written to storage here. */
export async function createTextFile(db, { name, folderId, topicId, body = '', status }) {
  const path = `${db.uid}/${randomUUID()}${extOf(name)}`;
  const data = Buffer.from(body, 'utf-8');
  const up = await raw().storage.from(BUCKET).upload(path, data, { contentType: mimeOf(name), upsert: true });
  if (up.error) throw new Error(up.error.message);
  const [row] = await run(db.from('files').insert({ folder_id: folderId ?? null, topic_id: topicId ?? null, name, storage_path: path,
    mime: mimeOf(name), size: data.length, text_content: body, status }).select());
  return row;
}

export async function saveFile(db, id, { name, topicId, status, text }) {
  const f = await getFile(db, id);
  if (!f) throw new Error('File not found.');
  const patch = { name: (name || '').trim() || f.name, topic_id: topicId ?? null, status, updated_at: nowIso() };
  if (text != null && isText(patch.name)) {
    const data = Buffer.from(text, 'utf-8');
    const up = await raw().storage.from(BUCKET).upload(f.storage_path, data, { contentType: f.mime || 'text/plain', upsert: true });
    if (up.error) throw new Error(up.error.message);
    Object.assign(patch, { text_content: text, size: data.length });
  }
  await run(db.from('files').update(patch).eq('id', id));
}

export const moveFile = (db, id, folderId) => run(db.from('files').update({ folder_id: folderId ?? null }).eq('id', id));

export async function deleteFile(db, id) {
  const f = await getFile(db, id);
  if (f) await raw().storage.from(BUCKET).remove([f.storage_path]);
  await run(db.from('chunks').delete().eq('source_key', `file:${id}`));
  await run(db.from('files').delete().eq('id', id));
}

export async function signedUrl(db, id, seconds = 3600) {
  const f = await getFile(db, id);
  if (!f) throw new Error('File not found.');
  const { data, error } = await raw().storage.from(BUCKET).createSignedUrl(f.storage_path, seconds);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// ---------------- topics ----------------
export async function topics(db) {
  const ts = await run(db.from('topics').select('*').order('name'));
  const tally = async table => {
    const out = {};
    for (const r of await paged(db, table, 'topic_id', q => q.not('topic_id', 'is', null))) out[r.topic_id] = (out[r.topic_id] || 0) + 1;
    return out;
  };
  const [fc, pc] = await Promise.all([tally('files'), tally('posts')]);
  return ts.map(t => ({ ...t, files: fc[t.id] || 0, posts: pc[t.id] || 0 }));
}
export const createTopic = async (db, name, description = '') => (await run(db.from('topics').insert({ name: name.trim(), description }).select()))[0];
export const updateTopic = (db, id, name, description) => run(db.from('topics').update({ name: name.trim(), description }).eq('id', id));
export const deleteTopic = (db, id) => run(db.from('topics').delete().eq('id', id));

// ---------------- posts ----------------
export const posts = db => run(db.from('posts').select('id,title,status,topic_id,updated_at').order('updated_at', { ascending: false }));
export const getPost = (db, id) => first(db.from('posts').select('*').eq('id', id));
export const createPost = async (db, { html = '<p></p>', topicId = null, templateId = null } = {}) =>
  (await run(db.from('posts').insert({ title: 'Untitled', html, status: 'draft', topic_id: topicId, template_id: templateId }).select()))[0];
export const savePost = (db, id, { title, html, topicId, status }) =>
  run(db.from('posts').update({ title: (title || '').trim() || 'Untitled', html, topic_id: topicId ?? null, status, updated_at: nowIso() }).eq('id', id));
export async function deletePost(db, id) {
  await run(db.from('chunks').delete().eq('source_key', `post:${id}`));
  await run(db.from('posts').delete().eq('id', id));
}

// ---------------- templates ----------------
export const templates = db => run(db.from('templates').select('*').order('name'));
export const saveTemplate = (db, id, name, html) => id
  ? run(db.from('templates').update({ name, html }).eq('id', id))
  : run(db.from('templates').insert({ name: name || 'Untitled template', html }));
export const deleteTemplate = (db, id) => run(db.from('templates').delete().eq('id', id));

// ---------------- counts ----------------
const count = async q => (await run(q.limit(1), true)).count || 0;
export async function counts(db) {
  const c = (t, f) => count(f(db.from(t).select('id', { count: 'exact' })));
  const [files, posts_, drafts, topics_, chunks, embedded, sizes] = await Promise.all([
    c('files', q => q), c('posts', q => q), c('posts', q => q.eq('status', 'draft')), c('topics', q => q),
    c('chunks', q => q), c('chunks', q => q.not('embedding', 'is', null)), paged(db, 'files', 'size'),
  ]);
  return { files, bytes: sizes.reduce((s, r) => s + (r.size || 0), 0), posts: posts_, drafts, topics: topics_, chunks, embedded };
}

export const chatLog = (db, n = 50) => run(db.from('chat_log').select('*').order('created_at', { ascending: false }).limit(n));
