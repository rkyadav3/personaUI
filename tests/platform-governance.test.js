import test from 'node:test';
import assert from 'node:assert/strict';
import { publicUser } from '../server/auth.js';
import * as admin from '../api/admin.js';
import { buildHomeFeed } from '../server/home.js';
import { createPublicRepository } from '../server/publicRepository.js';
import { scriptedDatabase, hasEq, step } from './support/database.js';
import { listInviteHistory, revokeInvite, createInvite } from '../server/invites.js';
import { publicProfile } from '../server/profile.js';

const response = () => ({ setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } });

test('configured admins cannot inherit the platform owner role', () => {
  const before = [process.env.ADMIN_EMAILS, process.env.SUPERADMIN_EMAILS];
  try {
    process.env.ADMIN_EMAILS = 'admin@example.test'; process.env.SUPERADMIN_EMAILS = 'owner@example.test';
    assert.equal(publicUser({ id: 'a', email: 'admin@example.test' }).isSuperAdmin, false);
    assert.equal(publicUser({ id: 'b', email: 'owner@example.test' }).isSuperAdmin, true);
    process.env.SUPERADMIN_EMAILS = '';
    assert.equal(publicUser({ id: 'a', email: 'admin@example.test' }).isSuperAdmin, true);
  } finally { for (const [i, key] of ['ADMIN_EMAILS', 'SUPERADMIN_EMAILS'].entries()) { if (before[i] === undefined) delete process.env[key]; else process.env[key] = before[i]; } }
});

test('private tags exclude profiles, offerings and products from the directory', () => {
  const data = buildHomeFeed({ profiles: [{ owner_id: 'a', status: 'published', name: 'Hidden knowledge' }], users: [{ id: 'a', slug: 'secret', tags: ['private'] }], sites: [{ owner_id: 'a', portfolio: { products: [{ id: 'secret', title: 'Secret notes' }] } }] });
  assert.deepEqual(data.members, []); assert.deepEqual(data.products, []); assert.deepEqual(data.offers, []);
});

test('private and suspended owners cannot be used for public checkout or event submissions', async () => {
  for (const properties of [{ tags: ['private'] }, { locked_until: '2099-01-01' }]) {
    const db = scriptedDatabase({ table: 'users', data: [{ id: 'a', ...properties }] });
    assert.equal(await createPublicRepository(() => db).owner('secret'), null);
    assert.equal(db.calls.length, 1);
  }
});

test('normal profiles keep Hero and Special tags public without exposing account fields', () => {
  const data = buildHomeFeed({ profiles: [{ owner_id: 'a', status: 'published', name: 'Public creator' }], users: [{ id: 'a', slug: 'public', email: 'secret@example.test', tags: ['hero', 'special'] }] });
  assert.deepEqual(data.members[0].tags, ['hero', 'special']);
  assert.doesNotMatch(JSON.stringify(data), /secret@example/);
});

test('tag validation rejects unknown values and private access only permits owner or SuperAdmin', async () => {
  const { normalizeTags, canViewProfile } = await import('../shared/governance.js');
  assert.deepEqual(normalizeTags(['hero', 'hero', 'private']), ['hero', 'private']);
  assert.throws(() => normalizeTags(['administrator']), /Unknown/);
  assert.throws(() => normalizeTags('private'), /array/);
  const owner = { id: 'a', tags: ['private'] };
  for (const viewer of [null, { id: 'b' }, { id: 'b', isAdmin: true }]) assert.equal(canViewProfile(owner, viewer), false);
  assert.equal(canViewProfile(owner, { id: 'a' }), true);
  assert.equal(canViewProfile(owner, { id: 'b', isSuperAdmin: true }), true);
  assert.equal(canViewProfile({ id: 'a', tags: ['hero'] }), true);
});

