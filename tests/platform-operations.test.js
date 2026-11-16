import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptedDatabase, step } from './support/database.js';
import { addonDatabase, ownerId } from './support/addonDatabase.js';

test('platform operations deny ordinary admins and audit trusted actor changes', async () => {
  const { createWorkspaceOperationsService } = await import('../server/workspaceOperations.js');
  const db = scriptedDatabase({ table: 'rpc:manage_workspace_operations', data: { ok: true } });
  const service = createWorkspaceOperationsService({ database: () => db });
  await assert.rejects(service.change({ id: 'normal' }, { workspaceId: '11111111-1111-4111-8111-111111111111', status: 'suspended' }), e => e.status === 403);
  await service.change({ id: 'super', isSuperAdmin: true }, { workspaceId: '11111111-1111-4111-8111-111111111111', status: 'suspended' });
  assert.equal(step(db.calls[0], 'rpc')[0].p_actor, 'super');
});
test('health reports use Unknown for missing or stale probes', async () => {
  const { probeView } = await import('../server/workspaceOperations.js');
  assert.equal(probeView(null).status, 'unknown');
  assert.equal(probeView({ status: 'ok', checked_at: '2020-01-01' }).status, 'unknown');
  assert.equal(probeView({ status: 'ok', checked_at: new Date().toISOString() }).status, 'ok');
});

test('operations migration runs under the service role and records measured health and transactional controls',async()=>{
  const db=await addonDatabase(['workspace-operations']);
  try{
    await db.exec('set role service_role');
    const health=(await db.query('select platform_persona_health() as health')).rows[0].health;
    assert.equal(health.api.requests,0);assert.equal(health.api.p95Ms,null);
    assert.ok(health.security.rejectionWindowStart);
    await db.query('insert into profiles(id,owner_id,name) values(1,$1,$2)',[ownerId,'North School']);
    assert.equal((await db.query('select name from workspaces where id=$1',[ownerId])).rows[0].name,'North School');
    await db.query('select record_api_rejection($1)',['unauthorized']);
    await db.query('select manage_workspace_operations($1,$2,$3)',[ownerId,ownerId,{status:'suspended',external_enabled:false,monthly_limit:100}]);
    assert.equal((await db.query('select workspace_status from users where id=$1',[ownerId])).rows[0].workspace_status,'suspended');
    assert.equal((await db.query('select platform_persona_health() as health')).rows[0].health.security.rejections.unauthorized,1);
    assert.equal((await db.query('select count(*) n from workspace_audit')).rows[0].n,1);
    const detail=(await db.query('select detail from workspace_audit')).rows[0].detail;
    assert.equal(detail.before.status,'active');assert.equal(detail.changes.status,'suspended');
    await assert.rejects(db.query('select manage_workspace_operations($1,$2,$3)',[ownerId,ownerId,{monthly_limit:-1}]),/check constraint/);
    assert.equal((await db.query('select monthly_limit from workspace_api_settings where workspace_id=$1',[ownerId])).rows[0].monthly_limit,100);
  }finally{await db.close();}
});
