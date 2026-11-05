import test from 'node:test';
import assert from 'node:assert/strict';

test('download opens its window before the signed URL request finishes and removes its opener', async () => {
  const { openFileDownload } = await import('../src/lib/fileDownload.js');
  const calls = [], popup = { opener: {}, location: { replace: url => calls.push(['navigate', url]) }, close: () => calls.push(['close']) };
  let resolve;
  const pending = openFileDownload({ id: 7, browser: { open: (...args) => { calls.push(['open', ...args]); return popup; } }, call: (op, args) => { calls.push(['request', op, args]); return new Promise(done => { resolve = done; }); } });
  assert.equal(calls[0][0], 'open');
  assert.equal(calls[1][0], 'request');
  assert.equal(popup.opener, null);
  resolve({ url: 'https://storage.example.test/file.pdf?token=fixture' });
  await pending;
  assert.deepEqual(calls[2], ['navigate', 'https://storage.example.test/file.pdf?token=fixture']);
  assert.deepEqual(calls[1], ['request', 'files.url', { id: 7 }]);
});

test('a blocked download window reports how to retry without requesting a signed URL', async () => {
  const { openFileDownload } = await import('../src/lib/fileDownload.js');
  await assert.rejects(openFileDownload({ id: 7, browser: { open: () => null }, call: () => assert.fail('No URL request should run') }), /blocked.*window/i);
});

test('a failed download closes the blank window and preserves the API error', async () => {
  const { openFileDownload } = await import('../src/lib/fileDownload.js');
  let closed = false;
  await assert.rejects(openFileDownload({ id: 7, browser: { open: () => ({ opener: null, close: () => { closed = true; } }) }, call: async () => { throw new Error('File was deleted'); } }), /File was deleted/);
  assert.equal(closed, true);
});

test('invalid signed URLs are rejected and a manually closed window is left closed', async () => {
  const { openFileDownload } = await import('../src/lib/fileDownload.js');
  let closed = false;
  await assert.rejects(openFileDownload({ id: 7, browser: { open: () => ({ close: () => { closed = true; } }) }, call: async () => ({ url: 'javascript:alert(1)' }) }), /Download link unavailable/);
  assert.equal(closed, true);
  await openFileDownload({ id: 7, browser: { open: () => ({ closed: true, location: { replace: () => assert.fail('Closed windows must not be navigated') } }) }, call: async () => ({ url: 'https://storage.example.test/file.pdf' }) });
});
