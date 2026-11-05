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
const render = element => renderToStaticMarkup(React.createElement(MemoryRouter, {}, element));

test('Admin displays newest exchanges first, with the question above its reply', () => {
  const { StudioConversation } = require('../src/components/StudioAssistant.jsx');
  const messages = [{ id: '1:q', role: 'user', text: 'Older question' }, { id: '1:a', role: 'assistant', text: 'Older answer' }, { id: '2:q', role: 'user', text: 'Newest question' }, { id: '2:a', role: 'assistant', text: 'Newest answer' }];
  const html = render(React.createElement(StudioConversation, { messages }));
  assert.ok(html.indexOf('Newest question') < html.indexOf('Newest answer'));
  assert.ok(html.indexOf('Newest answer') < html.indexOf('Older question'));
  assert.match(html, /aria-label="Admin assistant conversation"/);
  assert.equal(messages[0].text, 'Older question');
});

test('Admin history exposes loading, errors, retry and older-message controls', () => {
  const { StudioConversation } = require('../src/components/StudioAssistant.jsx');
  const loading = render(React.createElement(StudioConversation, { messages: [], historyBusy: true }));
  assert.match(loading, /Loading.*history/); assert.match(loading, /role="status"/);
  const error = render(React.createElement(StudioConversation, { messages: [], historyError: 'Cannot load history', onLoadOlder() {} }));
  assert.match(error, /Cannot load history/); assert.match(error, /Retry/);
  const older = render(React.createElement(StudioConversation, { messages: [], historyBefore: '25', onLoadOlder() {} }));
  assert.match(older, /Load older/);
});

test('Admin keeps the typing form above the existing conversation box', () => {
  const StudioAssistant = require('../src/components/StudioAssistant.jsx').default;
  const html = render(React.createElement(StudioAssistant, { user: { id: 'owner' } }));
  assert.ok(html.indexOf('studio-command-input') < html.indexOf('Admin assistant conversation'));
});

test('public chat has an accessible multiline composer after the suggestions', () => {
  const PortfolioSite = require('../src/components/portfolio/PortfolioSite.jsx').default;
  const html = render(React.createElement(PortfolioSite, { data: { name: 'Ravi' }, slug: 'ravi', sub: 'chat', preview: true }));
  assert.match(html, /<textarea[^>]*aria-label="Message to Ravi"/);
  assert.match(html, /maxLength="500"/); assert.match(html, /aria-label="Send message"/);
  assert.ok(html.indexOf('pf-chat-prompts') < html.indexOf('pf-chat-composer'));
  assert.ok(html.indexOf('pf-conversation') < html.indexOf('pf-chat-composer'));
});

test('public chat panel expands to the visible viewport, including the mobile keyboard', async () => {
  const { chatPanelHeight } = await import('../src/lib/chatLayout.js');
  assert.equal(chatPanelHeight(220, { height: 900, offsetTop: 0 }), 664);
  assert.equal(chatPanelHeight(180, { height: 480, offsetTop: 80 }), 364);
  assert.equal(chatPanelHeight(600, { height: 400, offsetTop: 0 }), 200);
});

test('Enter sends, Shift+Enter adds a line, and IME composition never submits early', async () => {
  const { shouldSubmitChat } = await import('../src/lib/chatLayout.js');
  assert.equal(shouldSubmitChat({ key: 'Enter' }), true);
  for (const event of [{ key: 'Escape' }, { key: 'Enter', shiftKey: true }, { key: 'Enter', isComposing: true }, { key: 'Enter', nativeEvent: { isComposing: true } }, { key: 'Enter', keyCode: 229 }]) assert.equal(shouldSubmitChat(event), false);
});