test('account holders can create invites but only SuperAdmins can manage customers', async () => {
  assert.equal(typeof admin.createPlatformOperations, 'function');
  const calls = [];
  const operations = admin.createPlatformOperations({ invitesService: {
    createInvite: async (...args) => { calls.push(args); return 'ABCD2345'; },
    listInviteHistory: async user => ({ codes: [{ created_by: user.id }], redemptions: [] }),
    revokeInvite: async (...args) => { calls.push(args); },
    listUsersDetailed: async () => [], listInvites: async () => [],
    updateUser: async () => { throw new Error('Must not be called'); },
  } });
  const member = { id: 'member', isAdmin: true, isSuperAdmin: false };
  const handler = admin.createAdminHandler({ sessionUser: async () => member, scoped: () => ({}), operations });
  const res = response();
  await handler({ method: 'POST', body: { op: 'invites.create', args: { created_by: 'spoofed' } } }, res);
  assert.equal(res.code, 200); assert.equal(calls[0][0], 'member');
  await handler({ method: 'POST', body: { op: 'invites.list' } }, res);
  assert.equal(res.value.codes[0].created_by, 'member');
  await handler({ method: 'POST', body: { op: 'users.update', args: { id: 'victim' } } }, res);
  assert.equal(res.code, 403);
  await handler({ method: 'POST', body: { op: 'invites.revoke', args: { id: 1 } } }, res);
  assert.equal(calls[1][1], member);
  await admin.createAdminHandler({ sessionUser: async () => null, operations })({ method: 'POST', body: { op: 'invites.create' } }, res);
  assert.equal(res.code, 401);
});

test('suggestions belong to their sender and ordinary admins only see their own', async () => {
  const { createSuggestionService } = await import('../server/governance.js');
  const db = scriptedDatabase({ table: 'platform_suggestions', data: [{ id: 1 }] }, { table: 'platform_suggestions', data: [] }, { table: 'platform_suggestions', data: [] });
  const service = createSuggestionService(() => db), user = { id: 'sender', isAdmin: true, name: 'Sender', email: 'sender@example.test' };
  await service.create(user, { title: 'Better search', kind: 'add', body: 'Let people search by tags.', owner_id: 'other' });
  const [insert] = step(db.calls[0], 'insert'); assert.equal(insert.owner_id, 'sender'); assert.equal(insert.status, 'new');
  await service.list(user); assert.ok(hasEq(db.calls[1], 'owner_id', 'sender'));
  await service.list({ ...user, isSuperAdmin: true }); assert.equal(step(db.calls[2], 'eq'), undefined);
  await assert.rejects(service.create(user, { title: '', kind: 'add', body: 'Description' }), e => e.status === 400);
  await assert.rejects(service.create(user, { title: 'Title', kind: 'bad', body: 'Description' }), e => e.status === 400);
  await assert.rejects(service.update(user, { id: 1, status: 'done' }), e => e.status === 403);
});

test('invite history and revocation are scoped to the creator, with global owner access', async () => {
  const member = { id: 'a' };
  const db = scriptedDatabase({ table: 'invite_codes', data: [{ id: 1, created_by: 'a' }] }, { table: 'invite_redemptions', data: [{ id: 1 }] }, { table: 'users', data: [{ id: 'a', name: 'Creator' }] });
  const history = await listInviteHistory(member, db);
  assert.equal(history.codes[0].creator.name, 'Creator');
  assert.ok(hasEq(db.calls[0], 'created_by', 'a')); assert.ok(hasEq(db.calls[1], 'created_by', 'a'));
  const global = scriptedDatabase({ table: 'invite_codes', data: [] }, { table: 'invite_redemptions', data: [] });
  await listInviteHistory({ isSuperAdmin: true }, global);
  assert.equal(step(global.calls[0], 'eq'), undefined); assert.equal(step(global.calls[1], 'eq'), undefined);
  const revoked = scriptedDatabase({ table: 'invite_codes', data: [{ id: 1 }] });
  await revokeInvite(1, member, revoked); assert.ok(hasEq(revoked.calls[0], 'created_by', 'a'));
  await assert.rejects(revokeInvite(1, member, scriptedDatabase({ table: 'invite_codes', data: [] })), e => e.status === 404);
  await assert.rejects(revokeInvite(-1, member, scriptedDatabase()), e => e.status === 400);
  const adminRevoked = scriptedDatabase({ table: 'invite_codes', data: [{ id: 2 }] });
  await revokeInvite(2, { isSuperAdmin: true }, adminRevoked); assert.equal(adminRevoked.calls[0].steps.some(entry => entry.method === 'eq' && entry.args[0] === 'created_by'), false);
});

