// Runs the actual Admin components with in-memory records. All fetches are intercepted;
// unsupported operations fail visibly instead of reaching production services.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import App from '../../src/App.jsx';
import { PAGE_DEFAULTS } from '../../shared/pageSettings.js';
import { PORTFOLIO_DEFAULTS } from '../../shared/portfolio.js';
import { normalizeBg } from '../../shared/siteSettings.js';
import { VISIBILITY_DEFAULTS } from '../../shared/profileSchema.js';
import '../../src/styles.css';

const user = { id: 'admin-ui-fixture', name: 'Ravi', email: 'owner@example.test', slug: 'ui-fixture', isAdmin: true };
const folders = [{ id: 1, name: 'Research papers', parent_id: null }];
const topics = [{ id: 1, name: 'Product design', description: 'Notes and articles on design.', files: 2, posts: 1 }];
let files = [
  { id: 1, name: 'Design guide.pdf', folder_id: null, topic_id: 1, size: 14000, status: 'published', created_at: '2026-11-01' },
  { id: 2, name: 'Workshop notes.md', folder_id: null, topic_id: 1, size: 1200, status: 'draft', text_content: 'Private workshop notes', created_at: '2026-11-02' },
  { id: 3, name: 'Reference.txt', folder_id: 1, topic_id: null, size: 300, status: 'published', text_content: 'Reference text', created_at: '2026-10-25' },
];
let templates = [{ id: 1, name: 'Research summary', html: '<h2>Context</h2><p>Introduce the research.</p><h2>Findings</h2><p>Summarize the findings.</p>' }];
let posts = [{ id: 1, title: 'Design principles', html: '<h2>Design principles</h2><p>Start with the user.</p>', topic_id: 1, status: 'published', updated_at: '2026-11-02' }];
const reviews = new Map(), turns = [];
let nextId = 10;
const counts = () => ({ files: files.length, posts: posts.filter(p => p.status === 'published').length, topics: topics.length, chunks: 5, embedded: 5 });
const profile = { name: user.name, status: 'published', visibility: VISIBILITY_DEFAULTS, expertise: ['Product design'] };
const page = { name: user.name, page: PAGE_DEFAULTS, portfolio: PORTFOLIO_DEFAULTS, bg: normalizeBg(), contributions: [], updates: [] };
const fixtureParams = new URLSearchParams(window.location.search);
window.fixturePreviewError = fixtureParams.get('previewError') === '1';

