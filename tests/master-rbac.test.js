import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { ALL_PERMISSIONS, resolvePermissions, hasPermission, routePermissions } from '../shared/rbac.js';
import { PROFILE_TAGS, normalizeTags, canViewProfile } from '../shared/governance.js';
import { createTagService } from '../server/tags.js';
import { loadPermissions } from '../server/rbac.js';
import { startSession, sessionUser } from '../server/auth.js';
import { createAdminHandler, createPlatformOperations } from '../api/admin.js';
import { signAsset, downloadAsset } from '../server/assets.js';
import { savePage, saveContent, getContent } from '../server/site.js';
import { scriptedDatabase, step } from './support/database.js';
import { chooseProfileType } from '../server/profileType.js';

const owner = { id: 'owner', isSuperAdmin: true };
const member = { id: 'member', tags: ['hero'], permissions: ['profile'] };
const response = () => ({ setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test('all requested profile types are assignable without granting platform ownership', () => {
  const requested = ['university','hospital','special','hero','contributors','standard','founders','god','fraud','scammer','narration-setter','gov-departments','commercial-enterprises','community','manufacturer'];
  assert.deepEqual(normalizeTags(requested), requested);
  for (const key of requested) {
    assert.ok(PROFILE_TAGS[key]);
    assert.equal(canViewProfile({ id: 'a', tags: [key], profile_private: false }), true);
    assert.equal(hasPermission({ tags: [key], permissions: [] }, 'profile'), false);
  }
});

test('RBAC intersects assigned tags, denies unresolved roles and uses Standard for untagged accounts', () => {
  assert.throws(() => normalizeTags(['organisation']), /Unknown/);
  assert.throws(() => normalizeTags(['individual-profile']), /Unknown/);
  const definitions = [{ key: 'hero', permissions: ALL_PERMISSIONS }, { key: 'fraud', permissions: ['profile'] }, { key: 'standard', permissions: ['content'] }];
  assert.deepEqual(resolvePermissions(['hero', 'fraud'], definitions), ['profile']);
  assert.deepEqual(resolvePermissions(['unknown'], definitions), []);
  assert.deepEqual(resolvePermissions([], definitions), ['content']);
  assert.deepEqual(resolvePermissions(null, definitions), []);
  assert.deepEqual(routePermissions('/admin/settings', '?tab=payments'), ['commerce']);
  assert.deepEqual(routePermissions('/admin/settings', '?tab=account'), []);
  assert.deepEqual(routePermissions('/admin/settings', '?tab=settings'), ['commerce']);
  assert.deepEqual(resolvePermissions(['university'], [{ key:'university', permissions:ALL_PERMISSIONS }]), ALL_PERMISSIONS);
});

test('Master reads and writes require Superadmin and validate permissions before database access', async () => {
  const db = scriptedDatabase({ table: 'profile_tags', data: [{ key: 'hero', permissions: [] }] });
  const tagsService = createTagService(() => db);
  await assert.rejects(tagsService.master(member), error => error.status === 403);
  await assert.rejects(tagsService.update(member, { key: 'hero', permissions: ALL_PERMISSIONS }), error => error.status === 403);
  await assert.rejects(tagsService.update(owner, { key: 'hero', permissions: ['superadmin'] }), error => error.status === 400);
  await assert.rejects(tagsService.update(owner, { key: 'hero', label: 'Changed' }), error => error.status === 400);
  assert.equal(db.calls.length, 0);
  await tagsService.update(owner, { key: 'hero', permissions: [] });
  assert.deepEqual(step(db.calls[0], 'update')[0], { permissions: [] });
  const operations = createPlatformOperations({ tagsService });
  for (const op of ['platform.master.get', 'platform.tags.update', 'platform.tags.create']) {
    const res = response();
    await createAdminHandler({ sessionUser: async () => member, operations })({ method: 'POST', body: { op, args: { key: 'hero', permissions: [] } } }, res);
    assert.equal(res.code, 403);
  }
});

test('direct feature APIs and the assistant reject disabled permissions before tenant reads', async () => {
  for (const op of ['files.list','updates.save','index.embed','chat.list','items.save','payments.saveSettings','enquiries.list','invites.create','suggestions.create','studio.prepare','studio.apply','activity.report','overview']) {
    const res = response();
    await createAdminHandler({ sessionUser: async () => member, scoped() { throw new Error('Must not create a tenant scope'); }, operations: { [op]() { throw new Error('Must not execute'); } } })({ method: 'POST', body: { op, args: { permissions: ALL_PERMISSIONS, isSuperAdmin: true } } }, res);
    assert.equal(res.code, 403, op);
  }
  for (const op of ['profile.save', 'support.create', 'account.change']) {
    const res = response();
    await createAdminHandler({ sessionUser: async () => member, scoped: () => ({}), operations: { [op]: () => ({ ok: true }) } })({ method: 'POST', body: { op } }, res);
    assert.equal(res.code, 200, op);
  }
});

test('session checks load changed role permissions for the same cookie', async () => {
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'master-rbac-test-secret-123456';
  try {
    let cookie;
    const row = { id: member.id, email: 'member@example.test', tags: ['hero'], session_version: 0 };
    await startSession({ setHeader: (_, value) => { cookie = value.split(';')[0]; } }, row);
    for (const permissions of [ALL_PERMISSIONS, []]) {
      const db = scriptedDatabase({ table: 'users', data: [row] }, { table: 'profile_tags', data: [{ key: 'hero', permissions }] });
      const user = await sessionUser({ headers: { cookie } }, db);
      assert.deepEqual(user.permissions, permissions);
      assert.deepEqual(step(db.calls[1], 'in'), ['key', ['hero']]);
    }
    assert.deepEqual((await loadPermissions({ id: 'a', tags: [] }, scriptedDatabase({ table: 'profile_tags', data: [{ key: 'standard', permissions: [] }] }))).permissions, []);
  } finally { if (previous === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = previous; }
});

test('profile-only accounts can upload public media but cannot upload or open delivery files', async () => {
  const db = scriptedDatabase(); db.uid = member.id;
  await assert.rejects(signAsset(db, { name: 'book.pdf', size: 10, purpose: 'delivery' }, {}, member), error => error.status === 403);
  assert.equal(db.calls.length, 0);
  const upload = scriptedDatabase({ table: 'assets', data: [] }); upload.uid = member.id;
  await signAsset(upload, { name: 'photo.png', size: 10, purpose: 'media' }, { signUpload: async () => ({ data: { token: 'token' } }) }, member);
  assert.equal(upload.calls.length, 1);
  const id = '11111111-1111-4111-8111-111111111111';
  const delivery = scriptedDatabase({ table: 'assets', data: [{ id, owner_id: member.id, storage_path: `${member.id}/${id}.pdf`, status: 'ready', purpose: 'delivery' }] }); delivery.uid = member.id;
  await assert.rejects(downloadAsset(delivery, id, { signDownload() { throw new Error('Must not sign'); } }, undefined, member), error => error.status === 403);
});

test('appearance APIs cannot bypass commerce or content permissions through shared page records', async () => {
  for (const input of [
    { page: { currency: 'USD' }, expectedVersion: 'v1', applyItemCurrency: true },
    { page: { currency: 'USD' }, expectedVersion: 'v1' },
    { portfolioPatch: { products: [{ id: 'book', title: 'Unauthorized product' }] }, expectedVersion: 'v1' },
    { portfolioPatch: { projects: [{ id: 'project', title: 'Unauthorized project' }] }, expectedVersion: 'v1' },
  ]) {
    const db = scriptedDatabase({ table: 'site_settings', data: [{ id: 1, updated_at: 'v1' }] }); db.uid = member.id;
    await assert.rejects(savePage(db, input, {}, member), error => error.status === 403);
    assert.equal(db.calls.length, 1);
  }
  for (const patch of [{ products: [] }, { bio: 'Changed appearance' }]) await assert.rejects(saveContent({}, { portfolioPatch: patch, expectedVersion: 'v1' }), error => error.status === 400);
  const db = scriptedDatabase({ table: 'site_settings', data: [{ id: 1, updated_at: 'v1', portfolio: { bio: 'Private draft bio', projects: [{ id: 'p', title: 'Project' }], products: [{ id: 'book', title: 'Book', assetId: 'private-delivery' }] } }] });
  const content = await getContent(db);
  assert.equal(content.portfolio.projects[0].title, 'Project');
  assert.equal(content.portfolio.bio, ''); assert.deepEqual(content.portfolio.products, []);
  const products = [{ id: 'legacy-0', title: 'Book', currency: 'INR' }];
  const saved = scriptedDatabase(
    { table: 'site_settings', data: [{ id: 1, updated_at: 'v1', portfolio: { products } }] },
    { table: 'site_settings', data: [{ id: 1 }] },
    { table: 'site_settings', data: [{ id: 1, updated_at: 'v2', portfolio: { products } }] },
    { table: 'site_settings', data: [{ id: 1, updated_at: 'v2', portfolio: { products } }] },
  );
  await saveContent(saved, { portfolioPatch: { projects: [{ id: 'p', title: 'Project' }] }, expectedVersion: 'v1' });
  assert.deepEqual(step(saved.calls[1], 'update')[0].portfolio.products, products);
  for (const op of ['content.get', 'content.save']) {
    const res = response();
    await createAdminHandler({ sessionUser: async () => ({ ...member, permissions: ['content'] }), scoped: () => ({}), operations: { [op]: () => ({ ok: true }) } })({ method: 'POST', body: { op } }, res);
    assert.equal(res.code, 200);
  }
});

test('actual SQL upgrade seeds types, preserves privacy and restricts browser writes; reruns retain RBAC edits', async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role; create table users(id uuid primary key, tags text[] not null default '{}', email text, name text, slug text, password_hash text, failed_attempts int default 0, locked_until timestamptz);");
    const legacy = await readFile(new URL('../supabase/admin-experience.sql', import.meta.url), 'utf8');
    await db.exec(legacy.slice(0, legacy.indexOf('create table if not exists public.admin_presence')) + '\ncommit;');
    await db.exec("insert into profile_tags values('custom-group','Group','public'),('custom-university','University','private'); insert into users(id,tags) values('11111111-1111-4111-8111-111111111111',array['custom-group']),('22222222-2222-4222-8222-222222222222',array['custom-university']);");
    const sql = await readFile(new URL('../supabase/master-rbac.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    assert.equal((await db.query('select count(*)::int as count from profile_tags')).rows[0].count, Object.keys(PROFILE_TAGS).length + 2);
    assert.equal((await db.query("select label from profile_tags where key='custom-university'")).rows[0].label, 'University (custom)');
    assert.equal((await db.query("select profile_private from users where id='22222222-2222-4222-8222-222222222222'")).rows[0].profile_private, true);
    assert.equal((await db.query("select count(*)::int as count from profile_tags where key in ('organisation','individual-profile')")).rows[0].count, 0);
    const choice = await db.query("select choose_profile_type('11111111-1111-4111-8111-111111111111','organisation') as result");
    assert.equal(choice.rows[0].result.profile_type, 'organisation');
    await db.exec("update users set email='member@example.test',password_hash='test-hash' where id='11111111-1111-4111-8111-111111111111'");
    const signedIn = await db.query("select finalize_login('11111111-1111-4111-8111-111111111111','member@example.test','test-hash',true) as result");
    assert.equal(signedIn.rows[0].result.user.profile_type, 'organisation');
    await assert.rejects(db.query("select choose_profile_type('11111111-1111-4111-8111-111111111111','individual')"), /already been chosen/);
    await db.exec("update profile_tags set permissions=array['profile'] where key='hero'; update profile_tags set visibility='private' where key='custom-group';");
    assert.equal((await db.query("select profile_private from users where id='11111111-1111-4111-8111-111111111111'")).rows[0].profile_private, true);
    await db.exec(sql);
    assert.deepEqual((await db.query("select permissions from profile_tags where key='hero'")).rows[0].permissions, ['profile']);
    await assert.rejects(db.exec("update profile_tags set permissions=array['superadmin'] where key='hero'"), /check constraint/);
    await assert.rejects(db.exec("update profile_tags set visibility='public' where key='private'"), /Protected/);
    await db.exec("update users set tags=array['university','hospital','god','fraud','scammer']");
    await assert.rejects(db.exec("set role anon; update profile_tags set permissions='{}' where key='hero'"), /permission denied/);
  } finally { await db.close(); }
});

test('first-time profile selection is limited to two kinds and always uses the signed-in account', async () => {
  const db = scriptedDatabase({ table: 'rpc:choose_profile_type', data: { profile_type:'organisation' } });
  await assert.rejects(chooseProfileType(owner, {type:'organisation'}, db), e => e.status === 403);
  await assert.rejects(chooseProfileType(member, {type:'god'}, db), e => e.status === 400);
  assert.equal(db.calls.length, 0);
  assert.deepEqual(await chooseProfileType(member, {type:'organisation', id:'someone-else', permissions:ALL_PERMISSIONS}, db), {profileType:'organisation'});
  assert.equal(step(db.calls[0], 'rpc')[0].p_user, member.id);
});
