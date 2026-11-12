import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import { login } from '../server/auth.js';
import { scriptedDatabase, step } from './support/database.js';

const account = { id: 'user', email: 'member@example.test', name: 'Original', tags: [], password_hash: bcrypt.hashSync('current-password', 4), failed_attempts: 0, locked_until: null };
const attempt = { email: account.email, password: 'current-password' };

test('sign-in only uses the current account returned by atomic finalization', async () => {
  const db = scriptedDatabase({ table: 'users', data: [account] }, { table: 'rpc:finalize_login', data: { status: 'authenticated', user: { ...account, name: 'Updated during login' } } });
  const result = await login(attempt, db);
  assert.equal(result.user.name, 'Updated during login');
  assert.equal(result.user.password_hash, undefined);
  const params = step(db.calls[1], 'rpc')[0];
  assert.equal(params.p_password_hash, account.password_hash); assert.equal(params.p_matched, true);
  assert.equal(db.calls.length, 2);
});

test('a concurrent suspension, password reset or deletion prevents a stale sign-in', async () => {
  for (const outcome of [{ status: 'locked', locked_until: '2099-01-01T00:00:00Z' }, { status: 'invalid' }]) {
    const db = scriptedDatabase({ table: 'users', data: [account] }, { table: 'rpc:finalize_login', data: outcome });
    const result = await login(attempt, db);
    assert.equal(result.user, undefined); assert.ok(result.error);
    assert.ok(db.calls.every(call => !step(call, 'update')));
  }
});

test('parallel failed guesses each request atomic finalization instead of resetting a shared counter', async () => {
  const calls = [];
  const db = {
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [structuredClone(account)] }) }) }),
    rpc: async (fn, params) => { calls.push({ fn, params }); return { data: { status: 'invalid' } }; },
  };
  const outcomes = await Promise.all(Array.from({ length: 5 }, () => login({ email: account.email, password: 'wrong' }, db)));
  assert.equal(calls.length, 5);
  assert.ok(calls.every(call => call.fn === 'finalize_login' && call.params.p_matched === false));
  assert.ok(outcomes.every(result => !result.user && result.error));
});

test('missing finalization setup refuses sign-in and explains how to recover', async () => {
  const db = scriptedDatabase({ table: 'users', data: [account] }, { table: 'rpc:finalize_login', error: { message: 'Missing function' } });
  const result = await login(attempt, db);
  assert.equal(result.user, undefined); assert.match(result.error, /security-hardening/);
});

test('security migration validates credentials and locks rows before login or vote updates', () => {
  const sql = fs.readFileSync('supabase/security-hardening.sql', 'utf8');
  assert.ok(sql.indexOf('for update') < sql.indexOf('observed := clock_timestamp()'));
  assert.match(sql, /password_hash is distinct from p_password_hash/);
  assert.match(sql, /email is distinct from p_email/);
  assert.match(sql, /locked_until > observed/);
  assert.match(sql, /coalesce\(current_user_row.failed_attempts,0\)\+1/);
  assert.match(sql, /from public,anon,authenticated/);
  const votes = sql.slice(sql.indexOf('create or replace function public.rate_offering'));
  assert.ok(votes.indexOf('for update') < votes.indexOf('insert into public.offering_ratings'));
});
