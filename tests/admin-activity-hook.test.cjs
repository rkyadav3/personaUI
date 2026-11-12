const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

function harness() {
  const document = new EventTarget(), window = new EventTarget();
  document.hidden = false;
  let cleanup, heartbeat, state, now = 0;
  const requests = [];
  const call = op => new Promise((resolve, reject) => requests.push({ op, resolve, reject }));
  const module = { exports: {} };
  const source = transformSync(fs.readFileSync('src/lib/useAdminActivity.js', 'utf8'), { format: 'cjs' }).code;
  vm.runInNewContext(source, {
    module, exports: module.exports, document, window,
    Date: { now: () => now },
    setInterval: callback => { heartbeat = callback; return 1; }, clearInterval() {},
    require: name => name === 'react' ? {
      useState: initial => { state = initial; return [state, update => { state = typeof update === 'function' ? update(state) : update; }]; },
      useEffect: effect => { cleanup = effect(); },
    } : { api: call },
  });
  module.exports.useAdminActivity({ id: 'maya', isSuperAdmin: false }, call);
  return { document, window, requests, get state() { return state; }, heartbeat: () => heartbeat(), idle: () => { now += 6 * 60000; }, close: () => cleanup() };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('returning during a pending heartbeat queues the activity refresh', async () => {
  const h = harness();
  h.requests[0].resolve({ hasChanges: false }); await flush();
  h.heartbeat();
  assert.equal(h.requests[1].op, 'activity.touch');
  h.idle(); h.window.dispatchEvent(new Event('pointerdown'));
  h.requests[1].resolve({ ok: true }); await flush();
  assert.equal(h.requests[2]?.op, 'activity.resume');
  h.requests[2].resolve({ hasChanges: true }); await flush();
  assert.equal(h.state.summary.hasChanges, true);
  h.close();
});

test('activity requests cannot update or restart after the admin leaves', async () => {
  const h = harness();
  h.idle(); h.window.dispatchEvent(new Event('pointerdown'));
  h.close(); h.requests[0].resolve({ hasChanges: true }); await flush();
  assert.equal(h.requests.length, 1);
  assert.equal(h.state.summary, null);
});
