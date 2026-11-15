import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptedDatabase, step } from './support/database.js';

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
