import test from 'node:test';
import assert from 'node:assert/strict';
import { registerFile } from '../server/store.js';
import { scriptedDatabase, step } from './support/database.js';

test('upload registration rejects paths that can escape tenant storage before any request', async () => {
  const db = scriptedDatabase(); db.uid = 'owner';
  let downloads = 0;
  const storage = { download: async () => { downloads++; throw new Error('Must not download'); } };
  for (const path of [null, 42, '', 'other/123.txt', 'owner/../other/private.txt', 'owner/../../../../../rest/v1/users?select=*', 'owner/%2e%2e/private.txt', 'owner/..\\other\\private.txt', 'owner/11111111-1111-4111-8111-111111111111.txt?select=*', 'owner/11111111-1111-4111-8111-111111111111.txt#fragment']) {
    await assert.rejects(registerFile(db, { path, name: 'copy.txt' }, storage), /Bad storage path/);
  }
  assert.equal(downloads, 0); assert.equal(db.calls.length, 0);
});

test('a valid signed upload registers its text under the original tenant object', async () => {
  const path = 'owner/11111111-1111-4111-8111-111111111111.txt';
  const db = scriptedDatabase({ table: 'files', data: [{ id: 1 }] }); db.uid = 'owner';
  const storage = { download: async value => { assert.equal(value, path); return { data: new Blob(['My knowledge']) }; } };
  await registerFile(db, { path, name: 'notes.txt' }, storage);
  const row = step(db.calls[0], 'insert')[0];
  assert.equal(row.storage_path, path); assert.equal(row.text_content, 'My knowledge');
});
