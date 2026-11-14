const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { transformSync } = require('esbuild');

function harness() {
  const states = [], refs = [], effects = [], requests = [], navigations = [], busy = [];
  let slot = 0, operation = { data: null, error: null, reload() {} };
  const react = {
    useState(initial) { const index = slot++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useRef(initial) { const index = slot++; return refs[index] ||= { current: initial }; },
    useEffect(callback, deps) {
      const index = slot++, before = effects[index];
      if (!before || deps.some((dep, i) => dep !== before.deps[i])) { before?.cleanup?.(); effects[index] = { deps, cleanup: callback() }; }
    },
  };
  const module = { exports: {} }, element = (type, props) => ({ type, props });
  const code = transformSync(fs.readFileSync('src/pages/Support.jsx', 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code;
  vm.runInNewContext(`${code}\nmodule.exports.testing = { NewRequest, SupportPage, ConversationPage };`, { module, exports: module.exports, require(name) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: element, jsxs: element, Fragment: 'fragment' };
    if (name === 'react-router-dom') return { useNavigate: () => route => navigations.push(route), Link: 'link' };
    if (name.includes('/api.js')) return { api: (op, args) => new Promise((resolve, reject) => requests.push({ op, args, resolve, reject })) };
    if (name.includes('/hooks.js')) return { useOp: () => operation };
    if (name.endsWith('/platformSupport.js')) return require('../shared/platformSupport.js');
    return {};
  } });
  return {
    requests, navigations, busy,
    render(name) { slot = 0; return module.exports.testing[name]({ onBusy: value => busy.push(value), user: { id: 'member' } }); },
    setOperation(value) { operation = value; },
    close() { effects.forEach(effect => effect?.cleanup?.()); },
  };
}
function find(node, type) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === type) return node;
  const children = [].concat(node.props?.children || []);
  for (const child of children) { const match = Array.isArray(child) ? child.map(entry => find(entry, type)).find(Boolean) : find(child, type); if (match) return match; }
  return null;
}

test('a delayed support creation cannot navigate after leaving its form', async () => {
  const h = harness(), tree = h.render('NewRequest');
  const pending = find(tree, 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(h.busy[0], true); assert.equal(h.requests[0].op, 'support.create');
  h.close(); h.requests[0].resolve({ id: 42 }); await pending;
  assert.equal(h.navigations.length, 0);
});

test('successful support creation opens its thread and releases the busy state', async () => {
  const h = harness(), tree = h.render('NewRequest');
  const pending = find(tree, 'form').props.onSubmit({ preventDefault() {} });
  h.requests[0].resolve({ id: 42 }); await pending;
  assert.deepEqual(h.navigations, ['/admin/support/42']); assert.deepEqual(h.busy, [true, false]);
  h.close();
});

test('failed support refresh preserves the loaded list component and its draft state', () => {
  const h = harness(), rows = [{ id: 42, title: 'Help' }];
  h.setOperation({ data: { rows }, error: null, reload() {} });
  const first = h.render('SupportPage');
  const list = first.props.children[1];
  h.setOperation({ data: null, error: 'Refresh unavailable', reload() {} });
  const failed = h.render('SupportPage');
  assert.equal(failed.props.children[1].type, list.type);
  assert.equal(failed.props.children[1].props.rows, rows);
  assert.equal(failed.props.children[0].props.error, 'Refresh unavailable');
  h.close();
});

test('a conversation read failure offers retry without submitting another reply', () => {
  const h = harness(), ticket = { id: 42 }, messages = [], reload = () => { retries++; };
  let retries = 0;
  h.setOperation({ data: { ticket, messages }, error: null, reload });
  const first = h.render('ConversationPage');
  h.setOperation({ data: null, error: 'Refresh unavailable', reload });
  const failed = h.render('ConversationPage'), error = failed.props.children[0];
  assert.equal(failed.props.children[1].type, first.props.children[1].type);
  assert.equal(failed.props.children[1].props.ticket, ticket);
  const retry = find(error.type(error.props), 'button');
  assert.equal(retry.props.children, 'Try again'); retry.props.onClick();
  assert.equal(retries, 1); assert.equal(h.requests.length, 0);
  h.close();
});
