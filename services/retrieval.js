// Lightweight BM25 search over ONLY the owner's own data (files + published posts).
const File = require('../models/File');
const Post = require('../models/Post');

const STOP = new Set('a an and are as at be by for from has have in is it its of on or that the this to was were will with i my me you your do does what how why who which when'.split(' '));
const tokenize = s => (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 1 && !STOP.has(w));

let index = null;
exports.invalidate = () => { index = null; };

function chunk(text, size = 120, overlap = 20) {
  const words = text.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < words.length; i += size - overlap) out.push(words.slice(i, i + size).join(' '));
  return out;
}

function build() {
  const chunks = [];
  const add = (source, text) => chunk(text).forEach(t => chunks.push({ source, text: t, tokens: tokenize(t) }));
  File.indexable().forEach(f => add(f.name, f.text_content));
  Post.published().forEach(p => add(p.title, p.html));
  const df = {};
  chunks.forEach(c => new Set(c.tokens).forEach(t => { df[t] = (df[t] || 0) + 1; }));
  const avg = chunks.reduce((n, c) => n + c.tokens.length, 0) / (chunks.length || 1);
  index = { chunks, df, avg };
}

exports.search = (query, k = 4) => {
  if (!index) build();
  const q = tokenize(query), N = index.chunks.length, k1 = 1.4, b = 0.75;
  return index.chunks.map(c => {
    let score = 0;
    for (const t of q) {
      const tf = c.tokens.filter(x => x === t).length;
      if (!tf) continue;
      const idf = Math.log(1 + (N - (index.df[t] || 0) + 0.5) / ((index.df[t] || 0) + 0.5));
      score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * c.tokens.length / index.avg));
    }
    return { source: c.source, text: c.text, score };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
};