async function operation(op, args) {
  switch (op) {
    case 'auth.me': return { user };
    case 'auth.logout': return {};
    case 'profile.get': return { profile, contributions: [] };
    case 'site.get': return { ...page, heroUrl: null };
    case 'page.preview': if (window.fixturePreviewError) throw new Error('Fixture preview unavailable'); return page;
    case 'overview': return { counts: counts(), recent: files };
    case 'enquiries.count': return { new: 2 };
    case 'enquiries.list': return { rows: [], counts: { total: 0, new: 0, read: 0, replied: 0, archived: 0 } };
    case 'purchases.list': return { rows: [], summary: {}, total: 0, page: 1, pageSize: 50 };
    case 'payments.settings': return { enabled: false, configured: true, webhookConfigured: true, testMode: true };
    case 'users.list': return { users: [user], codes: [] };
    case 'invites.list': return { codes: [], redemptions: [] };
    case 'suggestions.list': return { rows: [] };
    case 'updates.list': return [];
    case 'folders.all': return folders;
    case 'folders.create': { const row = { id: nextId++, name: args.name, parent_id: args.parentId }; folders.push(row); return row; }
    case 'topics.list': return topics;
    case 'topics.create': { const row = { id: nextId++, name: args.name, description: args.description }; topics.push(row); return row; }
    case 'topics.update': Object.assign(topics.find(row => row.id === args.id), args); return {};
    case 'topics.delete': { const index = topics.findIndex(row => row.id === args.id); if (index >= 0) topics.splice(index, 1); return {}; }
    case 'files.all': return files;
    case 'files.list': return files.filter(row => args.q ? `${row.name} ${row.text_content || ''}`.toLowerCase().includes(args.q.toLowerCase()) : (row.folder_id ?? null) === (args.folderId ?? null));
    case 'files.get': return files.find(row => row.id === args.id);
    case 'files.save': Object.assign(files.find(row => row.id === args.id), { name: args.name, topic_id: args.topicId, status: args.status, text_content: args.text }); return {};
    case 'files.move': Object.assign(files.find(row => row.id === args.id), { folder_id: args.folderId }); return {};
    case 'files.delete': files = files.filter(row => row.id !== args.id); return {};
    case 'files.createText': { const row = { id: nextId++, name: args.name, text_content: args.body, folder_id: args.folderId, topic_id: args.topicId, status: args.status, size: args.body.length, created_at: new Date().toISOString() }; files.push(row); return row; }
    case 'posts.list': return posts;
    case 'posts.get': return posts.find(row => row.id === args.id);
    case 'posts.create': { const row = { id: nextId++, title: '', html: args.html, topic_id: args.topicId, status: 'draft' }; posts.push(row); return row; }
    case 'posts.save': Object.assign(posts.find(row => row.id === args.id), { title: args.title, html: args.html, topic_id: args.topicId, status: args.status }); return {};
    case 'posts.delete': posts = posts.filter(row => row.id !== args.id); return {};
    case 'templates.list': return templates;
    case 'templates.save': if (args.id) Object.assign(templates.find(row => row.id === args.id), args); else templates.push({ ...args, id: nextId++ }); return {};
    case 'templates.delete': templates = templates.filter(row => row.id !== args.id); return {};
    case 'index.counts': return counts();
    case 'index.settings': return { model: 'fixture', minSimilarity: 0.3, minKeywordRank: 0.1 };
    case 'index.refresh': if (window.fixtureIndexError) throw new Error('Fixture indexing unavailable'); return { waiting: 0 };
    case 'index.sources': return {};
    case 'index.sync': return { added: 0, removed: 0 };
    case 'index.embed': return { remaining: 0, done: 0 };
    case 'index.test': return [];
    case 'chat.list': return { rows: [{ id: 1, question: 'What do you teach?', answer: 'Product design.', answered: true, sources: ['Design guide.pdf'] }], total: 1, page: 1, pageSize: 50 };
    case 'studio.history': return { rows: [...turns].reverse(), nextBefore: null };
    case 'studio.prepare': {
      const readOnly = /help|what can/i.test(args.message);
      const review = readOnly ? null : { id: `review-${nextId++}`, status: 'pending', expiresAt: new Date(Date.now() + 600000).toISOString(), changes: [
        { id: 'new', kind: 'create', title: 'Add an article draft', fields: [{ path: 'title', before: null, after: 'New design article' }] },
        { id: 'edit', kind: 'update', title: 'Update your greeting', fields: [{ path: 'greeting', before: 'Hello', after: 'Welcome' }] },
      ] };
      if (review) reviews.set(review.id, review);
      const answer = readOnly ? 'Manage your page in Public profile, write in Content, and organize files in Library.' : 'I have prepared a draft. Review the proposed changes before applying.';
      const turn = { id: `turn-${nextId++}`, question: args.message, answer, reviewId: review?.id, createdAt: new Date().toISOString() }; turns.push(turn);
      return { answer, review, turn };
    }
    case 'studio.review': { const review = reviews.get(args.reviewId); if (!review) throw new Error('Fixture review not found'); return { review, status: review.status }; }
    case 'studio.apply': { const review = reviews.get(args.reviewId); review.status = 'applied'; return { status: 'applied', results: review.changes.map(change => ({ title: change.title, status: 'applied' })) }; }
    case 'studio.discard': { const review = reviews.get(args.reviewId); if (review) review.status = 'cancelled'; return { status: 'cancelled', results: [] }; }
    default: throw new Error(`Fixture does not support ${op}. No real request was sent.`);
  }
}
window.fetch = async (url, options) => {
  if (url !== '/api/admin') throw new Error('External requests are disabled in this fixture.');
  const { op, args = {} } = JSON.parse(options.body);
  window.fixtureRequests ||= [];
  window.fixtureRequests.push({ op, args });
  try { return new Response(JSON.stringify(await operation(op, args)), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
  catch (error) { return new Response(JSON.stringify({ error: error.message }), { status: 503, headers: { 'Content-Type': 'application/json' } }); }
};
const requestedRoute = fixtureParams.get('route') || '/admin/files';
const initialRoute = /^\/admin(?:\/|\?|$)/.test(requestedRoute) ? requestedRoute : '/admin/files';
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[initialRoute]}><App /></MemoryRouter>);
