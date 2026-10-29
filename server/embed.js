// Stage 2: turn text into meaning vectors with Google's gemini-embedding-001 (free tier).
import { env } from './config.js';

export const DIM = 768;
export const model = () => env('EMBED_MODEL', 'gemini-embedding-001');

/** Prefix each chunk with its document title and section so the vector knows where it came from. */
export const docText = c => `${c.source_name}${c.heading ? ` > ${c.heading}` : ''}\n${c.content}`;

const unit = v => { const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1; return v.map(x => x / n); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function embed(texts, task = 'RETRIEVAL_DOCUMENT') {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set.');
  const m = model();
  const body = { requests: texts.map(t => ({ model: `models/${m}`, content: { parts: [{ text: t }] }, taskType: task, outputDimensionality: DIM })) };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:batchEmbedContents`;
  let last = '';
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch(url, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.status === 429 || r.status >= 500) {        // rate limit or hiccup: back off and retry
      last = `${r.status}: ${(await r.text()).slice(0, 200)}`;
      await sleep(Math.min(60, 4 * 2 ** attempt) * 1000);
      continue;
    }
    if (!r.ok) throw new Error(`Embedding failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
    return (await r.json()).embeddings.map(e => unit(e.values));   // 768-d vectors are not pre-normalised by the API
  }
  throw new Error(`Embedding still failing after retries (${last}). Free tier limit reached? Try again in a minute.`);
}
