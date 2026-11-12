import test from 'node:test';
import assert from 'node:assert/strict';
import { registerFile, signUploads, createTextFile, signedUrl, saveFile, deleteFile } from '../server/store.js';
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

test('generated upload names reject encoded traversal before signing or writing', async () => {
  let requests = 0;
  const storage = { createSignedUploadUrl: async () => { requests++; return { data: { token: 'test' } }; }, upload: async () => { requests++; return {}; } };
  const db = scriptedDatabase(); db.uid = 'owner';
  for (const name of ['notes.%2e%2e/%2e%2e/other-owner/secret%2etxt', 'notes.txt?upsert=true', 'notes.txt#fragment', 'notes.txt\\other', null, 42]) {
    await assert.rejects(signUploads(db, ['safe.txt', name], storage), /file name|file extension/i);
    await assert.rejects(createTextFile(db, { name, body: 'test' }, storage), /file name|file extension/i);
  }
  assert.equal(requests, 0); assert.equal(db.calls.length, 0);
});

test('safe display names generate single objects for the signed-in owner', async () => {
  const paths = [];
  const storage = {
    createSignedUploadUrl: async path => { paths.push(path); return { data: { token: 'test' } }; },
    upload: async path => { paths.push(path); return {}; },
  };
  const db = scriptedDatabase({ table: 'files', data: [{ id: 1 }] }); db.uid = 'owner';
  const names = ['100% complete.TXT', 'ज्ञान.md', 'README'];
  const signed = await signUploads(db, names, storage);
  assert.deepEqual(signed.map(row => row.name), names);
  await createTextFile(db, { name: 'Draft.txt', body: 'My text', status: 'draft' }, storage);
  for (const path of paths) assert.match(path, /^owner\/[0-9a-f-]{36}(?:\.[a-z0-9]+)?$/);
});

test('legacy invalid stored paths cannot be signed, overwritten or deleted', async () => {
  let requests = 0;
  const storage = { createSignedUrl: async () => { requests++; return {}; }, upload: async () => { requests++; return {}; }, remove: async () => { requests++; return {}; } };
  for (const operation of [db => signedUrl(db, 1, 3600, storage), db => saveFile(db, 1, { name: 'notes.txt', text: 'Changed' }, storage), db => deleteFile(db, 1, storage)]) {
    const db = scriptedDatabase({ table: 'files', data: [{ id: 1, name: 'notes.txt', storage_path: 'owner/../other-owner/private.txt' }] }); db.uid = 'owner';
    await assert.rejects(operation(db), /Bad storage path/);
    assert.equal(db.calls.length, 1);
  }
  assert.equal(requests, 0);
});
