import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTags, canViewProfile } from '../shared/governance.js';
import { scriptedDatabase, step } from './support/database.js';
import { publicProfile } from '../server/profile.js';
import { submitEnquiry } from '../server/engage.js';
import { register } from '../server/auth.js';
import fs from 'node:fs';

test('registered custom tags can be assigned and private custom tags fail closed', () => {
  const definitions = [{ key: 'custom-mentor', label: 'Mentor', visibility: 'public' }];
  assert.deepEqual(normalizeTags(['hero', 'custom-mentor'], definitions), ['hero', 'custom-mentor']);
  assert.throws(() => normalizeTags(['custom-unknown'], definitions), /Unknown/);
  assert.equal(canViewProfile({ id: 'a', tags: ['custom-mentor'], profile_private: false }), true);
  for (const viewer of [null, { id: 'b' }, { isAdmin: true }]) assert.equal(canViewProfile({ id: 'a', tags: ['custom-mentor'], profile_private: true }, viewer), false);
  assert.equal(canViewProfile({ id: 'a', tags: ['custom-mentor'], profile_private: true }, { isSuperAdmin: true }), true);
  assert.equal(canViewProfile({ id: 'a', tags: ['custom-mentor'] }), false);
});

test('only the owner creates custom tags and their names and visibility are validated', async () => {
  const { createTagService } = await import('../server/tags.js');
  const db = scriptedDatabase({ table: 'profile_tags', data: [{ key: 'custom-mentor', label: 'Mentor', visibility: 'private' }] });
  const service = createTagService(() => db);
  await assert.rejects(service.create({ isAdmin: true }, { label: 'Mentor' }), e => e.status === 403);
  await assert.rejects(service.create({ isSuperAdmin: true }, { label: '', visibility: 'public' }), e => e.status === 400);
  await assert.rejects(service.create({ isSuperAdmin: true }, { label: 'Mentor', visibility: 'unknown' }), e => e.status === 400);
  const result = await service.create({ isSuperAdmin: true }, { label: ' Mentor ', visibility: 'private' });
  assert.equal(result.label, 'Mentor'); assert.equal(step(db.calls[0], 'insert')[0].visibility, 'private');
});

test('return activity uses the last active snapshot and reports real increases by currency', async () => {
  const { activitySummary } = await import('../shared/adminActivity.js');
  const current = { sales: 5, views: 25, exchanges: 12, enquiries: 4, revenue: [{ currency: 'INR', net: 5000 }] };
  const summary = activitySummary({ since: '2026-11-11T00:00:00Z', asOf: '2026-11-12T00:00:00Z', previous: { sales: 2, views: 10, exchanges: 4, enquiries: 3, revenue: [{ currency: 'INR', net: 2000 }] }, current });
  assert.equal(summary.metrics.find(row => row.key === 'sales').increase, 3);
  assert.equal(summary.metrics.find(row => row.key === 'views').increase, 15);
  assert.equal(summary.revenue[0].increase, 3000);
  assert.equal(activitySummary({ current }).hasChanges, false);
});

test('activity reports enforce tenant identity and report setup errors instead of fake data', async () => {
  const { createActivityService } = await import('../server/adminActivity.js');
  const db = scriptedDatabase({ table: 'rpc:resume_admin_activity', data: { since: null, current: { sales: 0 } } }); db.uid = 'a';
  await createActivityService().resume({ user: { id: 'a' }, db });
  assert.equal(db.calls[0].table, 'rpc:resume_admin_activity');
  await assert.rejects(createActivityService().resume({ user: { id: 'b' }, db }), e => e.status === 401);
  const missing = scriptedDatabase({ table: 'rpc:admin_analytics', error: { code: 'PGRST202', message: 'Missing' } }); missing.uid = 'a';
  await assert.rejects(createActivityService().report({ user: { id: 'a' }, db: missing }), e => e.status === 503);
});

