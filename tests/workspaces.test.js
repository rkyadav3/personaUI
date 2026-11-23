import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { scriptedDatabase, hasEq, step } from './support/database.js';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const workspace = { id: alice, owner_id: alice, name: 'Alice', slug: 'alice', type: 'individual', status: 'active' };
const membership = { user_id: alice, role: 'owner', status: 'active', workspace };

test('workspace access uses verified membership and rejects suspended or foreign workspaces', async () => {
  const { workspaceAccess } = await import('../server/workspaces.js');
  const access = workspaceAccess({ id: alice }, membership);
  assert.equal(access.workspace.id, alice);
  assert.equal(access.ownerId, alice);
  assert.equal(access.actorId, alice);
  for (const changed of [
    { ...membership, status: 'revoked' },
    { ...membership, role: 'superadmin' },
    { ...membership, workspace: { ...workspace, status: 'suspended' } },
    { ...membership, workspace: null },
    { ...membership, user_id: bob },
  ]) assert.throws(() => workspaceAccess({ id: alice }, changed));
  assert.throws(() => workspaceAccess({ id: alice, isSuperAdmin: true }, membership));
});

test('authorized workspace scope stamps authors and rejects ownership reassignment', async () => {
  const { workspaceAccess, scopedWorkspace, createWorkspaceService } = await import('../server/workspaces.js');
  const raw = scriptedDatabase({ table: 'files' }, { table: 'files' }, { table: 'files' });
  const scope = scopedWorkspace(workspaceAccess({ id: alice }, membership), () => raw);
  await scope.from('files').insert({ owner_id: bob, workspace_id: bob, created_by: bob, name: 'Notes' });
  assert.equal(step(raw.calls[0], 'insert')[0].workspace_id, alice);
  assert.equal(step(raw.calls[0], 'insert')[0].created_by, alice);
  await scope.from('files').update({ owner_id: bob, workspace_id: bob, created_by: bob, name: 'Updated' });
  assert.deepEqual(step(raw.calls[1], 'update')[0], { name: 'Updated', updated_by: alice });
  assert.ok(hasEq(raw.calls[1], 'workspace_id', alice));
  await scope.from('files').delete();
  assert.ok(hasEq(raw.calls[2], 'workspace_id', alice));
  assert.throws(() => scopedWorkspace(null), /required/);
  const db = scriptedDatabase({ table: 'workspace_members', data: [membership] });
  assert.equal((await createWorkspaceService({ database: () => db }).list({ id: alice }))[0].role, 'owner');
  await assert.rejects(createWorkspaceService().list({ id: alice, isSuperAdmin: true }), /profile administrator/);
  const viewer = scriptedDatabase({ table: 'workspace_members', data: [{ ...membership, role: 'viewer' }] });
  await assert.rejects(createWorkspaceService({ database: () => viewer }).setup({ id: alice }, { type: 'organization' }), /administrator/);
});

test('workspace lookup filters the authenticated member and never accepts an owner supplied by a caller', async () => {
  const { createWorkspaceService } = await import('../server/workspaces.js');
  const db = scriptedDatabase({ table: 'workspace_members', data: [membership] });
  const service = createWorkspaceService({ database: () => db });
  const access = await service.current({ id: alice }, alice);
  assert.equal(access.ownerId, alice);
  assert.ok(hasEq(db.calls[0], 'user_id', alice));
  assert.ok(hasEq(db.calls[0], 'status', 'active'));
  const foreign = scriptedDatabase({ table: 'workspace_members', data: [membership] });
  await assert.rejects(createWorkspaceService({ database: () => foreign }).current({ id: alice }, bob), /not available/);
});

test('workspace type setup is an authorized transaction with a trusted actor and validated type', async () => {
  const { createWorkspaceService } = await import('../server/workspaces.js');
  const db = scriptedDatabase(
    { table: 'workspace_members', data: [{ ...membership, workspace: { ...workspace, type: null } }] },
    { table: 'rpc:setup_workspace_type', data: { ...workspace, type: 'organization' } },
  );
  const service = createWorkspaceService({ database: () => db });
  const result = await service.setup({ id: alice }, { type: 'organization', userId: bob, ownerId: bob });
  assert.equal(result.type, 'organization');
  assert.equal(step(db.calls[1], 'rpc')[0].p_user, alice);
  assert.equal(step(db.calls[1], 'rpc')[0].p_workspace, alice);
  await assert.rejects(service.setup({ id: alice }, { type: 'superadmin' }), /Individual, Organization or Jobs Profile/);
});

test('default workspace selects an available membership while explicit suspended targets reject', async () => {
  const { createWorkspaceService } = await import('../server/workspaces.js');
  const rows = [
    { ...membership, workspace: { ...workspace, status: 'suspended' } },
    { ...membership, role: 'admin', workspace: { ...workspace, id: bob, owner_id: bob } },
  ];
  const db = scriptedDatabase({ table: 'workspace_members', data: rows }, { table: 'workspace_members', data: rows });
  const service = createWorkspaceService({ database: () => db });
  assert.equal((await service.current({ id: alice })).workspace.id, bob);
  await assert.rejects(service.current({ id: alice }, alice), /not available/);
});

test('workspace migration preserves existing tenant IDs and enforces workspace/owner consistency', async () => {
  const sql = await readFile(new URL('../supabase/workspaces.sql', import.meta.url), 'utf8');
  const db = new PGlite();
  try {
    await db.exec(`
      create role service_role;
      create table users(id uuid primary key, name text, slug text unique, email text);
      create table profiles(id bigint primary key, owner_id uuid unique references users(id), name text);
      create table files(id bigint primary key, owner_id uuid references users(id), name text);
      insert into users values ('${alice}','Alice','alice','alice@example.test'),('${bob}','Bob','bob','bob@example.test');
      insert into profiles values (1,'${alice}','Alice');
      insert into files values (1,'${alice}','Biography');
    `);
    await db.exec(sql);
    await db.exec(sql);
    const rows = (await db.query('select id,owner_id,type,slug from workspaces order by slug')).rows;
    assert.equal(rows[0].id, alice);
    assert.equal(rows[0].type, 'individual');
    assert.equal(rows[1].type, null);
    assert.equal((await db.query('select workspace_id from files where id=1')).rows[0].workspace_id, alice);
    await db.exec(`insert into files(id,owner_id,name) values(2,'${bob}','Bob notes')`);
    await assert.rejects(db.exec(`insert into files(id,owner_id,workspace_id,name) values(3,'${bob}','${alice}','Foreign')`), /workspace/i);
    await assert.rejects(db.exec(`update files set workspace_id='${bob}' where id=1`), /workspace/i);
    const setup = await db.query(`select setup_workspace_type('${bob}','${bob}','organization') as result`);
    assert.equal(setup.rows[0].result.type, 'organization');
    await assert.rejects(db.query(`select setup_workspace_type('${alice}','${bob}','individual')`), /not available/);
    await assert.rejects(db.query(`select setup_workspace_type('${bob}','${bob}','individual')`), /already configured/);
    await db.exec(`update workspaces set status='suspended' where id='${bob}'`);
    await assert.rejects(db.query(`select setup_workspace_type('${bob}','${bob}','organization')`), /not available/);
  } finally { await db.close(); }
});
