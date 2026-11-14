const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const { transformSync } = require('esbuild');
Module._extensions['.jsx'] = (module, file) => module._compile(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'jsx', format: 'cjs', jsx: 'automatic' }).code, file);
Module._extensions['.css'] = () => {};
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { MemoryRouter } = require('react-router-dom');
const render = (Component, props, path = '/admin') => renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Component, props)));

test('legacy and detail links select the category and the correct secondary page', async () => {
  const { adminLocation } = await import('../src/lib/adminNavigation.js');
  for (const [path, search, group, page] of [
    ['/admin/portfolio', '?tab=projects', 'settings', 'editor'],
    ['/admin/profile', '?tab=contrib', 'store', 'catalogue'],
    ['/admin/writing/18', '', 'pipelines', 'content'],
    ['/admin/writing', '?tab=templates', 'pipelines', 'content'],
    ['/admin/templates', '', 'pipelines', 'content'],
    ['/admin/topics/7', '', 'pipelines', 'content'],
    ['/admin/add', '', 'pipelines', 'files'],
    ['/admin/knowledge', '', 'pipelines', 'knowledge'],
    ['/admin/questions', '', 'inbox', 'questions'],
    ['/admin/superadmin', '?tab=invites', 'platform', 'invites'],
  ]) assert.deepEqual(adminLocation(path, search), { group, page }, path);
  assert.equal(adminLocation('/admin/writing-other'), null);
});

test('content and knowledge exposes one Content destination instead of separate writing pages', () => {
  const { AdminSectionTabs } = require('../src/components/AdminNavigation.jsx');
  const html = render(AdminSectionTabs, { user: { isAdmin: false } }, '/admin/topics/7');
  for (const text of ['Content', 'Files &amp; notes', 'AI knowledge', 'Content &amp; knowledge pages']) assert.ok(html.includes(text), text);
  assert.match(html, /<a(?=[^>]*href="\/admin\/writing\?tab=posts")(?=[^>]*aria-current="page")[^>]*>/);
  assert.doesNotMatch(html, /superadmin/);
});

test('SVG loading state is labelled and errors replace the animation', () => {
  const { Loading } = require('../src/components/Ui.jsx');
  const html = render(Loading, { label: 'Loading your files' });
  assert.match(html, /role="status"/);
  assert.match(html, /<svg/);
  assert.match(html, /Loading your files/);
  const error = render(Loading, { error: 'Files unavailable' });
  assert.match(error, /role="alert"/);
  assert.doesNotMatch(error, /<svg/);
});

test('pending AI changes open a labelled approval dialog with a plain summary', () => {
  const { StudioApproval } = require('../src/components/StudioAssistant.jsx');
  const review = { id: 'draft', status: 'pending', changes: [
    { id: 'one', kind: 'create', title: 'Create workshop', fields: [] },
    { id: 'two', kind: 'update', title: 'Change greeting', fields: [{ path: 'greeting', before: 'Hi', after: 'Welcome' }] },
    { id: 'three', kind: 'delete', title: 'Remove old folder', warning: 'Files will be deleted.', fields: [] },
  ] };
  const html = render(StudioApproval, { review, onApprove() {}, onDiscard() {} });
  assert.match(html, /<dialog[^>]*aria-labelledby=/);
  for (const text of ['Proposed changes', '1 addition', '1 update', '1 deletion', 'Create workshop', 'Change greeting', 'Remove old folder', 'Before', 'After', 'Approve and apply', 'Discard', 'Close proposed changes']) assert.ok(html.includes(text), text);
  assert.equal(render(StudioApproval, { review: null }), '');
  assert.doesNotMatch(render(StudioApproval, { review: { ...review, status: 'applied' } }), /<dialog/);
});

test('file type, status and sort work together without mutating the server rows', async () => {
  const { filterLibraryFiles } = await import('../src/lib/fileLibrary.js');
  const rows = [
    { id: 1, name: 'Zeta.pdf', status: 'published', size: 20, created_at: '2026-01-01' },
    { id: 2, name: 'Alpha.md', status: 'draft', size: 10, created_at: '2026-03-01' },
    { id: 3, name: 'Beta.docx', status: 'published', size: 40, created_at: '2026-02-01' },
  ];
  assert.deepEqual(filterLibraryFiles(rows, { type: 'documents', status: 'published', sort: 'largest' }).map(x => x.id), [3, 1]);
  assert.deepEqual(filterLibraryFiles(rows, { type: 'text', sort: 'name' }).map(x => x.id), [2]);
  assert.deepEqual(filterLibraryFiles(rows, { sort: 'newest' }).map(x => x.id), [2, 3, 1]);
  assert.deepEqual(rows.map(x => x.id), [1, 2, 3]);
});

test('file empty states distinguish filters from an empty folder and offer the next step', () => {
  const { LibraryFileList } = require('../src/components/LibraryFileList.jsx');
  const empty = render(LibraryFileList, { files: [], onUpload() {} });
  assert.match(empty, /Upload your first file/);
  const filtered = render(LibraryFileList, { files: [], filtered: true, onReset() {} });
  assert.match(filtered, /No matching files/);
  assert.match(filtered, /Clear filters/);
  assert.doesNotMatch(filtered, /Upload your first file/);
});

test('uploads explain private drafts and publishing before buyers select files', () => {
  const FileManager = require('../src/pages/FileManager.jsx').default;
  const html = render(FileManager, {}, '/admin/files?tab=upload');
  for (const text of ['Publish to AI', 'Private draft', 'Drop files', 'Choose files']) assert.ok(html.includes(text), text);
  assert.match(html, /type="file" multiple=""/);
  assert.doesNotMatch(html, /Successfully uploaded/);
});

test('an expired or busy approval cannot apply changes and API errors stay inside the dialog', () => {
  const { StudioApproval } = require('../src/components/StudioAssistant.jsx');
  const review = { id: 'draft', status: 'pending', expiresAt: '2000-01-01', changes: [{ id: 'one', kind: 'create', title: 'Create event', fields: [] }] };
  const html = render(StudioApproval, { review, busy: 'applying', error: 'Save unavailable' });
  assert.match(html, /<dialog[\s\S]*role="alert"[\s\S]*Save unavailable[\s\S]*<\/dialog>/);
  assert.match(html, /disabled="">Applying…/);
  assert.match(html, /Close proposed changes" disabled=""/);
});
