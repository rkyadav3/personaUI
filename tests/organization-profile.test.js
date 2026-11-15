import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptedDatabase, step } from './support/database.js';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('organization normalization keeps organization facts and drops individual and unknown fields', async () => {
  const { normalizeOrganizationDraft, organizationMissing } = await import('../shared/organization.js');
  const draft = normalizeOrganizationDraft({ profile: { name: 'Acme', education: [{ qualification: 'PhD' }], organization: {
    type: 'school', audience: 'Parents and applicants', chatPurpose: 'Explain admissions', website: 'javascript:alert(1)',
    details: { board: 'CBSE', grades: '1–12', employeeSecrets: 'hidden', industry: 'Software' },
  } }, purpose: { description: 'A school serving families.' } });
  assert.deepEqual(draft.profile.education, []);
  assert.equal(draft.profile.organization.website, '');
  assert.equal(draft.profile.organization.details.board, 'CBSE');
  assert.equal(draft.profile.organization.details.employeeSecrets, undefined);
  assert.equal(draft.profile.organization.details.industry, undefined);
  assert.deepEqual(organizationMissing(draft).required, []);
});

test('organization migration executes repeatably and synchronizes public suspension state', async () => {
  const db = new PGlite(), owner = '11111111-1111-4111-8111-111111111111';
  try {
    await db.exec(`create role service_role; create table users(id uuid primary key,name text,slug text,email text);
      create table profiles(id bigint primary key,owner_id uuid unique,name text);
      create table files(id bigint primary key,owner_id uuid); create table posts(id bigint primary key,owner_id uuid);
      insert into users values('${owner}','Alice','alice','alice@example.test');`);
    await db.exec(await readFile(new URL('../supabase/workspaces.sql', import.meta.url), 'utf8'));
    const sql = await readFile(new URL('../supabase/organization-profiles.sql', import.meta.url), 'utf8');
    await db.exec(sql); await db.exec(sql);
    await db.exec(`select setup_workspace_type('${owner}','${owner}','organization'); update workspaces set status='suspended' where id='${owner}'`);
    const row = (await db.query('select workspace_type,workspace_status from users')).rows[0];
    assert.equal(row.workspace_type, 'organization'); assert.equal(row.workspace_status, 'suspended');
    await assert.rejects(db.exec(`insert into files(id,owner_id,audience) values(1,'${owner}','everyone')`), /check constraint/);
  } finally { await db.close(); }
});

test('organization extraction grounds identity and leaves absent claims blank', async () => {
  const { extractOrganizationProfile } = await import('../server/organizationProfile.js');
  const db = scriptedDatabase({ table: 'profile_submissions', count: 0 }, { table: 'profile_submissions', data: [{ id: 7 }] });
  const result = await extractOrganizationProfile(db, 'Acme is a company that provides software support.', async () => ({
    profile: { name: 'Invented Ltd', organization: { type: 'company', website: 'https://invented.example', foundedYear: 1991 } },
    purpose: { description: 'Software support.' },
  }));
  assert.equal(result.draft.profile.name, null);
  assert.equal(result.draft.profile.organization.website, '');
  assert.equal(result.draft.profile.organization.foundedYear, null);
  assert.ok(result.missing.required.includes('name'));
  assert.equal(result.submissionId, 7);
});

test('organization profile saving uses its trusted workspace type and preserves validated metadata', async () => {
  const { saveProfile } = await import('../server/profile.js');
  const db = scriptedDatabase(
    { table: 'profiles', data: [{ id: 1 }] },
    { table: 'profiles' },
    { table: 'profiles', data: [{ id: 1, profile_type: 'organization' }] },
    { table: 'contributions', data: [] }, { table: 'offerings', data: [] },
  );
  db.workspaceType = 'organization';
  await saveProfile(db, { draft: { name: 'Acme', organization: { type: 'company', audience: 'Customers', chatPurpose: 'Explain services' } }, purpose: 'We provide software.' });
  const written = step(db.calls[1], 'update')[0];
  assert.equal(written.profile_type, 'organization');
  assert.equal(written.organization.audience, 'Customers');
});

