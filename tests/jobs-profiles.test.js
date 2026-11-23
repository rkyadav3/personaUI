import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeJob, resumeSpec, normalizeApplication, RESUME_LIMIT } from '../shared/jobs.js';
import { hasPlatformPermission, normalizePlatformPermissions, ALL_PERMISSIONS } from '../shared/rbac.js';
import { publicTags, canViewProfile } from '../shared/governance.js';
import { authorizeWorkspaceOperation, contributorScope } from '../server/workspacePermissions.js';
import { createProfileCreationService } from '../server/profileCreation.js';
import { createJobPublicService, saveJob, openResume } from '../server/jobs.js';
import { scriptedDatabase, step, hasEq } from './support/database.js';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { ASSET_BUCKET } from '../shared/assets.js';
import { createAdminHandler } from '../api/admin.js';
import { startSession, sessionUser } from '../server/auth.js';
const id = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222';
const job = {
  id,
  owner_id: id,
  workspace_id: id,
  status: 'published',
  title: 'Engineer',
  description: 'Build useful tools for people.',
  workplace: 'Remote',
  employment_type: 'Full-time',
};
const creator = { id, platformPermissions: ['profiles.create'] };

test('delegated creators cannot invoke other platform tools or approve profiles', async () => {
  for (const op of ['platform.master.get', 'platform.tags.update', 'platform.sales', 'users.update', 'jobs.save']) {
    const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await createAdminHandler({
      sessionUser: async () => ({ ...creator, permissions: [] }),
      scoped() { throw new Error('Must not load profile data'); },
      operations: { [op]() { throw new Error('Must not execute'); } },
    })({ method: 'POST', body: { op, args: { isSuperAdmin: true } } }, res);
    assert.equal(res.code, 403, op);
  }
});

