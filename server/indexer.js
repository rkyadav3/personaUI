// Keeps the knowledge index (chunks + vectors) in step with your content. Drafts are never indexed.
import { createHash, randomUUID } from 'node:crypto';
import { chunk, htmlToText } from './chunker.js';
import { env } from './config.js';
import { embed, docText, model } from './embed.js';
import { paged, run } from './supabase.js';

const CHUNK_VERSION = 'v1';   // bump if you change chunking rules to force a rebuild
const BATCH = 20;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const hash = (name, text) => createHash('sha1').update([name, text, CHUNK_VERSION, String(model())].join('\0')).digest('hex');

export const deleteSource = (db, key) => run(db.from('chunks').delete().eq('source_key', key));

function completeSource(rows, expectedHash, expectedCount) {
  return rows.length === expectedCount && new Set(rows.map(row => row.ord)).size === expectedCount &&
    rows.every(row => row.source_hash === expectedHash && Number.isInteger(row.ord) && row.ord >= 0 && row.ord < expectedCount);
}

async function insertChunks(db, kind, sid, name, text, parts = chunk(text)) {
  const key = `${kind}:${sid}`, h = hash(name, text), building = `!building:${randomUUID()}`;
  const rows = parts.map((c, i) => ({ source_key: key, source_type: kind, source_id: sid, source_name: name, source_hash: building, ord: i, heading: c.heading, content: c.text }));
  for (let i = 0; i < rows.length; i += 100) await run(db.from('chunks').insert(rows.slice(i, i + 100)));
  // A failed batch or killed serverless invocation leaves an incomplete marker.
  // Publish only this build's rows; never certify another concurrent build.
  if (rows.length) await run(db.from('chunks').update({ source_hash: h }).eq('source_key', key).eq('source_hash', building));
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
  const parts = chunk(src[1]);
  const current = await paged(db, 'chunks', 'source_hash,ord', query => query.eq('source_key', key));
  if (completeSource(current, hash(src[0], src[1]), parts.length)) return 0;
  await deleteSource(db, key);
  return insertChunks(db, kind, sid, src[0], src[1], parts);
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
  const have = new Map();
  for (const row of await paged(db, 'chunks', 'source_key,source_hash,ord')) {
    if (!have.has(row.source_key)) have.set(row.source_key, []);
    have.get(row.source_key).push(row);
  }
  const builds = new Map([...wanted].map(([key, [kind, sid, name, text]]) => [key, { kind, sid, name, text, parts: chunk(text), expectedHash: hash(name, text) }]));
  const matches = key => { const build = builds.get(key); return !!build && completeSource(have.get(key) || [], build.expectedHash, build.parts.length); };
  const stale = [...have.keys()].filter(key => !matches(key));
  for (const k of stale) await deleteSource(db, k);
  let added = 0;
  for (const [key, build] of builds)
    if (!matches(key)) { await insertChunks(db, build.kind, build.sid, build.name, build.text, build.parts); added++; }
  return { removed: stale.length, added };
}

export const rebuildAll = db => run(db.from('chunks').delete().gt('id', 0));
