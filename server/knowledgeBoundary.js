import { run } from './supabase.js';

// Retrieval results are candidates, never authority to expose content to a model.
// Re-read the owner's chunks and current published sources before constructing context.
export async function publishedPassages(db, candidates) {
  if (!db?.uid) throw new Error('Knowledge requires an account scope.');
  const ids = [...new Set((Array.isArray(candidates) ? candidates : []).slice(0, 30).map(row => String(row.id)).filter(id => /^\d+$/.test(id)))];
  if (!ids.length) return [];
  const chunks = await run(db.from('chunks').select('id,owner_id,source_type,source_id,source_name,heading,content').in('id', ids));
  const approved = new Set();
  await Promise.all(['file', 'post'].map(async kind => {
    const sourceIds = chunks.filter(row => row.owner_id === db.uid && row.source_type === kind).map(row => row.source_id);
    if (!sourceIds.length) return;
    const sources = await run(db.from(kind === 'file' ? 'files' : 'posts').select('id,owner_id').in('id', sourceIds).eq('status', 'published'));
    sources.filter(row => row.owner_id === db.uid).forEach(row => approved.add(`${kind}:${row.id}`));
  }));
  const byId = new Map(chunks.filter(row => row.owner_id === db.uid && approved.has(`${row.source_type}:${row.source_id}`)).map(row => [String(row.id), row]));
  return candidates.slice(0, 30).flatMap(candidate => {
    const row = byId.get(String(candidate.id));
    return row ? [{ id: row.id, source_name: row.source_name, heading: row.heading, content: row.content, similarity: candidate.similarity }] : [];
  });
}
