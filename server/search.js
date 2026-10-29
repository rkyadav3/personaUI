// Run the same hybrid search the website uses (for the Test retrieval box).
import { env } from './config.js';
import { embed } from './embed.js';

const STOP = new Set('a an and are as at be by for from has have in is it its of on or that the this to was were will with i my me you your do does what how why who which when'.split(' '));

export const keywordQuery = q =>
  [...new Set((q.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 1 && !STOP.has(w)))].join(' | ');

export async function search(db, q, k = 6) {
  const [vec] = await embed([q], 'RETRIEVAL_QUERY');
  const { data, error } = await db.rpc('hybrid_search', {
    query_embedding: vec, keyword_query: keywordQuery(q), match_count: k,
    min_similarity: parseFloat(env('MIN_SIMILARITY', 0.6)), min_keyword_rank: parseFloat(env('MIN_KEYWORD_RANK', 0.2)),
  });
  if (error) throw new Error(error.message);
  return data;
}
