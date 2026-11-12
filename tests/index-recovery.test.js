import test from 'node:test';
import assert from 'node:assert/strict';
import { indexSource, syncSources } from '../server/indexer.js';
import { chunk } from '../server/chunker.js';

function memoryIndex() {
  const source = Array.from({ length: 220 }, (_, index) => `# Section ${index}\n\nThis section has enough words to become a separate knowledge passage.`).join('\n\n');
  const state = { files: [{ id: 1, name: 'Knowledge.md', text_content: source, status: 'published' }], posts: [], chunks: [], inserts: 0, failAt: 2 };
  const db = { uid: 'owner', from(table) {
    let operation = 'select', values, columns = '*', start = 0, end = Infinity;
    const filters = [], query = {
      select: value => { columns = value; return query; },
      eq: (field, value) => { filters.push(row => row[field] === value); return query; },
      range: (first, last) => { start = first; end = last; return query; },
      limit: count => { end = count - 1; return query; },
      insert: rows => { operation = 'insert'; values = rows; return query; },
      update: patch => { operation = 'update'; values = patch; return query; },
      delete: () => { operation = 'delete'; return query; },
      then: (resolve, reject) => Promise.resolve().then(() => {
        const matches = row => filters.every(filter => filter(row));
        if (operation === 'insert') {
          state.inserts++;
          if (state.inserts === state.failAt) return { error: { message: 'Interrupted second batch' } };
          state[table].push(...structuredClone(values));
        } else if (operation === 'update') state[table].filter(matches).forEach(row => Object.assign(row, values));
        else if (operation === 'delete') state[table] = state[table].filter(row => !matches(row));
        const rows = state[table].filter(matches).slice(start, end + 1);
        return { data: rows.map(row => columns === '*' ? structuredClone(row) : Object.fromEntries(columns.split(',').map(field => [field, row[field]]))), error: null };
      }).then(resolve, reject),
    };
    return query;
  } };
  return { db, state, expected: chunk(source).length };
}

test('an interrupted large index retries the entire source and certifies only the completed build', async () => {
  const { db, state, expected } = memoryIndex();
  await assert.rejects(indexSource(db, 'file', 1), /Interrupted/);
  assert.equal(state.chunks.length, 100);
  assert.ok(state.chunks.every(row => row.source_hash.startsWith('!building:')));
  assert.equal(await indexSource(db, 'file', 1), expected);
  assert.equal(state.chunks.length, expected);
  assert.ok(state.chunks.every(row => /^[0-9a-f]{40}$/.test(row.source_hash)));
  assert.equal(await indexSource(db, 'file', 1), 0);
});

test('full sync repairs legacy partial indexes even when their hash matches', async () => {
  const { db, state, expected } = memoryIndex(); state.failAt = -1;
  await indexSource(db, 'file', 1);
  state.chunks = state.chunks.slice(0, 100);
  assert.deepEqual(await syncSources(db), { removed: 1, added: 1 });
  assert.equal(state.chunks.length, expected);
  assert.deepEqual(await syncSources(db), { removed: 0, added: 0 });
});

test('matching hashes with duplicate ordinals are rebuilt instead of accepted', async () => {
  const { db, state, expected } = memoryIndex(); state.failAt = -1;
  await indexSource(db, 'file', 1);
  state.chunks[1].ord = 0;
  assert.equal(await indexSource(db, 'file', 1), expected);
  assert.equal(new Set(state.chunks.map(row => row.ord)).size, expected);
});
