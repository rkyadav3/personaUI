// Ask Gemini for a JSON answer. The text is parsed and then validated by our own code, never trusted as-is.
import { env } from './config.js';

export async function generateJSON(system, user, { maxOutputTokens = 3000 } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set.');
  const model = env('GEMINI_MODEL', 'gemini-3.5-flash-lite');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature: 0, maxOutputTokens, responseMimeType: 'application/json' },
  };
  let last = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(url, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { last = `${r.status} ${(await r.text()).slice(0, 200)}`; if (r.status === 429 || r.status >= 500) continue; throw new Error(`AI request failed (${last})`); }
    const j = await r.json();
    const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').replace(/^```(?:json)?|```$/gim, '').trim();
    try { return JSON.parse(text); } catch { last = 'the model did not return valid JSON'; }
  }
  throw new Error(`The AI could not process that right now (${last}). Try again.`);
}
