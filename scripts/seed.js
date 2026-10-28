// Fills the site with fake-but-searchable content for testing.
//   npm run seed          add demo data (skips if files already exist)
//   npm run seed -- --reset   wipe all data first, then seed
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../config/db');
const { UPLOAD_DIR } = require('../config/upload');

if (process.argv.includes('--reset')) {
  db.exec('DELETE FROM posts; DELETE FROM files; DELETE FROM folders; DELETE FROM topics;');
  fs.readdirSync(UPLOAD_DIR).filter(f => f !== '.gitkeep').forEach(f => fs.rmSync(path.join(UPLOAD_DIR, f), { force: true }));
  console.log('Existing data wiped.');
} else if (db.prepare('SELECT COUNT(*) n FROM files').get().n > 0) {
  console.log('Files already exist. Run `npm run seed -- --reset` to start over.'); process.exit(0);
}

// deterministic random so every run gives the same data
let s = 42; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = a => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const TOPICS = [
  ['Protein folding', 'Predicting 3D structure from amino-acid sequences.', ['AlphaFold-style model', 'contact map', 'residue embedding', 'CASP benchmark', 'multiple sequence alignment']],
  ['Urban heat islands', 'How dense cities trap heat and what reduces it.', ['green roofs', 'albedo', 'street canyon', 'land surface temperature', 'tree canopy']],
  ['Quantum error correction', 'Keeping qubits reliable with redundancy.', ['surface code', 'logical qubit', 'syndrome measurement', 'decoder', 'threshold theorem']],
  ['Language model evaluation', 'Measuring what small language models really know.', ['perplexity', 'retrieval grounding', 'hallucination rate', 'benchmark contamination', 'few-shot prompting']],
  ['Coral reef restoration', 'Growing and transplanting heat-tolerant coral.', ['coral fragments', 'bleaching threshold', 'larval seeding', 'symbiont', 'reef rugosity']],
  ['Battery degradation', 'Why lithium-ion cells lose capacity over time.', ['SEI layer', 'lithium plating', 'cycle life', 'electrolyte additive', 'capacity fade']],
  ['Sleep and memory', 'How sleep stages consolidate learning.', ['slow-wave sleep', 'hippocampal replay', 'spindle density', 'REM', 'declarative memory']],
  ['Soil carbon', 'Storing carbon in farmland soils.', ['cover crops', 'no-till', 'microbial biomass', 'humus', 'carbon credit']],
  ['Graph neural networks', 'Learning on molecules, roads and social networks.', ['message passing', 'oversmoothing', 'node embedding', 'attention', 'graph pooling']],
  ['Low-cost water filtration', 'Clean water with materials available locally.', ['ceramic filter', 'biosand', 'turbidity', 'E. coli removal', 'flow rate']],
  ['Computational linguistics of Hindi', 'Tools and corpora for Hindi and code-mixed text.', ['transliteration', 'code-mixing', 'tokenizer', 'POS tagging', 'Devanagari']],
  ['Solar microgrids', 'Village-scale solar with storage in Rajasthan.', ['load profile', 'inverter', 'lead-acid storage', 'tariff', 'dust soiling']]
];
const KINDS = ['Literature review', 'Experiment log', 'Meeting notes', 'Method notes', 'Results summary', 'Open questions', 'Reading notes', 'Protocol'];
const SUBS = ['Papers', 'Notes', 'Data', 'Drafts'];

const sentence = (topic, terms) => {
  const t = pick(terms), u = pick(terms), n = int(2, 96), pct = (rnd() * 40 + 55).toFixed(1);
  return pick([
    `In experiment ${n}, adjusting the ${t} improved the main result to ${pct}%.`,
    `The ${t} turned out to depend strongly on the ${u}, which I had not expected.`,
    `I compared three approaches to ${t}; the second one was the most stable across ${int(3, 12)} runs.`,
    `A recurring problem in ${topic.toLowerCase()} is how the ${t} interacts with the ${u}.`,
    `My working hypothesis is that the ${u} limits progress more than the ${t} does.`,
    `Reviewer feedback asked me to justify the choice of ${t}; my answer is that it was the cheapest option that still worked.`,
    `Next step: repeat the ${t} measurement with ${int(20, 400)} samples and report the variance.`,
    `The literature on ${t} disagrees; one group reports ${pct}% while another finds a much lower figure.`
  ]);
};
const body = (topic, terms, n) => Array.from({ length: n }, () => sentence(topic, terms)).join(' ');
const para = (topic, terms) => `${body(topic, terms, int(3, 5))}\n\n`;

