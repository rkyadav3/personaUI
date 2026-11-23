import test from 'node:test';
import assert from 'node:assert/strict';
import { isJobsProfileAccount } from '../shared/jobsProfile.js';
import { listUsersDetailed } from '../server/invites.js';
import { createProfileCreationService } from '../server/profileCreation.js';
import { listJobsProfileReviews } from '../server/jobsProfile.js';
import { scriptedDatabase, hasEq, step } from './support/database.js';
import { authorizePlatformOperation } from '../server/rbac.js';
import { canOpenPlatformRoute } from '../shared/rbac.js';

const tags = [{ key: 'standard', permissions: ['profile'] }, { key: 'custom-career', permissions: ['job_seeker'] }];
const accounts = [
  { id: 'ordinary', email: 'ordinary@example.test', profile_type: 'individual', tags: ['standard'], approval_status: 'approved' },
  { id: 'jobs-type', email: 'jobs@example.test', profile_type: 'jobs', tags: ['standard'], platform_permissions: ['profiles.create'], approval_status: 'pending' },
  { id: 'feature', email: 'feature@example.test', profile_type: 'organisation', job_seeker: true, tags: ['standard'], approval_status: 'approved' },
  { id: 'tagged', email: 'tagged@example.test', profile_type: 'individual', job_seeker: false, tags: ['standard', 'custom-career'], approval_status: 'approved' },
];
const owner = { id: 'owner', isSuperAdmin: true };

test('Job Seeker directory classification covers profile type, saved flags and any assigned tag', () => {
  assert.equal(isJobsProfileAccount(accounts[0], tags), false);
  for (const account of accounts.slice(1)) assert.equal(isJobsProfileAccount(account, tags), true);
  assert.equal(isJobsProfileAccount({ profileType: 'jobs' }), true);
  assert.equal(isJobsProfileAccount({ jobSeeker: true }), true);
  assert.equal(isJobsProfileAccount({ permissions: ['job_seeker'] }), true);
  assert.equal(isJobsProfileAccount({ tags: [] }, [{ key: 'standard', permissions: ['job_seeker'] }]), true);
});

test('owner and staff Profiles directories exclude all Job Seeker accounts before returning them', async () => {
  for (const actor of [owner, { id: 'staff', platformPermissions: ['profiles.edit'] }]) {
    const db = scriptedDatabase({ table: 'users', data: accounts }, { table: 'profile_tags', data: tags }, { table: 'invite_codes', data: [] }, { table: 'profiles', data: [] });
    assert.deepEqual((await listUsersDetailed(actor, () => db)).map(account => account.id), ['ordinary']);
    assert.match(step(db.calls.find(call => call.table === 'users'), 'select')[0], /job_seeker/);
  }
});

test('Profile Creator directory keeps ownership scope while excluding Job Seekers', async () => {
  const creator = { id: 'creator', platformPermissions: ['profiles.create'] };
  const db = scriptedDatabase({ table: 'users', data: accounts }, { table: 'profile_tags', data: tags });
  const result = await createProfileCreationService(() => db).list(creator);
  assert.deepEqual(result.users.map(account => account.id), ['ordinary']);
  assert.ok(hasEq(db.calls[0], 'profile_created_by', creator.id));
});

test('Jobs Profiles lists pending accounts for owner approval without loading private answers', async () => {
  for (const actor of [owner, { id: 'reviewer', platformPermissions: ['profiles.review'] }]) {
    const db = scriptedDatabase({ table: 'users', data: accounts }, { table: 'profile_tags', data: tags }, { table: 'profile_tags', data: tags }, { table: 'invite_codes', data: [] }, { table: 'profiles', data: [] }, { table: 'jobs_profiles', data: [{ owner_id: 'tagged' }] });
    const result = await listJobsProfileReviews(actor, db);
    assert.deepEqual(result.profiles.map(profile => profile.id), actor.isSuperAdmin ? ['jobs-type', 'feature', 'tagged'] : ['feature', 'tagged']);
    assert.equal(result.profiles.find(profile => profile.id === 'tagged').hasDetails, true);
    assert.equal(result.profiles.find(profile => profile.id === 'feature').hasDetails, false);
    if (actor.isSuperAdmin) {
      assert.deepEqual(result.profiles.find(profile => profile.id === 'jobs-type').platformPermissions, ['profiles.create']);
      assert.deepEqual(result.profiles.find(profile => profile.id === 'tagged').tags, ['standard', 'custom-career']);
    } else assert.ok(result.profiles.every(profile => !Object.hasOwn(profile, 'tags') && !Object.hasOwn(profile, 'platformPermissions')));
    assert.deepEqual(step(db.calls.find(call => call.table === 'jobs_profiles'), 'select'), ['owner_id']);
  }
  await assert.rejects(listJobsProfileReviews({ id: 'creator', platformPermissions: ['profiles.create'] }, scriptedDatabase()), error => error.status === 403);
});

test('account editors can manage Job Seekers without gaining access to private section reviews', async () => {
  const editor = { id: 'staff', platformPermissions: ['profiles.edit'] };
  assert.equal(canOpenPlatformRoute(editor, '/superadmin/job-profiles'), true);
  authorizePlatformOperation(editor, 'platform.jobsProfile.list');
  assert.throws(() => authorizePlatformOperation(editor, 'platform.jobsProfile.get'), error => error.status === 403);
  const db = scriptedDatabase({ table: 'users', data: accounts }, { table: 'profile_tags', data: tags }, { table: 'profile_tags', data: tags }, { table: 'jobs_profiles', data: [] });
  const result = await listJobsProfileReviews(editor, db);
  assert.deepEqual(result.profiles.map(profile => profile.id), ['feature', 'tagged']);
  assert.deepEqual(result.profiles.find(profile => profile.id === 'tagged').tags, ['standard', 'custom-career']);
  assert.ok(result.profiles.every(profile => !Object.hasOwn(profile, 'platform_permissions')));
});
