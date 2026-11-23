import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeJobsProfileSection, visibleJobsProfile, resolveJobsProfilePermissions } from '../shared/jobsProfile.js';
import { hasPermission, canOpenRoute, normalizePermissions, resolvePermissions, ALL_PERMISSIONS } from '../shared/rbac.js';
import { requireOperationPermissions } from '../server/rbac.js';
import { createAdminHandler } from '../api/admin.js';
import { getJobsProfile, saveJobsProfile, applicationJobsProfile } from '../server/jobsProfile.js';
import { createJobPublicService } from '../server/jobs.js';
import { scriptedDatabase, step, hasEq } from './support/database.js';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { publicOffers } from '../server/profile.js';
import { publicSettings } from '../server/site.js';
import { buildHomeFeed } from '../server/home.js';
const owner = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
const user = { id: 'owner', profileType: 'jobs', permissions: ['profile', 'commerce', 'jobs', 'knowledge', 'content', 'community', 'enquiries'] };
test('Jobs Profile excludes business features even if tags grant them', () => {
  assert.equal(hasPermission(user, 'profile'), true);
  for (const feature of ['commerce', 'jobs', 'knowledge', 'content', 'community', 'enquiries']) assert.equal(hasPermission(user, feature), false);
  assert.equal(canOpenRoute(user, '/admin/home'), true);
  for (const path of ['/admin/store', '/admin/jobs', '/admin/activity', '/admin/knowledge', '/admin/settings?tab=payments', '/admin/profile?tab=contrib']) assert.equal(canOpenRoute(user, path), false, path);
  for (const op of ['site.save', 'profile.save', 'studio.plan', 'jobs.save', 'invites.create', 'account.change']) assert.throws(() => requireOperationPermissions(user, op), error => error.status === 403, op);
});
test('sharing excludes private answers and nation-growth ideas from public responses', () => {
  const doc = { sections: { basics: { audience: 'public', value: { name: 'Name' } }, mindset: { audience: 'applied_jobs', value: { mindset: 'Private career answer' } }, nation: { audience: 'applied_jobs', value: { idea: 'Secret' } }, hustles: { audience: 'private', value: { notes: 'Private note' } } } };
  assert.deepEqual(Object.keys(visibleJobsProfile(doc, 'public').sections), ['basics']);
  assert.deepEqual(Object.keys(visibleJobsProfile(doc, 'applied_jobs').sections), ['basics', 'mindset', 'nation']);
  assert.deepEqual(Object.keys(visibleJobsProfile(doc, 'applied_jobs', ['basics']).sections), ['basics']);
  assert.throws(() => normalizeJobsProfileSection('nation', { audience: 'public', value: { idea: 'secret' } }));
});
test('role sections intersect grants and missing tags fail closed', () => {
  const definitions = [{ key: 'standard', jobs_profile_permissions: ['basics', 'mindset'] }, { key: 'hero', jobs_profile_permissions: ['basics'] }];
  assert.deepEqual(resolveJobsProfilePermissions([], definitions), ['basics', 'mindset']);
  assert.deepEqual(resolveJobsProfilePermissions(['hero', 'standard'], definitions), ['basics']);
  assert.deepEqual(resolveJobsProfilePermissions(['missing'], definitions), []);
});
test('structured profile fields validate and discard unexpected data', () => {
  const section = normalizeJobsProfileSection('basics', { audience: 'applied_jobs', value: { name: 'Candidate', email: 'a@example.test', education: [{ qualification: 'BSc', institution: 'University', year: '2024', secret: 'ignored' }], certificates: [], languages: [{ name: 'Hindi', proficiency: 'Native' }], platformPermissions: ['superadmin'] } });
  assert.equal(section.value.languages[0].name, 'Hindi');
  assert.equal(section.value.platformPermissions, undefined);
  assert.equal(section.value.education[0].secret, undefined);
  assert.throws(() => normalizeJobsProfileSection('basics', { value: { name: 'Candidate', email: 'invalid' } }));
});
test('Job Seeker toggle is exclusive, opt-in and wins across assigned roles', () => {
  assert.equal(ALL_PERMISSIONS.includes('job_seeker'), false);
  assert.throws(() => normalizePermissions(['job_seeker', 'profile']), /cannot be combined/);
  const permissions = resolvePermissions(['standard', 'custom-seeker'], [{ key: 'standard', permissions: ALL_PERMISSIONS }, { key: 'custom-seeker', permissions: ['job_seeker'] }]);
  assert.deepEqual(permissions, ['job_seeker']);
  const actor = { permissions };
  assert.equal(canOpenRoute(actor, '/admin/home'), true);
  assert.equal(canOpenRoute(actor, '/admin/store'), false);
  assert.equal(hasPermission({ profileType: 'jobs', permissions: [] }, 'profile'), false);
  assert.deepEqual(resolvePermissions(['missing', 'custom-seeker'], [{ key: 'custom-seeker', permissions: ['job_seeker'] }]), []);
});
test('legacy public endpoints exclude old contact, offerings and backgrounds in Job Seeker mode', async () => {
  const db = () => scriptedDatabase({ table: 'users', data: [{ id: owner, slug: 'candidate', tags: [], job_seeker: true, approval_status: 'approved' }] });
  const result = await publicOffers('candidate', null, db());
  assert.equal(result.profileType, 'jobs'); assert.deepEqual(result.offers, []); assert.equal(result.contact, null);
  assert.equal(await publicSettings('candidate', null, db()), null);
});
test('directory projects only shared Jobs Home data and excludes legacy shops', () => {
  const result = buildHomeFeed({ profiles: [{ owner_id: owner, name: 'Old private name', status: 'published' }], users: [{ id: owner, slug: 'candidate', tags: ['hero'], job_seeker: true }], offerings: [{ owner_id: owner, title: 'Old offering' }], sites: [{ owner_id: owner, portfolio: { products: [{ title: 'Old product' }] } }], tagDefinitions: [{ key: 'hero', permissions: ['job_seeker'], jobs_profile_permissions: ['basics', 'mindset'] }], jobsProfiles: [{ owner_id: owner, published: true, home: { title: 'Public Jobs Home' }, sections: { basics: { audience: 'private', value: { name: 'Private candidate', email: 'secret@example.test' } }, mindset: { audience: 'applied_jobs', value: { mindset: 'Secret answer' } } } }] });
  assert.equal(result.members[0].name, 'Public Jobs Home'); assert.deepEqual(result.products, []);
  assert.doesNotMatch(JSON.stringify(result), /Old product|Old offering|Private candidate|secret@example|Secret answer/);
});
test('selected workspace type is enforced before executing ordinary APIs', async () => {
  const response = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await createAdminHandler({ sessionUser: async () => ({ id: owner, permissions: ALL_PERMISSIONS, workspaceEnabled: true }), workspaceService: { current: async () => ({ workspace: { id: owner, type: 'jobs' }, role: 'owner' }) }, workspaceScope() { throw new Error('Must deny before tenant data'); }, operations: { 'site.save'() { throw new Error('Must not execute'); } } })({ method: 'POST', body: { op: 'site.save' } }, response);
  assert.equal(response.code, 403);
});
test('Jobs Profile reads exclude disabled sections and writes deny them before SQL', async () => {
  const database = scriptedDatabase({ table: 'jobs_profiles', data: [{ sections: { basics: { audience: 'private', value: { name: 'Candidate' } }, nation: { audience: 'private', value: { idea: 'Hidden' } } }, version: 3 }] });
  database.uid = owner;
  const ctx = { db: database, user: { ...user, id: owner, jobsProfilePermissions: ['basics'] } };
  assert.deepEqual(Object.keys((await getJobsProfile(ctx)).sections), ['basics']);
  await assert.rejects(saveJobsProfile(ctx, { section: 'nation', version: 3, value: { idea: 'secret' } }), error => error.status === 403);
  assert.equal(database.calls.length, 1);
});
test('application access verifies the recipient and honours current audiences and role grants', async () => {
  const inbox = scriptedDatabase({ table: 'enquiries', data: [{ job_id: owner, applicant_profile_owner: other }] }); inbox.uid = owner;
  const database = scriptedDatabase(
    { table: 'jobs_profiles', data: [{ sections: { basics: { audience: 'public', value: { name: 'Candidate' } }, mindset: { audience: 'applied_jobs', value: { mindset: 'Shared' } }, nation: { audience: 'private', value: { idea: 'Secret' } } } }] },
    { table: 'users', data: [{ profile_type: 'jobs', tags: ['standard'], approval_status: 'approved' }] },
    { table: 'profile_tags', data: [{ key: 'standard', permissions: ['profile'], jobs_profile_permissions: ['basics', 'mindset', 'nation'] }] }
  );
  const result = await applicationJobsProfile({ db: inbox, user: { id: owner, permissions: ['enquiries'] } }, { id: 123 }, database);
  assert.deepEqual(Object.keys(result.sections), ['basics', 'mindset']);
  assert.ok(hasEq(inbox.calls[0], 'id', 123));
  assert.ok(hasEq(database.calls[0], 'owner_id', other));
  const denied = scriptedDatabase({ table: 'enquiries', data: [] }); denied.uid = owner;
  await assert.rejects(applicationJobsProfile({ db: denied, user: { id: owner, permissions: ['enquiries'] } }, { id: 124 }, database), error => error.status === 404);
});
test('sharing an application uses authenticated identity and ignores supplied applicant IDs', async () => {
  const database = scriptedDatabase({ table: 'jobs', data: [{ id: owner, owner_id: owner, status: 'published' }] }, { table: 'rpc:submit_job_profile_application', data: 1 });
  const service = createJobPublicService({ database: () => database, repository: { owner: async () => ({ id: owner }), claim: async () => {} }, storage: {} });
  const input = { jobId: owner, name: 'Candidate', email: 'a@example.test', consent: true, shareProfile: true, resumeUrl: 'https://example.test/resume.pdf', applicantId: owner };
  await assert.rejects(service.submit(input, 'ip'), error => error.status === 403);
  await service.submit(input, 'ip', { id: other, profileType: 'jobs' });
  assert.equal(step(database.calls.find(call => call.table === 'rpc:submit_job_profile_application'), 'rpc')[0].p_applicant, other);
});
test('real SQL supports creation, exclusive flags, role revocation, atomic saving and applicant sharing', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create table users(id uuid primary key default gen_random_uuid(),name text,email text unique,slug text unique,password_hash text,tags text[] default '{}',locked_until timestamptz,failed_attempts int default 0);create table profiles(id bigint generated always as identity primary key,owner_id uuid unique,name text,status text);create table enquiries(id bigint generated always as identity primary key,owner_id uuid,name text,email text,phone text,kind text,subject text,message text,consent boolean);create table files(id bigint primary key,owner_id uuid);create table posts(id bigint primary key,owner_id uuid);create schema storage;create table storage.buckets(id text primary key,allowed_mime_types text[]);`);
    const legacy = await readFile(new URL('../supabase/admin-experience.sql', import.meta.url), 'utf8');
    await db.exec(legacy.slice(0, legacy.indexOf('create table if not exists public.admin_presence')) + '\ncommit;');
    for (const migration of ['master-rbac.sql', 'workspaces.sql', 'organization-profiles.sql']) await db.exec(await readFile(new URL(`../supabase/${migration}`, import.meta.url), 'utf8'));
    const events = await readFile(new URL('../supabase/events-commerce.sql', import.meta.url), 'utf8');
    await db.exec(events.slice(events.indexOf('create table if not exists public_actions'), events.indexOf('-- Lock the event')));
    for (const migration of ['jobs-profiles.sql', 'staff-permissions.sql', 'tag-visibility.sql', 'jobs-profile-home.sql']) await db.exec(await readFile(new URL(`../supabase/${migration}`, import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../supabase/jobs-profile-home.sql', import.meta.url), 'utf8'));
    await db.exec(`insert into users(id,email,name,slug,tags) values('${owner}','owner@example.test','Owner','owner',array['standard']),('${other}','applicant@example.test','Applicant','applicant',array['hero']);`);
    await db.exec("update profile_tags set permissions=array['job_seeker'] where key='hero'");
    assert.equal((await db.query(`select job_seeker from users where id='${other}'`)).rows[0].job_seeker, true);
    await assert.rejects(db.exec("update profile_tags set permissions=array['job_seeker','profile'] where key='hero'"), /constraint/);
    await assert.rejects(db.exec("update profile_tags set platform_permissions=array['profiles.create'] where key='hero'"), /constraint/);
    const save = (version, section, value) => db.query('select save_jobs_profile($1,$1,$2,$3::jsonb,$4,null) as document', [other, section, JSON.stringify(value), version]);
    await save(0, 'basics', { audience: 'applied_jobs', value: { name: 'Candidate' } });
    await assert.rejects(save(0, 'basics', { audience: 'private', value: { name: 'Stale' } }), /changed/);
    await assert.rejects(save(1, 'nation', { audience: 'public', value: { idea: 'Secret' } }), /cannot be public/);
    await db.exec("update profile_tags set jobs_profile_permissions=array['basics'] where key='hero'");
    await assert.rejects(save(1, 'mindset', { audience: 'private', value: { mindset: 'Hidden' } }), /hidden/);
    await db.exec(`insert into jobs(id,owner_id,workspace_id,title,description,employment_type,workplace,status) values('${owner}','${owner}','${owner}','Engineer','Build useful tools for people','Full-time','Remote','published');insert into profiles(owner_id,workspace_id,name,status) values('${owner}','${owner}','Owner','published');`);
    const application = await db.query('select submit_job_profile_application($1,null,$2::jsonb,$3) as id', [owner, JSON.stringify({ name: 'Applicant', email: 'a@example.test', phone: '', message: 'Hello', resume_url: 'https://example.test/resume.pdf' }), other]);
    assert.equal((await db.query('select applicant_profile_owner from enquiries where id=$1', [application.rows[0].id])).rows[0].applicant_profile_owner, other);
    await db.exec("update profile_tags set permissions=array['profile'] where key='hero'");
    assert.equal((await db.query(`select job_seeker from users where id='${other}'`)).rows[0].job_seeker, false);
    await assert.rejects(save(1, 'basics', { audience: 'private', value: { name: 'Removed access' } }), /access/);
    await db.exec(`select choose_profile_type('${other}','jobs')`);
    const created = await db.query('select create_admin_profile($1,true,$2,$3,$4,$5,$6) as result', [owner, 'New Jobs Profile', 'new@example.test', 'new-jobs', 'jobs', '$2b$12$test']);
    const id = created.rows[0].result.id;
    assert.equal((await db.query('select profile_type from profiles where owner_id=$1', [id])).rows[0].profile_type, 'jobs');
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from jobs_profiles'), /permission denied/);
    await db.exec('reset role');
  } finally { await db.close(); }
});
