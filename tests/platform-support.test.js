import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scriptedDatabase, hasEq, step } from './support/database.js';
import { createSupportService } from '../server/platformSupport.js';
import { createAdminHandler, createPlatformOperations } from '../api/admin.js';

const member = { id: 'member', isAdmin: true, name: 'Maya', email: 'maya@example.test' };
const owner = { id: 'owner', isSuperAdmin: true };
const response = () => ({ setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } });

test('support requests use authenticated sender identity and validate input before writes', async () => {
  const db = scriptedDatabase({ table: 'support_tickets', data: [{ id: 8 }] });
  const service = createSupportService(() => db);
  assert.deepEqual(await service.create(member, { title: ' Checkout fails ', body: ' Cannot pay. ', category: 'payments', owner_id: 'spoof', status: 'resolved' }), { id: 8 });
  const [row] = step(db.calls[0], 'insert');
  assert.equal(row.owner_id, member.id); assert.equal(row.author_email, member.email);
  assert.equal(row.title, 'Checkout fails'); assert.equal(row.body, 'Cannot pay.'); assert.equal(row.status, 'open');
  for (const input of [{ title: '', body: 'Help', category: 'other' }, { title: 'Help', body: '', category: 'other' }, { title: 'Help', body: 'Help', category: 'unknown' }, { title: 'x'.repeat(161), body: 'Help', category: 'other' }]) {
    await assert.rejects(service.create(member, input), error => error.status === 400);
  }
  await assert.rejects(service.create(owner, { title: 'Help', body: 'Help', category: 'other' }), error => error.status === 403);
  assert.equal(db.calls.length, 1);
});

test('admins read only their tickets and foreign ticket messages are never loaded', async () => {
  const db = scriptedDatabase({ table: 'support_tickets', data: [] }, { table: 'support_tickets', data: [] });
  const service = createSupportService(() => db);
  await service.list(member); assert.ok(hasEq(db.calls[0], 'owner_id', member.id));
  await assert.rejects(service.get(member, { id: 9 }), error => error.status === 404);
  assert.ok(hasEq(db.calls[1], 'owner_id', member.id)); assert.equal(db.calls.length, 2);
});

test('SuperAdmin reads the inbox and the complete ordered conversation', async () => {
  const db = scriptedDatabase({ table: 'support_tickets', data: [] }, { table: 'support_tickets', data: [{ id: 8, owner_id: 'member' }] }, { table: 'support_messages', data: [{ id: 1, body: 'We can help.' }] });
  const service = createSupportService(() => db);
  await service.list(owner); assert.equal(step(db.calls[0], 'eq'), undefined);
  const result = await service.get(owner, { id: 8 });
  assert.equal(result.messages[0].body, 'We can help.');
  assert.ok(hasEq(db.calls[2], 'ticket_id', 8));
  assert.deepEqual(step(db.calls[2], 'order'), ['created_at', { ascending: true }]);
});

test('replies and status changes use the service-only transaction with trusted actor and role', async () => {
  const db = scriptedDatabase({ table: 'rpc:reply_support_ticket', data: { ok: true, status: 'open' } }, { table: 'rpc:reply_support_ticket', data: { ok: true, status: 'resolved' } });
  const service = createSupportService(() => db);
  await service.reply(member, { id: 8, body: ' More information ', p_actor: 'spoof', isSuperAdmin: true });
  const [args] = step(db.calls[0], 'rpc');
  assert.equal(args.p_actor, 'member'); assert.equal(args.p_superadmin, false); assert.equal(args.p_body, 'More information');
  await service.reply(owner, { id: 8, body: '', status: 'resolved' });
  assert.equal(step(db.calls[1], 'rpc')[0].p_status, 'resolved');
  await assert.rejects(service.reply(member, { id: 8, body: 'Close it', status: 'resolved' }), error => error.status === 403);
  await assert.rejects(service.reply(member, { id: 8, body: ' ' }), error => error.status === 400);
  await assert.rejects(service.reply(owner, { id: 8, status: 'unknown' }), error => error.status === 400);
  assert.equal(db.calls.length, 2);
});

test('reply errors stay visible and inaccessible tickets return 404', async () => {
  const missing = createSupportService(() => scriptedDatabase({ table: 'rpc:reply_support_ticket', data: { ok: false } }));
  await assert.rejects(missing.reply(member, { id: 8, body: 'Help' }), error => error.status === 404);
  const unavailable = createSupportService(() => scriptedDatabase({ table: 'rpc:reply_support_ticket', error: { message: 'Database unavailable' } }));
  await assert.rejects(unavailable.reply(member, { id: 8, body: 'Help' }), /unavailable/i);
  for (const id of [0, -1, 'bad', 1.5]) await assert.rejects(missing.get(member, { id }), error => error.status === 400);
});

test('support routes require sign-in and permit the exclusive SuperAdmin account without personal tenant access', async () => {
  const calls = [];
  const operations = createPlatformOperations({ supportService: { list: async user => { calls.push(user); return []; } } });
  const req = { method: 'POST', body: { op: 'support.list' } }, res = response();
  await createAdminHandler({ sessionUser: async () => null, operations })(req, res); assert.equal(res.code, 401);
  await createAdminHandler({ sessionUser: async () => owner, scoped: () => { throw new Error('No personal Studio'); }, operations })(req, res);
  assert.equal(res.code, 200); assert.equal(calls[0], owner);
});

test('support migration isolates records and serializes replies with current status', () => {
  const sql = readFileSync(new URL('../supabase/platform-support.sql', import.meta.url), 'utf8');
  assert.match(sql, /support_tickets enable row level security/i);
  assert.match(sql, /support_messages enable row level security/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /request.owner_id is distinct from p_actor/i);
  assert.match(sql, /request.status\s*=\s*'resolved'/i);
  assert.match(sql, /revoke all on function public.reply_support_ticket.*from public,anon,authenticated/i);
  assert.match(sql, /grant execute.*to service_role/i);
});