test('pending and declined accounts cannot reuse existing session cookies', async () => {
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'profile-approval-session-test-secret';
  try {
    let cookie;
    await startSession({ setHeader(_, value) { cookie = value.split(';')[0]; } }, { id, email: 'pending@example.test' });
    for (const status of ['pending', 'rejected']) {
      const db = scriptedDatabase({ table: 'users', data: [{ id, email: 'pending@example.test', approval_status: status, session_version: 0 }] });
      assert.equal(await sessionUser({ headers: { cookie } }, db), null);
      assert.equal(db.calls.length, 1);
    }
  } finally {
    if (previous === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
  }
});
test('job input rejects invalid enums, short descriptions, dates and unsafe résumé links', () => {
  assert.equal(normalizeJob(job).title, 'Engineer');
  for (const value of [
    { ...job, workplace: 'Anywhere' },
    { ...job, description: 'Short' },
    { ...job, closes_at: 'invalid' },
  ])
    assert.throws(() => normalizeJob(value));
  assert.throws(() => resumeSpec({ name: 'resume.exe', mime: 'application/pdf', size: 100 }));
  assert.throws(() => resumeSpec({ name: 'resume.pdf', mime: 'application/pdf', size: RESUME_LIMIT + 1 }));
  assert.throws(() =>
    normalizeApplication({
      name: 'Applicant',
      email: 'a@example.test',
      consent: true,
      resumeUrl: 'javascript:alert(1)',
    })
  );
});
test('scoped platform permissions never promote someone to full Superadmin', () => {
  assert.equal(hasPlatformPermission(creator, 'profiles.create'), true);
  assert.equal(hasPlatformPermission(creator, 'master'), false);
  assert.throws(() => normalizePlatformPermissions(['superadmin']));
  assert.deepEqual(
    publicTags(
      ['hero', 'profile-creator', 'custom-internal'],
      [{ key: 'custom-internal', visibility: 'internal' }]
    ),
    ['hero']
  );
  assert.equal(canViewProfile({ approval_status: 'pending' }, { isSuperAdmin: true }), false);
});
test('creator creation hashes passwords, binds actor and cannot grant requested ownership', async () => {
  const db = scriptedDatabase({
    table: 'rpc:create_admin_profile',
    data: { id: other, approvalStatus: 'pending' },
  });
  const service = createProfileCreationService(() => db);
  await assert.rejects(service.create({ id }, {}), (error) => error.status === 403);
  await service.create(creator, {
    name: 'New profile',
    email: 'new@example.test',
    slug: 'new-profile',
    type: 'organisation',
    password: 'Secret1234',
    isSuperAdmin: true,
  });
  const params = step(db.calls[0], 'rpc')[0];
  assert.equal(params.p_actor, id);
  assert.equal(params.p_owner, false);
  assert.match(params.p_hash, /^\$2/);
  assert.notEqual(params.p_hash, 'Secret1234');
  await assert.rejects(
    service.approve(creator, { id: other, action: 'approve' }),
    (error) => error.status === 403
  );
});
test('creator listing is limited to the actor’s own created profiles', async () => {
  const db = scriptedDatabase({ table: 'users', data: [] });
  await createProfileCreationService(() => db).list(creator);
  assert.ok(hasEq(db.calls[0], 'profile_created_by', id));
});
test('contributors cannot read profile settings, team details, private sources or delete records', () => {
  for (const op of [
    'profile.get',
    'site.get',
    'team.list',
    'knowledge.sources',
    'files.delete',
    'posts.delete',
    'enquiries.list',
  ])
    assert.throws(
      () => authorizeWorkspaceOperation('contributor', op),
      (error) => error.status === 403
    );
  authorizeWorkspaceOperation('contributor', 'posts.create');
  authorizeWorkspaceOperation('contributor', 'files.save');
  const db = scriptedDatabase({ table: 'files', data: [] });
  const scope = contributorScope(db, id);
  scope.from('files').select('*');
  assert.ok(hasEq(db.calls[0], 'created_by', id));
});
test('private or closed jobs cannot accept applications or issue résumé uploads', async () => {
  const service = createJobPublicService({
    repository: { owner: async () => null },
    database: () => {
      throw new Error('Must not query');
    },
    storage: {},
  });
  await assert.rejects(
    service.upload(
      { jobId: id, slug: 'private', name: 'resume.pdf', mime: 'application/pdf', size: 10 },
      'ip'
    ),
    (error) => error.status === 404
  );
});
test('résumé upload response uses the actual signed asset bucket', async () => {
  const db = scriptedDatabase({ table: 'jobs', data: [job] }, { table: 'job_resumes' });
  let signed;
  const service = createJobPublicService({
    database: () => db,
    repository: {
      owner: async () => ({ id }),
      claim: async (owner, kind) => {
        assert.equal(kind, 'job');
      },
    },
    storage: {
      signUpload: async (path) => {
        signed = path;
        return { data: { token: 'signed' } };
      },
    },
  });
  const result = await service.upload(
    { jobId: id, slug: 'profile', name: 'resume.doc', mime: 'application/msword', size: 100 },
    'ip'
  );
  assert.equal(result.bucket, ASSET_BUCKET);
  assert.equal(result.path, signed);
  assert.equal(result.mime, 'application/msword');
});
test('résumé submissions verify actual uploaded size and MIME before the atomic inbox write', async () => {
  const db = scriptedDatabase(
    { table: 'jobs', data: [job] },
    {
      table: 'job_resumes',
      data: [
        {
          id: other,
          owner_id: id,
          job_id: id,
          name: 'resume.pdf',
          mime: 'application/pdf',
          size: 100,
          storage_path: `${id}/${other}.pdf`,
          created_at: new Date().toISOString(),
        },
      ],
    }
  );
  const service = createJobPublicService({
    database: () => db,
    repository: { owner: async () => ({ id }), claim: async () => {} },
    storage: { info: async () => ({ data: { size: 101, content_type: 'application/pdf' } }) },
  });
  await assert.rejects(
    service.submit(
      {
        jobId: id,
        slug: 'profile',
        name: 'Applicant',
        email: 'applicant@example.test',
        consent: true,
        resumeId: other,
      },
      'ip'
    ),
    (error) => error.status === 409
  );
  assert.equal(db.calls.length, 2);
});
test('résumé download never signs another profile’s file', async () => {
  const db = scriptedDatabase({
    table: 'job_resumes',
    data: [{ id: other, owner_id: other, submitted: true }],
  });
  db.uid = id;
  await assert.rejects(
    openResume(db, other, {
      signDownload() {
        throw new Error('Must not sign');
      },
    }),
    (error) => error.status === 404
  );
});
test('SQL creates pending profiles and applies approval and atomic job closure checks', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create table users(id uuid primary key default gen_random_uuid(),name text,email text unique,slug text unique,password_hash text,tags text[] default '{}',locked_until timestamptz,failed_attempts int default 0);create table profiles(id bigint generated always as identity primary key,owner_id uuid,name text,status text);create table enquiries(id bigint generated always as identity primary key,owner_id uuid,name text,email text,phone text,kind text,subject text,message text,consent boolean);create table files(id bigint primary key,owner_id uuid);create table posts(id bigint primary key,owner_id uuid);create schema storage;create table storage.buckets(id text primary key,allowed_mime_types text[]);insert into storage.buckets values('persona-assets',array['application/pdf']);`
    );
    const legacy = await readFile(new URL('../supabase/admin-experience.sql', import.meta.url), 'utf8');
    await db.exec(
      legacy.slice(0, legacy.indexOf('create table if not exists public.admin_presence')) + '\ncommit;'
    );
    for (const migration of ['master-rbac.sql', 'workspaces.sql', 'organization-profiles.sql'])
      await db.exec(await readFile(new URL(`../supabase/${migration}`, import.meta.url), 'utf8'));
    const events = await readFile(new URL('../supabase/events-commerce.sql', import.meta.url), 'utf8');
    await db.exec(
      events.slice(
        events.indexOf('create table if not exists public_actions'),
        events.indexOf('-- Lock the event')
      )
    );
    await db.exec(
      "insert into profile_tags(key,label,visibility,permissions) values('custom-creator','Profile Creator','public',array['profile']),('custom-existing','Profile Creator (custom)','public','{}');update profile_tags set permissions=array['profile'] where key='hero';"
    );
    const sql = await readFile(new URL('../supabase/jobs-profiles.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    assert.equal(
      (await db.query("select label from profile_tags where key='custom-creator'")).rows[0].label,
      'Profile Creator (custom 2)'
    );
    assert.deepEqual(
      (await db.query("select permissions from profile_tags where key='hero'")).rows[0].permissions,
      ['profile']
    );
    assert.ok(
      (
        await db.query("select permissions from profile_tags where key='standard'")
      ).rows[0].permissions.includes('jobs')
    );
    await db.exec(
      "update profile_tags set permissions=array_remove(permissions,'jobs') where key='standard'"
    );
    await db.exec(sql);
    assert.deepEqual(
      (await db.query("select permissions from profile_tags where key='profile-creator'")).rows[0]
        .permissions,
      []
    );
    assert.ok(
      !(
        await db.query("select permissions from profile_tags where key='standard'")
      ).rows[0].permissions.includes('jobs')
    );
    assert.ok(
      (
        await db.query("select allowed_mime_types from storage.buckets where id='persona-assets'")
      ).rows[0].allowed_mime_types.includes('application/msword')
    );
    await db.query('insert into users(id,name,email,slug,platform_permissions) values($1,$2,$3,$4,$5)', [
      id,
      'Creator',
      'creator@example.test',
      'creator',
      ['profiles.create'],
    ]);
    const ip = 'a'.repeat(64);
    await db.query("select claim_public_action($1,'job',$2,1)", [id, ip]);
    await assert.rejects(db.query("select claim_public_action($1,'job',$2,1)", [id, ip]), /Too many/);
    const created = await db.query(
      "select create_admin_profile($1,false,'New','new@example.test','new-profile','individual','$2b$12$hashed') as result",
      [id]
    );
    const target = created.rows[0].result.id;
    assert.equal(created.rows[0].result.approvalStatus, 'pending');
    assert.equal(
      (await db.query('select id from workspaces where owner_id=$1', [target])).rows[0].id,
      target
    );
    assert.equal(
      (await db.query('select workspace_id from profiles where owner_id=$1', [target])).rows[0].workspace_id,
      target
    );
    await assert.rejects(
      db.query("update profiles set status='published' where owner_id=$1", [target]),
      /approval/i
    );
    await db.query("update users set approval_status='approved' where id=$1", [target]);
    await db.query("update profiles set status='published' where owner_id=$1", [target]);
    await db.query(
      "insert into jobs(id,owner_id,title,description,workplace,employment_type,status) values($1,$2,'Engineer','Build useful tools for people.','Remote','Full-time','published')",
      [other, target]
    );
    await db.query('select submit_job_application($1,null,$2)', [
      other,
      { name: 'Applicant', email: 'a@example.test', resume_url: 'https://example.test/resume' },
    ]);
    assert.equal((await db.query('select kind from enquiries')).rows[0].kind, 'job');
    const resumeId = '33333333-3333-4333-8333-333333333333';
    await db.query(
      "insert into job_resumes(id,owner_id,workspace_id,job_id,name,mime,size,storage_path) values($1,$2,$2,$3,'resume.pdf','application/pdf',100,$4)",
      [resumeId, target, other, `${target}/${resumeId}.pdf`]
    );
    await db.query('select submit_job_application($1,$2,$3)', [
      other,
      resumeId,
      { name: 'Applicant', email: 'a@example.test' },
    ]);
    await assert.rejects(
      db.query('select submit_job_application($1,$2,$3)', [
        other,
        resumeId,
        { name: 'Applicant', email: 'a@example.test' },
      ]),
      /Upload/
    );
    await db.query("update jobs set status='closed' where id=$1", [other]);
    await assert.rejects(
      db.query('select submit_job_application($1,null,$2)', [
        other,
        { name: 'Applicant', email: 'a@example.test', resume_url: 'https://example.test/resume' },
      ]),
      /accepting/
    );
    await assert.rejects(db.exec('set role anon;select * from job_resumes'), /permission denied/);
  } finally {
    await db.close();
  }
});
