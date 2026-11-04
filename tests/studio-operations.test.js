import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptedDatabase, step, hasEq } from './support/database.js';
import * as profile from '../server/profile.js';
import * as store from '../server/store.js';

const operations = () => import('../server/studioOperations.js');
const ctx = db => ({ db: db || { uid: 'owner' }, user: { id: 'owner', isAdmin: false } });

test('approved steps dispatch through existing admin services with the same owner scope', async () => {
  const { createStudioOperations } = await operations(), calls = [];
  const recorded = group => new Proxy({}, { get: (_, method) => async (...args) => { calls.push({ group, method, args }); return { id: 9 }; } });
  const service = createStudioOperations(Object.fromEntries(['profile', 'store', 'site', 'engage', 'events', 'commerce', 'invites', 'indexer'].map(group => [group, recorded(group)])));
  const cases = [
    ['profile.assistantSave', 'profile', 'profile', 'saveAssistantProfile'], ['profile.remove', 'profile', 'profile', 'deleteAssistantProfile'],
    ['page.save', 'portfolio', 'site', 'savePage'], ['contributions.save', 'contributions', 'profile', 'saveContribution'], ['contributions.delete', 'contributions', 'profile', 'deleteContribution'],
    ['offerings.save', 'offerings', 'profile', 'saveOffering'], ['offerings.delete', 'offerings', 'profile', 'deleteOffering'],
    ['updates.save', 'updates', 'engage', 'saveUpdate'], ['updates.delete', 'updates', 'engage', 'deleteUpdate'], ['events.deleteResponse', 'responses', 'events', 'deleteResponse'],
    ['enquiries.update', 'enquiries', 'engage', 'updateEnquiry'], ['enquiries.delete', 'enquiries', 'engage', 'deleteEnquiry'],
    ['purchases.fulfill', 'purchases', 'commerce', 'fulfillPurchase'], ['payments.saveSettings', 'payments', 'commerce', 'savePaymentSettings'],
    ['folders.create', 'folders', 'store', 'createFolder'], ['folders.rename', 'folders', 'store', 'renameFolder'], ['folders.delete', 'folders', 'store', 'deleteFolder'],
    ['files.createText', 'files', 'store', 'createTextFile'], ['files.save', 'files', 'store', 'saveFile'], ['files.delete', 'files', 'store', 'deleteFile'],
    ['topics.create', 'topics', 'store', 'createTopic'], ['topics.update', 'topics', 'store', 'updateTopic'], ['topics.delete', 'topics', 'store', 'deleteTopic'],
    ['posts.create', 'posts', 'store', 'createPost'], ['posts.save', 'posts', 'store', 'savePost'], ['posts.delete', 'posts', 'store', 'deletePost'],
    ['templates.save', 'templates', 'store', 'saveTemplate'], ['templates.delete', 'templates', 'store', 'deleteTemplate'],
    ['index.sync', 'knowledge', 'indexer', 'syncSources'], ['index.embed', 'knowledge', 'indexer', 'embedPending'], ['index.rebuild', 'knowledge', 'indexer', 'rebuildAll'],
  ];
  const context = ctx(), args = { id: 7, name: 'Name', title: 'Title', html: '<p>Safe</p>', description: 'Description', parentId: 3 };
  for (const [op, entity, group, method] of cases) {
    await service.execute(context, { op, entity, args });
    const call = calls.at(-1); assert.equal(call.group, group, op); assert.equal(call.method, method, op); assert.equal(call.args[0], context.db, op);
    if (['folders.rename', 'files.save', 'topics.update', 'posts.save', 'templates.save'].includes(op)) assert.equal(call.args[1], 7, op);
  }
});

test('account and invite actions recheck Super Admin permission at execution', async () => {
  const { createStudioOperations } = await operations(), calls = [];
  const service = createStudioOperations({ invites: new Proxy({}, { get: (_, method) => async (...args) => { calls.push({ method, args }); return { ok: true }; } }) });
  const cases = [['users.update', 'users', 'updateUser'], ['users.setLock', 'users', 'setUserLock'], ['users.delete', 'users', 'deleteUser'], ['invites.create', 'invites', 'createInvite'], ['invites.revoke', 'invites', 'revokeInvite']];
  for (const [op, entity, method] of cases) {
    await assert.rejects(service.execute(ctx(), { op, entity, args: { id: 'other', locked: true } }), /admin|permission/i);
    await service.execute({ ...ctx(), user: { ...ctx().user, isAdmin: true } }, { op, entity, args: { id: 'other', locked: true } });
    assert.equal(calls.at(-1).method, method);
    if (['users.delete', 'users.setLock'].includes(op)) assert.equal(calls.at(-1).args.at(-1), 'owner');
    if (op === 'invites.create') assert.equal(calls.at(-1).args[0], 'owner');
  }
});

