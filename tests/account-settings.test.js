import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { changeAccount } from '../server/account.js';
import { publicUser, sessionUser, startSession } from '../server/auth.js';
import { scoped } from '../server/tenant.js';
import { scriptedDatabase, hasEq, step } from './support/database.js';

const owner = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
const account = { id: owner, email: 'owner@example.test', slug: 'owner', password_hash: bcrypt.hashSync('current-password', 4), locked_until: null };

test('account changes authenticate the current password, ignoring supplied target IDs', async () => {
  const db = scriptedDatabase({ table: 'users', data: [account] }, { table: 'users', data: [account] }, { table: 'rpc:finalize_login', data: { status: 'authenticated', user: account } }, { table: 'rpc:change_own_account', data: { ...account, slug: 'new-owner', slug_changed_at: '2026-11-14T00:00:00Z' } });
  const result = await changeAccount({ id: owner }, { kind: 'userId', currentPassword: 'current-password', userId: 'new-owner', id: other }, db);
  assert.equal(step(db.calls.at(-1), 'rpc')[0].p_user, owner);
  assert.ok(hasEq(db.calls[0], 'id', owner));
  assert.equal(result.user.password_hash, undefined);
  assert.equal(result.user.userIdNextChangeAt, '2026-11-28T00:00:00.000Z');
});
test('wrong current passwords use the login throttle and never change account data', async () => {
  const db = scriptedDatabase({ table: 'users', data: [account] }, { table: 'users', data: [account] }, { table: 'rpc:finalize_login', data: { status: 'invalid' } });
  await assert.rejects(changeAccount({ id: owner }, { kind: 'userId', userId: 'new-owner', currentPassword: 'wrong' }, db), /Wrong email or password/);
  assert.equal(step(db.calls.at(-1), 'rpc')[0].p_matched, false);
  assert.equal(db.calls.some(call => call.table === 'rpc:change_own_account'), false);
});
test('password service hashes the new password and requests sign-out without returning its hash', async () => {
  const db = scriptedDatabase({ table: 'users', data: [account] }, { table: 'users', data: [account] }, { table: 'rpc:finalize_login', data: { status: 'authenticated', user: account } }, { table: 'rpc:change_own_account', data: { ...account, session_version: 1 } });
  const result = await changeAccount({ id: owner }, { kind: 'password', currentPassword: 'current-password', password: 'new-password', confirm: 'new-password' }, db);
  const params = step(db.calls.at(-1), 'rpc')[0];
  assert.equal(params.p_slug, null); assert.equal(params.p_user, owner);
  assert.ok(await bcrypt.compare('new-password', params.p_password_hash));
  assert.equal(result.passwordChanged, true); assert.equal(result.user.sessionVersion, 1); assert.equal(result.user.password_hash, undefined);
});
test('password validation uses bcrypt byte limits and confirmation before database access', async () => {
  for (const password of ['short', '😀'.repeat(19)]) await assert.rejects(changeAccount({ id: owner }, { kind: 'password', currentPassword: 'current-password', password, confirm: password }, {}), /72 bytes/);
  await assert.rejects(changeAccount({ id: owner }, { kind: 'password', currentPassword: 'current-password', password: 'new-password', confirm: 'different' }, {}), /do not match/);
});
test('password changes invalidate existing cookies and new logins use the new session version', async () => {
  const previous = process.env.SESSION_SECRET; process.env.SESSION_SECRET = 'local-account-test-secret-123456';
  try {
    let cookie;
    await startSession({ setHeader: (_, value) => { cookie = value.split(';')[0]; } }, publicUser({ ...account, session_version: 2 }));
    const req = { headers: { cookie } };
    assert.ok(await sessionUser(req, scriptedDatabase({ table: 'users', data: [{ ...account, session_version: 2 }] })));
    assert.equal(await sessionUser(req, scriptedDatabase({ table: 'users', data: [{ ...account, session_version: 3 }] })), null);
  } finally { if (previous === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = previous; }
});
test('the actual account migration enforces cooldown, uniqueness and password session revocation', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role; create table users(id uuid primary key,email text,name text,slug text unique,password_hash text,locked_until timestamptz,tags jsonb,failed_attempts int default 0);');
    const sql = await readFile(new URL('../supabase/account-settings.sql', import.meta.url), 'utf8');
    await db.exec(sql); await db.exec(sql);
    await db.query('insert into users(id,email,slug,password_hash) values($1,$2,$3,$4),($5,$6,$7,$4)', [owner, account.email, 'owner', account.password_hash, other, 'other@example.test', 'other']);
    const change = (id, hash, password, slug) => db.query('select change_own_account($1,$2,$3,$4) as account', [id, hash, password, slug]);
    const first = (await change(owner, account.password_hash, null, 'new-owner')).rows[0].account;
    assert.ok(first.slug_changed_at); assert.equal(first.id, owner);
    await assert.rejects(change(owner, account.password_hash, null, 'second-owner'), /changed again/);
    await assert.rejects(db.query('update users set slug=$1 where id=$2', ['other', owner]), /changed again/);
    await assert.rejects(change(other, account.password_hash, null, 'new-owner'), /unique/);
    await db.query("update users set slug_changed_at=now()-interval '14 days' where id=$1", [owner]);
    // The guard prevents resetting the timestamp externally; simulate passage of time by replacing the test clock value via disabled trigger.
    await db.exec('alter table users disable trigger guard_account_changes');
    await db.query("update users set slug_changed_at=now()-interval '14 days' where id=$1", [owner]);
    await db.exec('alter table users enable trigger guard_account_changes');
    assert.equal((await change(owner, account.password_hash, null, 'second-owner')).rows[0].account.slug, 'second-owner');
    const newHash = await bcrypt.hash('changed-password', 12);
    assert.equal((await change(owner, account.password_hash, newHash, null)).rows[0].account.session_version, 1);
    await assert.rejects(change(owner, account.password_hash, null, 'stale-owner'), /changed or was suspended/);
    assert.equal((await db.query('select slug,session_version from users where id=$1', [other])).rows[0].slug, 'other');
    // SuperAdmin resets pass through the same session revocation guard.
    await db.query('update users set password_hash=$1 where id=$2', [await bcrypt.hash('owner-reset', 12), owner]);
    assert.equal((await db.query('select session_version from users where id=$1', [owner])).rows[0].session_version, 2);
    const afterChange = (await db.query('select password_hash from users where id=$1', [owner])).rows[0].password_hash;
    const migratedLogin = (await db.query('select finalize_login($1,$2,$3,true) as result', [owner, account.email, afterChange])).rows[0].result;
    assert.equal(migratedLogin.user.session_version, 2);
    assert.ok(migratedLogin.user.slug_changed_at);
    const security = await readFile(new URL('../supabase/security-hardening.sql', import.meta.url), 'utf8');
    await db.exec(security.slice(0, security.indexOf('-- Serialize votes')) + '\ncommit;');
    const final = (await db.query('select finalize_login($1,$2,$3,true) as result', [other, 'other@example.test', account.password_hash])).rows[0].result;
    assert.equal(final.user.session_version, 0); assert.equal(final.user.password_hash, undefined);
  } finally { await db.close(); }
});
test('Store currency RPC always receives the signed-in tenant instead of request ownership', async () => {
  const db = scriptedDatabase({ table: 'rpc:save_store_currency', data: null });
  await scoped(owner, () => db).rpc('save_store_currency', { p_owner: other, p_currency: 'INR', p_expected_version: null });
  assert.equal(step(db.calls[0], 'rpc')[0].p_owner, owner);
});