test('invite creation records creator identity and never accepts spoofed audit fields', async () => {
  const db = scriptedDatabase({ table: 'users', data: [{ id: 'a', name: 'Creator', email: 'creator@example.test' }] }, { table: 'invite_codes', data: [] }, { table: 'invite_codes', data: [] });
  const code = await createInvite('a', { label: 'Recipient', created_by: 'other', creator_email: 'spoofed@example.test', maxUses: 2, days: 0 }, db);
  assert.match(code, /^[A-Z2-9]{8}$/);
  const [row] = step(db.calls.find(call => step(call, 'insert')), 'insert');
  assert.equal(row.created_by, 'a'); assert.equal(row.creator_email, 'creator@example.test'); assert.equal(row.expires_at, null);
  for (const args of [{ maxUses: -1 }, { maxUses: 1.5 }, { days: 366 }, { days: 'bad' }]) await assert.rejects(createInvite('a', args, scriptedDatabase()), e => e.status === 400);
});

test('direct private-profile requests stop before reading any knowledge or settings', async () => {
  for (const viewer of [null, { id: 'b', isAdmin: true }]) {
    const db = scriptedDatabase({ table: 'users', data: [{ id: 'a', tags: ['private'] }] });
    assert.equal(await publicProfile('private', viewer, db), null); assert.equal(db.calls.length, 1);
  }
});

test('suggestion review validates status, persists the owner response and reports missing records', async () => {
  const { createSuggestionService } = await import('../server/governance.js');
  const db = scriptedDatabase({ table: 'platform_suggestions', data: [{ id: 1 }] });
  const service = createSuggestionService(() => db), owner = { isSuperAdmin: true };
  assert.deepEqual(await service.update(owner, { id: 1, status: 'planned', reply: ' We will add this. ' }), { ok: true });
  const [row] = step(db.calls[0], 'update'); assert.equal(row.owner_reply, 'We will add this.'); assert.equal(row.status, 'planned');
  await assert.rejects(service.update(owner, { id: -1, status: 'planned' }), e => e.status === 400);
  await assert.rejects(service.update(owner, { id: 1, status: 'unknown' }), e => e.status === 400);
  await assert.rejects(createSuggestionService(() => scriptedDatabase({ table: 'platform_suggestions', data: [] })).update(owner, { id: 1, status: 'done' }), e => e.status === 404);
  await assert.rejects(createSuggestionService(() => scriptedDatabase({ table: 'platform_suggestions', error: { message: 'Unavailable' } })).list({ id: 'a' }), /Unavailable/);
});

test('AI Studio cannot bypass SuperAdmin permissions or read another creator’s invitations', async () => {
  const { createStudioOperations } = await import('../server/studioOperations.js');
  const { studioCatalog } = await import('../shared/studioAssistant.js');
  const { makeStudioPlan } = await import('../server/studioPlan.js');
  const actor = { user: { id: 'a', isAdmin: true, isSuperAdmin: false }, db: { uid: 'a' } }, calls = [];
  const service = createStudioOperations({ invites: {
    listInviteHistory: async user => { calls.push(user); return { codes: [] }; },
    revokeInvite: async (id, user) => { calls.push(user); },
  } });
  assert.equal(studioCatalog(actor.user).some(item => item.entity === 'users'), false);
  await assert.rejects(service.read(actor, ['users']), e => e.status === 403);
  await assert.rejects(service.execute(actor, { entity: 'users', op: 'users.delete', args: { id: 'b' } }), e => e.status === 403);
  assert.throws(() => makeStudioPlan({ actions: [{ entity: 'users', action: 'delete', id: 'b' }] }, { users: [{ id: 'b' }] }, actor.user), e => e.status === 403);
  await service.read(actor, ['invites']); await service.execute(actor, { entity: 'invites', op: 'invites.revoke', args: { id: 1 } });
  assert.deepEqual(calls, [actor.user, actor.user]);
});