test('unapproved operation names and mismatched tenants never reach an adapter', async () => {
  const { createStudioOperations } = await operations(), service = createStudioOperations();
  for (const request of [{ op: 'constructor', entity: 'profile', args: {} }, { op: 'users.resetPassword', entity: 'users', args: {} }, { op: 'topics.delete', entity: 'files', args: { id: 1 } }]) await assert.rejects(service.execute(ctx(), request), /unsupported|operation|area/i);
  await assert.rejects(service.execute({ ...ctx(), db: { uid: 'other' } }, { op: 'topics.delete', entity: 'topics', args: { id: 1 } }), /identity|scope|signed/i);
});

test('file snapshots include text and owner-bound folder/topic references without storage tokens', async () => {
  const { createStudioOperations } = await operations(), reads = [];
  const rows = async (db, table, columns) => {
    reads.push({ db, table, columns });
    return table === 'files' ? [{ id: 7, name: 'note.md', folder_id: 3, topic_id: 4, text_content: 'Keep this', status: 'draft', storage_path: 'private/path', token_hash: 'private' }] : table === 'folders' ? [{ id: 3, name: 'Notes', parent_id: null }] : [{ id: 4, name: 'Research', description: 'Topic' }];
  };
  const context = ctx(), state = await createStudioOperations({ rows }).read(context, ['files']);
  assert.equal(state.files[0].text, 'Keep this'); assert.equal(state.files[0].folderId, 3); assert.equal(state.files[0].topicId, 4); assert.equal(state.folders[0].parentId, null);
  assert.deepEqual(new Set(reads.map(item => item.table)), new Set(['files', 'folders', 'topics']));
  assert.ok(reads.every(item => item.db === context.db)); assert.doesNotMatch(JSON.stringify(state), /private/);
});

test('purchase snapshots load every page and expose fulfillment without payment credentials', async () => {
  const { createStudioOperations } = await operations(), pages = [];
  const service = createStudioOperations({ commerce: { listPurchases: async (db, args) => { pages.push(args.page); return { rows: [{ id: `receipt-${args.page}`, title: 'Guide', status: 'paid', fulfillmentStatus: args.page === 2 ? 'fulfilled' : 'pending', buyer: { name: 'Buyer' }, payment_credentials: 'private' }], total: 2, pageSize: 1 }; } } });
  const state = await service.read(ctx(), ['purchases']);
  assert.deepEqual(pages, [1, 2]); assert.equal(state.purchases[1].fulfilled, true); assert.equal(state.purchases[0].buyer.name, 'Buyer'); assert.doesNotMatch(JSON.stringify(state), /private/);
});

test('read snapshots cover retained offerings and Event responses while omitting private raw fields', async () => {
  const { createStudioOperations } = await operations();
  const values = {
    profiles: [], contributions: [{ id: 3, category: 'Books', enabled: true, visible: true }],
    offerings: [{ id: 4, contribution_id: 3, title: 'Book', delivery_url: 'https://example.test/access', active: true }],
    event_responses: [{ id: 8, event_id: 9, name: 'Visitor', response: 'going', token_hash: 'secret' }],
  };
  const service = createStudioOperations({ rows: async (_, table) => values[table] || [], engage: { listUpdates: async () => [{ id: 9, kind: 'event', title: 'Meetup' }], listEnquiries: async () => ({ rows: [{ id: 10, name: 'Visitor', status: 'new' }] }) } });
  const state = await service.read(ctx(), ['profile', 'offerings', 'responses', 'enquiries']);
  assert.equal(state.profile, null); assert.equal(state.offerings[0].contributionId, 3); assert.equal(state.offerings[0].deliveryUrl, 'https://example.test/access'); assert.equal(state.responses[0].eventId, 9); assert.equal(state.enquiries[0].status, 'new'); assert.doesNotMatch(JSON.stringify(state), /token_hash|secret/);
});

test('settings, counts and safe payment readiness are loaded only for requested areas', async () => {
  const { createStudioOperations } = await operations(), calls = [];
  const service = createStudioOperations({ site: { getSettings: async () => { calls.push('settings'); return { page: {}, portfolio: {}, bg: {} }; } }, store: { counts: async () => { calls.push('counts'); return { embedded: 12 }; } }, commerce: { paymentSettings: async () => { calls.push('payments'); return { enabled: true, configured: true, keyId: 'private-key', keySecret: 'secret' }; } } });
  const state = await service.read(ctx(), ['persona', 'look', 'knowledge', 'payments']);
  assert.deepEqual(calls.sort(), ['counts', 'payments', 'settings']); assert.equal(state.knowledge.embedded, 12); assert.equal(state.payments.configured, true); assert.doesNotMatch(JSON.stringify(state), /private-key|secret/);
  await assert.rejects(service.read(ctx(), ['users']), /admin|permission/i);
  await assert.rejects(service.read(ctx(), ['sql']), /area|unknown/i);
});