const insFolder = db.prepare('INSERT INTO folders (parent_id, name) VALUES (?, ?)');
const insFile = db.prepare(`INSERT INTO files (folder_id, topic_id, name, stored_name, mime, size, text_content, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
const insPost = db.prepare('INSERT INTO posts (title, html, status, topic_id) VALUES (?, ?, ?, ?)');
const insTopic = db.prepare('INSERT INTO topics (name, description) VALUES (?, ?)');

function writeFile(folder, topicId, name, text, status = 'published') {
  const stored = crypto.randomBytes(16).toString('hex') + path.extname(name);
  fs.writeFileSync(path.join(UPLOAD_DIR, stored), text);
  insFile.run(folder, topicId, name, stored, '', Buffer.byteLength(text), text, status);
}

let nFiles = 0, nFolders = 0, nPosts = 0;
db.exec('BEGIN');
const root = Number(insFolder.run(null, 'Research').lastInsertRowid); nFolders++;
TOPICS.forEach(([name, desc, terms]) => {
  const topicId = Number(insTopic.run(name, desc).lastInsertRowid);
  const tf = Number(insFolder.run(root, name).lastInsertRowid); nFolders++;
  SUBS.forEach(sub => {
    const sf = Number(insFolder.run(tf, sub).lastInsertRowid); nFolders++;
    const count = sub === 'Data' ? 8 : 10;
    for (let i = 1; i <= count; i++) {
      let fname, text, status = 'published';
      if (sub === 'Data') {
        fname = `measurements-${String(i).padStart(2, '0')}.csv`;
        text = 'run,sample,value,note\n' + Array.from({ length: 25 }, (_, r) => `${r + 1},${pick(terms)},${(rnd() * 100).toFixed(2)},${pick(['ok', 'noisy', 'rerun'])}`).join('\n');
      } else {
        const kind = pick(KINDS);
        fname = `${kind.toLowerCase().replace(/ /g, '-')}-${String(i).padStart(2, '0')}.${rnd() > 0.35 ? 'md' : 'txt'}`;
        text = `# ${name}: ${kind}\n\n` + Array.from({ length: int(3, 6) }, () => para(name, terms)).join('');
        if (sub === 'Drafts') status = 'draft';
      }
      writeFile(sf, topicId, fname, text, status); nFiles++;
    }
  });
  for (let i = 1; i <= 2; i++) { // a couple of posts per topic: one published, one draft
    const title = i === 1 ? `What I have learned about ${name.toLowerCase()}` : `Draft: open problems in ${name.toLowerCase()}`;
    const html = `<h1>${title}</h1>` + Array.from({ length: 4 }, () => `<p>${body(name, terms, int(3, 5))}</p>`).join('<h2>Next</h2>');
    insPost.run(title, html, i === 1 ? 'published' : 'draft', topicId); nPosts++;
  }
});
// a few known facts so you can check answers precisely
const facts = db.prepare("SELECT id FROM topics WHERE name='Solar microgrids'").get().id;
writeFile(root, facts, 'field-visit-jaipur.md', '# Field visit\n\nThe pilot microgrid near Jaipur serves 42 households. Dust soiling cut panel output by 18% in the first month, and cleaning every two weeks recovered most of it. The lead-acid battery bank was 48 kWh.\n'); nFiles++;
db.exec('COMMIT');

console.log(`Seeded ${TOPICS.length} topics, ${nFolders} folders, ${nFiles} files, ${nPosts} posts.`);
console.log('\nTry asking the chatbot:');
console.log('  - How many households does the Jaipur microgrid serve?');
console.log('  - How much did dust soiling reduce panel output?');
console.log('  - What do I think limits progress in battery degradation?');
console.log('  - What is the capital of France?   (should say it has nothing on that)');
