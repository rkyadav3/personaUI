import test from 'node:test';
import assert from 'node:assert/strict';
import { addonDatabase, ownerId, memberId } from './support/addonDatabase.js';
import { scriptedDatabase, step, hasEq } from './support/database.js';

test('invited administrators can read and apply through the production assistant adapter', async () => {
  const { createStudioOperations } = await import('../server/studioOperations.js');
  const access = { workspace: { id: ownerId }, ownerId, actorId: memberId, role: 'admin' };
  const db = { uid: ownerId, workspaceId: ownerId };
  const ctx = { user: { id: memberId }, db, workspace: access };
  let applied;
  const service = createStudioOperations({ rows: async () => [], store: { templates: async () => [], savePost: async (...args) => { applied = args; return { id: 1 }; } } });
  await service.read(ctx, ['posts']);
  await service.execute(ctx, { entity: 'posts', op: 'posts.save', args: { id: 1, html: '<p>Updated</p>' } });
  assert.equal(applied[0], db);
  await assert.rejects(service.read({ ...ctx, user: { id: 'foreign' } }, ['posts']), e => e.status === 401);
});

test('all export areas select real columns and enforce workspace scope and administrator access', async () => {
  const { exportWorkspacePage } = await import('../server/workspaceData.js');
  const db = await addonDatabase();
  try {
    await db.exec(`alter table posts add column html text;
      create table chat_log(id bigint,owner_id uuid,workspace_id uuid,question text,answer text,sources jsonb,answered boolean,created_at timestamptz);
      create table studio_chat(id bigint,owner_id uuid,workspace_id uuid,question text,answer text,created_at timestamptz);`);
    const access = { workspace: { id: ownerId }, ownerId, actorId: memberId, role: 'admin' };
    for (const [area, table] of [['conversations', 'chat_log'], ['assistant', 'studio_chat'], ['files', 'files'], ['articles', 'posts']]) {
      const recorder = scriptedDatabase({ table, data: [{ id: 1 }] });
      const result = await exportWorkspacePage(access, { area }, () => recorder);
      assert.equal(result.rows.length, 1);
      const call = recorder.calls[0];
      assert.equal(hasEq(call, 'workspace_id', ownerId), true);
      assert.equal(hasEq(call, 'owner_id', ownerId), true);
      await db.query(`select ${step(call, 'select')[0]} from ${table} limit 0`);
      await assert.rejects(exportWorkspacePage({ ...access, role: 'viewer' }, { area }, () => recorder), e => e.status === 403);
      await assert.rejects(exportWorkspacePage(access, { area, workspaceId: memberId }, () => recorder), e => e.status === 409);
    }
  } finally { await db.close(); }
});

test('revocation and demotion invalidate older invitation tokens', async () => {
  const db = await addonDatabase(['workspace-operations', 'collaboration-webhooks']);
  try {
    await db.exec('set role service_role');
    const invite = async hash => db.query('select manage_workspace_team($1,$2,$3,$4)', [ownerId, ownerId, 'invite', { email: 'member@example.test', role: 'admin', hash }]);
    await invite('a'.repeat(64));
    await db.query('select accept_workspace_invitation($1,$2)', [memberId, 'a'.repeat(64)]);
    await invite('b'.repeat(64));
    await db.query('select manage_workspace_team($1,$2,$3,$4)', [ownerId, ownerId, 'remove', { userId: memberId }]);
    await assert.rejects(db.query('select accept_workspace_invitation($1,$2)', [memberId, 'b'.repeat(64)]));
    await invite('c'.repeat(64));
    await db.query('select accept_workspace_invitation($1,$2)', [memberId, 'c'.repeat(64)]);
    await invite('d'.repeat(64));
    await db.query('select manage_workspace_team($1,$2,$3,$4)', [ownerId, ownerId, 'member', { userId: memberId, role: 'viewer' }]);
    await assert.rejects(db.query('select accept_workspace_invitation($1,$2)', [memberId, 'd'.repeat(64)]));
    assert.equal((await db.query('select role from workspace_members where workspace_id=$1 and user_id=$2', [ownerId, memberId])).rows[0].role, 'viewer');
  } finally { await db.close(); }
});

test('retention preserves pending and leased webhook events and clears settled old events', async () => {
  const db = await addonDatabase(['workspace-operations', 'collaboration-webhooks']);
  try {
    await db.exec('set role service_role');
    await db.query('select manage_workspace_webhook($1,$2,$3,$4)', [ownerId, ownerId, 'create', { endpoint: 'https://example.com/hook', encryptedSecret: 'encrypted', events: ['profile.updated'] }]);
    for (const state of ['pending', 'delivering', 'failed', 'delivered']) {
      const id = (await db.query('select enqueue_workspace_event($1,$2,$3) id', [ownerId, 'profile.updated', { state }])).rows[0].id;
      await db.query("update webhook_events set created_at=now()-interval '31 days' where id=$1", [id]);
      await db.query('update webhook_deliveries set state=$1 where event_id=$2', [state, id]);
    }
    await db.query('select run_workspace_retention()');
    assert.deepEqual((await db.query('select state from webhook_deliveries order by state')).rows.map(row => row.state), ['delivering', 'pending']);
  } finally { await db.close(); }
});