test('assistant profile save validates and writes all approved fields in a single update', async () => {
  assert.equal(typeof profile.saveAssistantProfile, 'function');
  const previous = { id: 7, name: 'Ravi', purpose: 'Building tools', ai_extracted: null };
  const db = scriptedDatabase({ table: 'profiles', data: [previous] }, { table: 'profiles', data: [{ id: 7 }] }); db.uid = 'owner';
  const result = await profile.saveAssistantProfile(db, { id: 7, name: 'Ravi', purpose: previous.purpose, designation: 'Designer', status: 'draft', visibility: { contact: { email: true } }, contact: { email: 'ravi@example.test' } });
  const update = step(db.calls[1], 'update')[0]; assert.equal(update.designation, 'Designer'); assert.equal(update.status, 'draft'); assert.equal(update.visibility.contact.email, true); assert.ok(hasEq(db.calls[1], 'id', 7)); assert.equal(result.id, 7);
  await assert.rejects(profile.saveAssistantProfile(db, { name: '' }), /name/i);
});

test('profile create and removal affect only the owner profile, preserving other roots', async () => {
  assert.equal(typeof profile.deleteAssistantProfile, 'function');
  const db = scriptedDatabase({ table: 'profiles', data: [] }, { table: 'profiles', data: [{ id: 8 }] }, { table: 'profiles', data: [{ id: 8 }] }, { table: 'profiles', data: [{ id: 8 }] }); db.uid = 'owner';
  await profile.saveAssistantProfile(db, { name: 'Ravi', purpose: 'New profile', status: 'published' });
  const insert = step(db.calls[1], 'insert')[0]; assert.equal(insert.status, 'published'); assert.ok(insert.confirmed_at);
  await profile.deleteAssistantProfile(db, { id: 8 });
  assert.equal(db.calls.length, 4); assert.ok(db.calls.every(call => call.table === 'profiles')); assert.ok(hasEq(db.calls[3], 'id', 8));
});

test('creating a post persists the reviewed title and status while retaining editor defaults', async () => {
  const db = scriptedDatabase({ table: 'posts', data: [{ id: 7 }] }, { table: 'posts', data: [{ id: 8 }] });
  await store.createPost(db, { title: 'My reviewed post', html: '<p>Hello</p>', status: 'published', topicId: 4 });
  assert.equal(step(db.calls[0], 'insert')[0].title, 'My reviewed post'); assert.equal(step(db.calls[0], 'insert')[0].status, 'published');
  await store.createPost(db); assert.equal(step(db.calls[1], 'insert')[0].title, 'Untitled'); assert.equal(step(db.calls[1], 'insert')[0].status, 'draft');
});

test('an approved file move and post template change persist without extra mutations', async () => {
  const db = scriptedDatabase({ table: 'files', data: [{ id: 7, name: 'note.md' }] }, { table: 'files', data: [] }, { table: 'posts', data: [] });
  await store.saveFile(db, 7, { name: 'note.md', status: 'draft', topicId: 4, folderId: 3 });
  assert.equal(step(db.calls[1], 'update')[0].folder_id, 3);
  await store.savePost(db, 9, { title: 'Title', html: '<p>Safe</p>', status: 'draft', templateId: 2 });
  assert.equal(step(db.calls[2], 'update')[0].template_id, 2);
});

test('a blank experience duration remains unknown when an approved profile is normalized again', () => {
  assert.equal(profile.normalizeDraft({ profile: { experience: { total_years: null } } }).profile.experience.total_years, null);
});

test('knowledge jobs report remaining work so a completed slice does not imply a complete index', async () => {
  const { createStudioOperations } = await operations();
  const service = createStudioOperations({ indexer: { embedPending: async () => ({ done: 2, remaining: 3 }), syncSources: async () => ({ added: 2, removed: 1 }) } });
  assert.match((await service.execute(ctx(), { op: 'index.embed', entity: 'knowledge', args: {} })).warning, /3.*remaining|3.*waiting/);
  assert.match((await service.execute(ctx(), { op: 'index.sync', entity: 'knowledge', args: {} })).warning, /embed/i);
});

test('Super Admin read views contain account metadata and invitation details without secrets', async () => {
  const { createStudioOperations } = await operations();
  const service = createStudioOperations({ invites: { listUsersDetailed: async () => [{ id: 'other', name: 'User', email: 'user@example.test', isAdmin: false, password_hash: 'private' }], listInvites: async () => [{ id: 3, code: 'TEAMCODE', max_uses: 2, uses: 1, revoked: false, created_by: 'private' }] } });
  const state = await service.read({ ...ctx(), user: { ...ctx().user, isAdmin: true } }, ['users', 'invites']);
  assert.equal(state.users[0].email, 'user@example.test'); assert.equal(state.invites[0].maxUses, 2); assert.doesNotMatch(JSON.stringify(state), /private/);
});
