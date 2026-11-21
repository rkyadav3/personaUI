import test from 'node:test';
import assert from 'node:assert/strict';

test('signed uploads report measured byte progress and resolve only after a successful response', async () => {
  const { uploadWithProgress } = await import('../src/lib/uploadProgress.js');
  let request; const progress = [];
  const result = uploadWithProgress({ url: 'https://storage.example', key: 'public-key', path: 'alice/file.pdf', token: 'signed-token',
    blob: new Blob(['data']), onProgress: value => progress.push(value), createRequest: () => request = {
      upload: {}, headers: {}, open(method, url) { this.method = method; this.url = url; }, setRequestHeader(key, value) { this.headers[key] = value; }, send(body) { this.body = body; },
    } });
  request.upload.onprogress({ lengthComputable: true, loaded: 2, total: 4 });
  assert.deepEqual(progress, [0.5]);
  assert.equal(request.method, 'PUT');
  assert.match(request.url, /object\/upload\/sign\/files\/alice\/file.pdf/);
  request.status = 200; request.onload();
  await result;
  assert.equal(progress.at(-1), 1);
  assert.equal(request.headers.apikey, 'public-key');
});

test('failed or timed-out uploads do not report success', async () => {
  const { uploadWithProgress } = await import('../src/lib/uploadProgress.js');
  for (const failure of ['http', 'network', 'timeout']) {
    let request; const progress = [];
    const result = uploadWithProgress({ url: 'https://storage.example', key: 'public', path: 'alice/file.pdf', token: 'token',
      blob: new Blob(['data']), onProgress: value => progress.push(value), createRequest: () => request = { upload: {}, open() {}, setRequestHeader() {}, send() {} } });
    if (failure === 'http') { request.status = 500; request.responseText = '{}'; request.onload(); }
    if (failure === 'network') request.onerror();
    if (failure === 'timeout') request.ontimeout();
    await assert.rejects(result);
    assert.equal(progress.includes(1), false);
  }
});