test('organization public fields respect organization visibility and never expose private contact', async () => {
  const { buildPublic } = await import('../server/profile.js');
  const profile = { name: 'Acme', profile_type: 'organization', organization: { type: 'company', website: 'https://acme.example', adminEmail: 'secret@example.test' }, contact: { email: 'private@example.test' }, visibility: { organization: true } };
  const publicView = buildPublic(profile, []);
  assert.equal(publicView.profileType, 'organization');
  assert.equal(publicView.organization.type, 'company');
  assert.equal(publicView.organization.adminEmail, undefined);
  assert.equal(publicView.contact, null);
  assert.equal(buildPublic({ ...profile, visibility: { organization: false } }, []).organization, null);
});

test('knowledge validity excludes expired and internal sources before AI context', async () => {
  const { publishedPassages } = await import('../server/knowledgeBoundary.js');
  const candidates = [1, 2, 3].map(id => ({ id, similarity: 0.9 }));
  const db = scriptedDatabase(
    { table: 'chunks', data: candidates.map(row => ({ ...row, owner_id: 'alice', source_type: 'file', source_id: row.id, content: 'Knowledge', source_name: 'Policy' })) },
    { table: 'files', data: [{ id: 1, owner_id: 'alice', audience: 'public' }, { id: 2, owner_id: 'alice', audience: 'internal' }, { id: 3, owner_id: 'alice', audience: 'public', valid_until: '2020-01-01T00:00:00Z' }] },
    { table: 'posts', data: [] },
  );
  db.uid = 'alice'; db.workspaceId = 'alice';
  assert.deepEqual((await publishedPassages(db, candidates)).map(row => row.id), [1]);
});

test('knowledge policy changes are authorized, versioned and reject reversed validity dates', async () => {
  const { createKnowledgePolicyService } = await import('../server/knowledgePolicy.js');
  const db = scriptedDatabase({ table: 'rpc:set_source_policy', data: { id: 7, audience: 'internal' } });
  const service = createKnowledgePolicyService({ database: () => db });
  const access = { actorId: 'alice', workspace: { id: 'workspace-a' }, role: 'owner' };
  const result = await service.save(access, { kind: 'file', id: 7, audience: 'internal', revision: 1 });
  assert.equal(result.audience, 'internal');
  assert.equal(step(db.calls[0], 'rpc')[0].p_user, 'alice');
  assert.equal(step(db.calls[0], 'rpc')[0].p_workspace, 'workspace-a');
  await assert.rejects(service.save({ ...access, role: 'viewer' }, { kind: 'file', id: 7, audience: 'public', revision: 1 }), /administrator/);
  await assert.rejects(service.save(access, { kind: 'file', id: 7, audience: 'public', revision: 1, validFrom: '2027-01-01', validUntil: '2026-01-01' }), /after/);
});

test('workspace-enabled admin requests resolve membership before invoking content operations', async () => {
  const { createAdminHandler } = await import('../api/admin.js');
  let scoped = false;
  const handler = createAdminHandler({
    sessionUser: async () => ({ id: 'alice', workspaceEnabled: true }),
    workspaceService: { current: async () => ({ role: 'owner', workspace: { id: 'workspace-a' }, actorId: 'alice', ownerId: 'alice' }) },
    workspaceScope: () => { scoped = true; return { workspaceId: 'workspace-a' }; },
    operations: { 'profile.get': ({ db }) => ({ scope: db.workspaceId }) },
  });
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.value = value; } };
  await handler({ method: 'POST', body: { op: 'profile.get' } }, res);
  assert.equal(res.code, 200); assert.equal(scoped, true); assert.equal(res.value.scope, 'workspace-a');
});

test('organization profile knowledge uses only visibility-filtered public facts', async () => {
  const { organizationPassage } = await import('../server/organizationProfile.js');
  const { buildPublic } = await import('../server/profile.js');
  const publicView = buildPublic({ name: 'Acme', profile_type: 'organization', purpose: 'We provide support.',
    contact: { email: 'private@example.test' }, organization: { type: 'company', mission: 'Private mission' }, visibility: { organization: false } }, []);
  const passage = organizationPassage(publicView);
  assert.match(passage.content, /We provide support/);
  assert.doesNotMatch(passage.content, /private@example|Private mission/);
});
