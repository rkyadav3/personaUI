// Keeps the knowledge index (chunks + vectors) in step with your content. Drafts are never indexed.
import { createHash } from 'node:crypto';
import { chunk, htmlToText } from './chunker.js';
import { env } from './config.js';
import { embed, docText, model } from './embed.js';
import { paged, run } from './supabase.js';

const CHUNK_VERSION = 'v1';   // bump if you change chunking rules to force a rebuild
const BATCH = 20;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const hash = (name, text) => createHash('sha1').update([name, text, CHUNK_VERSION, String(model())].join('\0')).digest('hex');

export const deleteSource = (db, key) => run(db.from('chunks').delete().eq('source_key', key));

async function insertChunks(db, kind, sid, name, text) {
  const key = `${kind}:${sid}`, h = hash(name, text);
  const rows = chunk(text).map((c, i) => ({ source_key: key, source_type: kind, source_id: sid, source_name: name, source_hash: h, ord: i, heading: c.heading, content: c.text }));
  for (let i = 0; i < rows.length; i += 100) await run(db.from('chunks').insert(rows.slice(i, i + 100)));
  return rows.length;
}

/** Re-chunk one file/post if it changed. Removes it from the index if it is a draft or empty. */
export async function indexSource(db, kind, sid) {
  const key = `${kind}:${sid}`;
  let src = null;
  if (kind === 'file') {
    const [r] = await run(db.from('files').select('name,text_content,status').eq('id', sid).limit(1));
    if (r) src = [r.name, r.text_content, r.status];
  } else {
    const [r] = await run(db.from('posts').select('title,html,status').eq('id', sid).limit(1));
    if (r) src = [r.title, htmlToText(r.html), r.status];
  }
  if (!src || src[2] !== 'published' || !src[1].trim()) { await deleteSource(db, key); return 0; }
  const [cur] = await run(db.from('chunks').select('source_hash').eq('source_key', key).limit(1));
  if (cur && cur.source_hash === hash(src[0], src[1])) return 0;
  await deleteSource(db, key);
  return insertChunks(db, kind, sid, src[0], src[1]);
}

export async function pendingCount(db) {
  const { count } = await run(db.from('chunks').select('id', { count: 'exact' }).is('embedding', null).limit(1), true);
  return count || 0;
}

/** Embed chunks that have no vector yet, staying under the free-tier tokens-per-minute limit.
 *  Safe to call repeatedly; it resumes where it stopped. Returns { done, remaining }. */
export async function embedPending(db, maxSeconds = 45) {
  const t0 = Date.now(), tpm = parseFloat(env('EMBED_TPM', 24000));
  let done = 0;
  while ((Date.now() - t0) / 1000 < maxSeconds) {
    const rows = await run(db.from('chunks').select('id,source_name,heading,content').is('embedding', null).order('id').limit(BATCH));
    if (!rows.length) break;
    const t1 = Date.now();
    const vecs = await embed(rows.map(docText));
    await run(db.rpc('set_embeddings', { items: rows.map((r, i) => ({ id: r.id, embedding: vecs[i] })) }));
    done += rows.length;
    const wait = rows.reduce((s, r) => s + docText(r).length, 0) / 3.5 / (tpm / 60) * 1000 - (Date.now() - t1);
    if (wait > 0 && (Date.now() - t0) / 1000 + wait / 1000 < maxSeconds + 5) await sleep(wait);
  }
  return { done, remaining: await pendingCount(db) };
}

/** Used after an upload or save. Never throws: the save must stay successful even if embedding is unavailable. */
export async function refresh(db, kind, sid, seconds = 30) {
  try {
    await indexSource(db, kind, sid);
    return { waiting: (await embedPending(db, seconds)).remaining, error: null };
  } catch (e) {
    try { return { waiting: await pendingCount(db), error: e.message }; } catch { return { waiting: -1, error: e.message }; }
  }
}

/** Diff step of a full sync: add new/changed sources, drop deleted/unpublished ones. Embedding is a separate call. */
export async function syncSources(db) {
  const wanted = new Map();
  for (const f of await paged(db, 'files', 'id,name,text_content', q => q.eq('status', 'published')))
    if (f.text_content.trim()) wanted.set(`file:${f.id}`, ['file', f.id, f.name, f.text_content]);
  for (const p of await paged(db, 'posts', 'id,title,html', q => q.eq('status', 'published'))) {
    const t = htmlToText(p.html);
    if (t.trim()) wanted.set(`post:${p.id}`, ['post', p.id, p.title, t]);
  }
  const have = Object.fromEntries((await run(db.rpc('chunk_sources'))).map(r => [r.source_key, r.source_hash]));
  const stale = Object.keys(have).filter(k => !wanted.has(k) || hash(wanted.get(k)[2], wanted.get(k)[3]) !== have[k]);
  for (const k of stale) await deleteSource(db, k);
  let added = 0;
  for (const [k, [kind, sid, name, text]] of wanted)
    if (have[k] !== hash(name, text)) { await insertChunks(db, kind, sid, name, text); added++; }
  return { removed: stale.length, added };
}

export const rebuildAll = db => run(db.from('chunks').delete().gt('id', 0));