test('team permissions keep viewers read-only, contributors in content tools and administrative assistants private',async()=>{
  const { authorizeWorkspaceOperation } = await import('../server/workspacePermissions.js');
  assert.doesNotThrow(()=>authorizeWorkspaceOperation('viewer','profile.get'));
  assert.throws(()=>authorizeWorkspaceOperation('viewer','profile.status'),e=>e.status===403);
  assert.doesNotThrow(()=>authorizeWorkspaceOperation('contributor','posts.save'));
  assert.throws(()=>authorizeWorkspaceOperation('contributor','studio.apply'),e=>e.status===403);
  assert.doesNotThrow(()=>authorizeWorkspaceOperation('admin','studio.apply'));
  assert.throws(()=>authorizeWorkspaceOperation('viewer','webhooks.change'),e=>e.status===403);
});
test('webhook signatures authenticate exact bytes and timestamp; secrets encrypt and targets reject private addresses',async()=>{
  const { signWebhook, verifyWebhook, encryptSecret, decryptSecret, isPublicAddress, webhookUrl }=await import('../server/webhooks.js');
  const raw=Buffer.from('{ "id":"event" }'), secret='a'.repeat(64), timestamp=String(Math.floor(Date.now()/1000));
  assert.equal(verifyWebhook(secret,raw,timestamp,signWebhook(secret,raw,timestamp)),true);
  assert.equal(verifyWebhook(secret,Buffer.from('{}'),timestamp,signWebhook(secret,raw,timestamp)),false);
  assert.equal(verifyWebhook(secret,raw,'1',signWebhook(secret,raw,'1')),false);
  const key=Buffer.alloc(32,7).toString('base64');
  const encrypted=encryptSecret(secret,key);assert.notEqual(encrypted,secret);assert.equal(decryptSecret(encrypted,key),secret);
  for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','::1','::ffff:127.0.0.1','fc00::1'])assert.equal(isPublicAddress(ip),false);
  assert.equal(isPublicAddress('93.184.216.34'),true);assert.throws(()=>webhookUrl('https://127.0.0.1/hook'));
});
test('actual collaboration SQL binds invitation email, protects owner and durably leases webhook deliveries',async()=>{
  const db=await addonDatabase(['workspace-operations','collaboration-webhooks']);
  try{
    await db.exec('set role service_role');
    const hash='a'.repeat(64);
    await db.query('select manage_workspace_team($1,$2,$3,$4)',[ownerId,ownerId,'invite',{email:'member@example.test',role:'viewer',hash}]);
    await db.query('select accept_workspace_invitation($1,$2)',[memberId,hash]);
    assert.equal((await db.query('select role from workspace_members where workspace_id=$1 and user_id=$2',[ownerId,memberId])).rows[0].role,'viewer');
    await assert.rejects(db.query('select manage_workspace_team($1,$2,$3,$4)',[memberId,ownerId,'member',{userId:ownerId,role:'viewer'}]),/administrator/);
    await assert.rejects(db.query('select manage_workspace_team($1,$2,$3,$4)',[ownerId,ownerId,'member',{userId:ownerId,role:'viewer'}]),/owner/);
    await db.query('select manage_workspace_webhook($1,$2,$3,$4)',[ownerId,ownerId,'create',{endpoint:'https://example.com/hook',encryptedSecret:'encrypted',events:['profile.updated']}]);
    await db.query('insert into profiles(id,owner_id,name) values(1,$1,$2)',[ownerId,'Acme School']);
    const claims=(await db.query('select claim_webhook_deliveries($1,$2) jobs',[5,null])).rows[0].jobs;
    assert.equal(claims.length,1);
    assert.equal((await db.query('select claim_webhook_deliveries($1,$2) jobs',[5,null])).rows[0].jobs.length,0);
    await db.query('select finish_webhook_delivery($1,$2,$3,$4)',[claims[0].id,claims[0].lease,204,null]);
    assert.equal((await db.query('select state from webhook_deliveries')).rows[0].state,'delivered');
    await db.query('select manage_workspace_team($1,$2,$3,$4)',[ownerId,ownerId,'remove',{userId:memberId}]);
    assert.equal((await db.query('select status from workspace_members where workspace_id=$1 and user_id=$2',[ownerId,memberId])).rows[0].status,'revoked');
  }finally{await db.close();}
});
