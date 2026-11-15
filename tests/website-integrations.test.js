import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const response = () => ({ headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(n) { this.code=n; return this; }, json(v) { this.value=v; return this; } });
test('integration secrets are random, hashed at rest and validated without trusting an origin header', async () => {
  const { issueCredential, credentialHash, bearerCredential } = await import('../server/integrations.js');
  const a=issueCredential(), b=issueCredential();
  assert.notEqual(a.secret,b.secret); assert.equal(a.hash,credentialHash(a.secret));
  assert.ok(a.secret.length>=48); assert.equal(a.hash.length,64); assert.ok(!a.hash.includes(a.secret));
  assert.equal(bearerCredential({headers:{authorization:'Bearer '+a.secret,origin:'https://fake.test'}}),a.secret);
  assert.throws(()=>bearerCredential({headers:{'x-api-key':a.secret}}),e=>e.status===401);
});
test('external API authenticates first, assigns its source on the server and does not expose unexpected errors', async () => {
  const { createPersonaHandler } = await import('../server/personaApi.js');
  let recorded;
  const handler=createPersonaHandler({
    service:{ authenticate:async()=>({workspaceId:'org',keyId:'key',integrationId:'site'}), chat:async(access,input)=>{recorded={access,input};return {reply:'Hello',sources:[],source:'external_api'};}},
  });
  const res=response();
  await handler({method:'POST',headers:{authorization:'Bearer ps_test'},body:{message:'hello',requestId:'a',source:'own_platform',workspaceId:'other'}},res);
  assert.equal(res.code,200);assert.equal(recorded.access.workspaceId,'org');assert.equal(recorded.input.source,undefined);assert.equal(recorded.input.workspaceId,undefined);
  const rejected=createPersonaHandler({service:{authenticate:async()=>{throw new Error('database secret');}}});
  const old=console.error;console.error=()=>{};
  try{await rejected({method:'POST',headers:{},body:{}},res);}finally{console.error=old;}
  assert.equal(res.code,500);assert.doesNotMatch(JSON.stringify(res.value),/database secret/);
});
test('PostgreSQL admission shares quotas, rejects revoked credentials and replays only matching requests',async()=>{
  const db=new PGlite(), id='11111111-1111-4111-8111-111111111111', site='22222222-2222-4222-8222-222222222222', key='33333333-3333-4333-8333-333333333333';
  try{
    await db.exec(`create role service_role bypassrls;create table users(id uuid primary key,name text,slug text,email text);create table profiles(id bigint primary key,owner_id uuid unique,name text,views integer default 0);
      insert into users values('${id}','Acme','acme','admin@example.test');`);
    await db.exec(await readFile(new URL('../supabase/workspaces.sql',import.meta.url),'utf8'));
    const sql=await readFile(new URL('../supabase/website-integrations.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
    await db.exec(`insert into website_integrations(id,workspace_id,name,site_origin) values('${site}','${id}','Website','https://acme.test');
      insert into persona_api_keys(id,integration_id,key_hash,prefix) values('${key}','${site}',repeat('a',64),'ps_test');
      update workspace_api_settings set monthly_limit=2 where workspace_id='${id}';`);
    await db.exec(`insert into profiles(id,owner_id,name) values(1,'${id}','Acme')`);
    const reserve=(rid,hash='hash',source='external_api')=>db.query('select reserve_persona_request($1,$2,$3,$4,$5,$6) as result',[id,source==='own_platform'?null:key,source,rid,hash,null]);
    await db.exec('set role service_role');
    const first=(await reserve('req-1')).rows[0].result;assert.equal(first.state,'reserved');
    assert.equal((await reserve('req-1')).rows[0].result.state,'pending');
    await assert.rejects(reserve('req-1','changed'),/different message/);
    await db.query('select finish_persona_request($1,$2,$3,$4,$5,$6)',[first.id,first.lease,200,{reply:'Hello'},12,6]);
    assert.equal((await reserve('req-1')).rows[0].result.response.reply,'Hello');
    assert.equal((await reserve('platform-1','hash','own_platform')).rows[0].result.state,'reserved');
    await assert.rejects(reserve('req-2'),/monthly/);
    await db.exec('reset role');
    await db.exec(`update profiles set views=views+1 where id=1`);
    await db.exec('set role service_role');
    assert.equal((await reserve('req-1')).rows[0].result.response.reply,'Hello');
    await db.exec('reset role');
    await db.exec(`update profiles set name='Updated Acme' where id=1`);
    await db.exec('set role service_role');
    assert.equal((await reserve('req-1')).rows[0].result.state,'obsolete');
    await db.exec(`update persona_api_keys set revoked_at=now() where id='${key}'`);
    await assert.rejects(reserve('req-1'),/credential/);
    assert.equal((await db.query('select count(*) as n from persona_requests')).rows[0].n,2);
  }finally{await db.close();}
});