test('assistant data panels are built from records and preserve separate currencies and safe labels', async () => {
  const { analyticsPanels } = await import('../shared/adminActivity.js');
  const panels = analyticsPanels({ snapshot: { sales: 3, views: 40, exchanges: 10, enquiries: 5, revenue: [{ currency: 'INR', net: 5000 }, { currency: 'USD', net: 1000 }] }, dailySales: [{ day: '2026-11-12', sales: 2 }], asOf: '2026-11-12T00:00:00Z' });
  assert.equal(panels.metrics.find(row => row.label === 'Persona exchanges').value, 10);
  assert.equal(panels.revenue.length, 2); assert.equal(panels.dailySales[0].sales, 2);
  assert.doesNotMatch(JSON.stringify(panels), /payment_credentials|delivery_url/);
});

test('daily analytics keeps all 30 UTC calendar days including zero-sale days', () => {
  const sql = fs.readFileSync('supabase/admin-experience.sql', 'utf8');
  assert.match(sql, /generate_series\(0,29\)/);
  assert.match(sql, /coalesce\(s\.total,0\) as sales/);
  assert.match(sql, /today-29/);
  assert.match(sql, /at time zone 'UTC'/);
});

test('public custom profiles return their registered display labels', async () => {
  const db = scriptedDatabase(
    { table: 'users', data: [{ id: 'maya', tags: ['custom-mentor'], profile_private: false }] },
    { table: 'profiles', data: [{ name: 'Maya', visibility: {} }] },
    { table: 'contributions', data: [] }, { table: 'offerings', data: [] }, { table: 'site_settings', data: [] }, { table: 'updates', data: [] },
    { table: 'profile_tags', data: [{ key: 'custom-mentor', label: 'Mentor', visibility: 'public' }] },
  );
  const profile = await publicProfile('maya', null, db);
  assert.equal(profile.tagDefinitions[0].label, 'Mentor');
  assert.deepEqual(step(db.calls.find(call => call.table === 'profile_tags'), 'in'), ['key', ['custom-mentor']]);
});

test('public custom tags permit enquiries but private custom tags stop before content reads', async () => {
  for (const privateProfile of [false, true]) {
    const db = scriptedDatabase(
      { table: 'users', data: [{ id: 'maya', tags: ['custom-mentor'], profile_private: privateProfile }] },
      { table: 'profiles', data: [{ id: 1 }] },
      { table: 'site_settings', data: [{ portfolio: { enquiry: { enabled: true } } }] },
      { table: 'enquiries', count: 0 }, { table: 'enquiries', data: [] }, { table: 'enquiries', data: [] },
    );
    const result = await submitEnquiry({ slug: 'maya', name: 'Sam', email: 'sam@example.test', subject: 'Your work', message: 'Please tell me about your work.', kind: 'general', consent: true }, { ip: 'test' }, db);
    assert.match(step(db.calls[0], 'select')[0], /profile_private/);
    assert.equal(result.ok, !privateProfile);
    if (privateProfile) assert.equal(db.calls.length, 1);
  }
});

test('public registration cannot claim an unprovisioned SuperAdmin email', async () => {
  const oldOwner = process.env.SUPERADMIN_EMAILS, oldMode = process.env.REGISTRATION_MODE;
  process.env.SUPERADMIN_EMAILS = 'owner@example.test'; process.env.REGISTRATION_MODE = 'open';
  try {
    const result = await register({ email: 'OWNER@example.test', password: 'test-password', confirm: 'test-password' });
    assert.match(result.error, /reserved.*owner/i); assert.equal(result.user, undefined);
  } finally {
    if (oldOwner === undefined) delete process.env.SUPERADMIN_EMAILS; else process.env.SUPERADMIN_EMAILS = oldOwner;
    if (oldMode === undefined) delete process.env.REGISTRATION_MODE; else process.env.REGISTRATION_MODE = oldMode;
  }
});
