const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const settings = require('../shared/homeSettings.js');

test('edits during a pending main-site save remain in the draft preview', async () => {
  const slots = []; let cursor = 0, sent, resolveSave;
  const slot = initial => { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return index; };
  const React = {
    useRef: initial => slots[slot({ current: initial })],
    useState: initial => { const index = slot(initial); return [slots[index], update => { slots[index] = typeof update === 'function' ? update(slots[index]) : update; }]; },
  };
  const jsx = (type, props) => ({ type, props });
  const module = { exports: {} };
  vm.runInNewContext(transformSync(fs.readFileSync('src/pages/MainSiteSettings.jsx', 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code, {
    module, exports: module.exports,
    require: name => name === 'react' ? React : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx, Fragment: 'fragment' } :
      name.includes('homeSettings') ? settings : name.endsWith('/api.js') ? { api: (_, draft) => { sent = draft; return new Promise(resolve => { resolveSave = resolve; }); } } :
        { Link: 'link', Field: 'field', Notice: 'notice', default: 'preview' },
  });
  const render = () => { cursor = 0; return module.exports.MainSiteEditor({ initial: {} }); };
  const nodes = tree => {
    if (!tree || typeof tree !== 'object') return [];
    if (Array.isArray(tree)) return tree.flatMap(nodes);
    return [tree, ...nodes(tree.props?.children)];
  };
  let tree = render();
  const save = nodes(tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  const field = nodes(tree).find(node => node.props?.label === 'Headline opening');
  field.props.children.props.onChange({ target: { value: 'New unsaved headline' } });
  resolveSave({ settings: sent }); await save;
  tree = render();
  assert.equal(nodes(tree).find(node => node.props?.label === 'Headline opening').props.children.props.value, 'New unsaved headline');
  assert.match(nodes(tree).find(node => node.type === 'notice').props.children, /newer edits.*preview/);
});
