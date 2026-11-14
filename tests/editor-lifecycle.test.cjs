const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { transformSync } = require('esbuild');
const { normalizePage } = require('../shared/pageSettings.js'), { normalizePortfolio } = require('../shared/portfolio.js'), { normalizeBg } = require('../shared/siteSettings.js');
const drafts = require('../src/lib/editorDrafts.js');
function harness(tab = 'hero') {
  const states = [], refs = [], effects = [], pendingEffects = [], requests = [], revoked = [];
  let slot = 0, sequence = 0, uploading = false;
  const user = { id: `editor-${Math.random()}`, slug: 'owner' };
  const react = {
    useState(initial) { const index = slot++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }]; },
    useRef(initial) { return refs[slot++] ||= { current: initial }; },
    useEffect(callback, deps) { const index = slot++, before = effects[index]; if (!before || deps.some((value, i) => value !== before.deps[i])) pendingEffects.push(() => { before?.cleanup?.(); effects[index] = { deps, cleanup: callback() }; }); },
  };
  const element = (type, props) => ['UploadGroup', 'PortfolioEditorContent'].includes(type?.name) ? type(props) : ({ type, props });
  const module = { exports: {} }, source = transformSync(fs.readFileSync('src/pages/PortfolioEditor.jsx', 'utf8'), { loader: 'jsx', format: 'cjs', jsx: 'automatic' }).code;
  vm.runInNewContext(source, { module, exports: module.exports, structuredClone, URLSearchParams, URL: { createObjectURL: () => `blob:${++sequence}`, revokeObjectURL: url => revoked.push(url) }, window: { addEventListener() {}, removeEventListener() {} }, require(name) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: element, jsxs: element, Fragment: 'fragment' };
    if (name === 'react-router-dom') return { useSearchParams: () => [new URLSearchParams(`tab=${tab}`), () => {}], Link: 'link' };
    if (name.endsWith('/auth.jsx')) return { useAuth: () => ({ user }) };
    if (name.endsWith('/api.js')) return { api: (op, args) => new Promise((resolve, reject) => requests.push({ op, args, resolve, reject })) };
    if (name.endsWith('/image.js')) return { prepareImage: async () => ({ blob: new Blob(['image']), type: 'image/webp' }) };
    if (name.endsWith('/storage.js')) return { uploadToSigned: async () => {} };
    if (name.endsWith('/MediaUpload.jsx')) return { UploadGroup: ({ children }) => children(uploading) };
    if (name.endsWith('/publicPageSettings.js')) return require('../src/lib/publicPageSettings.js');
    if (name.endsWith('/editorDrafts.js')) return drafts;
    if (name.startsWith('../../shared/')) return require(`../shared/${name.split('/').at(-1)}`);
    return {};
  } });
  return { requests, revoked, setUploading(value) { uploading = value; }, render() { slot = 0; const tree = module.exports.default(); while (pendingEffects.length) pendingEffects.shift()(); return tree; }, close() { effects.forEach(effect => effect?.cleanup?.()); drafts.clearEditorDraft(`${user.id}:appearance`); } };
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of [].concat(node.props?.children || []).flat()) { const found = find(child, predicate); if (found) return found; }
  return null;
}
async function loaded(tab = 'hero') {
  const h = harness(tab); h.render();
  h.requests.find(row => row.op === 'site.get').resolve({ version: 'v1', page: normalizePage(), portfolio: normalizePortfolio(), bg: normalizeBg(), heroUrl: 'https://example.test/portrait.webp', uploadedHeroUrl: 'https://example.test/portrait.webp' });
  h.requests.find(row => row.op === 'page.preview').resolve({ name: 'Owner' });
  await Promise.resolve(); h.render(); return h;
}
const button = (tree, label) => find(tree, node => node.type === 'button' && node.props.children === label);
test('Undo restores a removed saved portrait and does not request deletion on Save', async () => {
  const h = await loaded(); button(h.render(), 'Remove photo').props.onClick(); h.render();
  button(h.render(), 'Undo').props.onClick(); h.render();
  assert.ok(button(h.render(), 'Remove photo'), 'Restored portrait is present');
  const save = button(h.render(), 'Saved'); assert.equal(save.props.disabled, true, 'Undo restores a clean saved state'); h.close();
});
test('Undo removes a pending portrait upload without revoking URLs still used by history', async () => {
  const h = await loaded(), input = find(h.render(), node => node.type === 'input' && node.props.type === 'file');
  await input.props.onChange({ target: { files: [{}] } }); h.render();
  assert.equal(h.revoked.length, 0);
  button(h.render(), 'Undo').props.onClick(); h.render();
  const save = button(h.render(), 'Saved'); assert.equal(save.props.disabled, true);
  assert.equal(h.requests.filter(row => row.op === 'site.sign').length, 0); h.close();
});

test('canonical Store and legacy Products editor links retain the small heading control', async () => {
  for (const tab of ['store', 'products']) {
    const h = await loaded(tab);
    assert.ok(find(h.render(), node => node.props.label === 'Store small heading'), tab);
    h.close();
  }
});

test('pending media blocks settings save and preview handoff until the upload finishes', async () => {
  const h = await loaded(); button(h.render(), 'Remove photo').props.onClick(); h.render();
  h.setUploading(true);
  const tree = h.render();
  assert.equal(button(tree, 'Saving…').props.disabled, true);
  let prevented = false;
  tree.props.onClickCapture({ target: { closest: () => ({ tagName: 'A' }) }, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  h.setUploading(false); assert.equal(button(h.render(), 'Save changes').props.disabled, false); h.close();
});
