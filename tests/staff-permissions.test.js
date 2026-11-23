import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlatformPermissions } from '../shared/rbac.js';
import { platformSectionsFor } from '../src/lib/adminNavigation.js';
import { createAdminHandler } from '../api/admin.js';
import { createTagService } from '../server/tags.js';
import { scriptedDatabase } from './support/database.js';
import { listUsersDetailed, updateUser } from '../server/invites.js';
import { loadPermissions } from '../server/rbac.js';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

const staff = { id: 'staff', tags: ['custom-staff'], permissions: [], platformPermissions: ['profiles.edit', 'master.manage'] };
const response = () => ({ setHeader() {}, status(code) { this.code=code; return this; }, json(body) { this.body=body; return this; } });

test('internal staff grants accept independent editing and Master capabilities', () => {
  assert.deepEqual(normalizePlatformPermissions(staff.platformPermissions), staff.platformPermissions);
  assert.deepEqual(platformSectionsFor(staff).map(page=>page.id), ['profiles', 'master']);
});

test('staff edit and Master operations follow their saved capabilities', async () => {
  for (const op of ['users.list','users.update','platform.master.get','platform.tags.update']) {
    const res=response(); let called=false;
    await createAdminHandler({sessionUser:async()=>staff,operations:{[op]:()=>{called=true;return {ok:true};}}})({method:'POST',body:{op}},res);
    assert.equal(res.code,200,op);assert.equal(called,true,op);
  }
});

test('Master service permits staff granted tag management', async () => {
  const db=scriptedDatabase({table:'profile_tags',data:[]});
  assert.deepEqual(await createTagService(()=>db).master(staff),[]);
});

test('staff grants are reloaded from the internal tag and revocation removes access', async () => {
  for (const grants of [staff.platformPermissions, []]) {
    const db=scriptedDatabase({table:'profile_tags',data:[{key:'custom-staff',permissions:[],platform_permissions:grants}]});
    const fresh=await loadPermissions({...staff,platformPermissions:[]},db);
    assert.deepEqual(fresh.platformPermissions,grants);
    assert.deepEqual(platformSectionsFor(fresh).map(page=>page.id),grants.length?['profiles','master']:[]);
  }
});

test('each staff capability denies unrelated platform actions and all delegation/approval', async () => {
  for (const [grant, blocked] of [
    ['profiles.create',['users.list','users.update','platform.master.get']],
    ['profiles.edit',['platform.profiles.create','platform.master.get']],
    ['master.manage',['users.list','users.update','platform.profiles.create']],
  ]) {
    for (const op of [...blocked,'platform.profiles.approve','users.resetPassword','users.delete','platform.sales']) {
      const res=response();
      await createAdminHandler({sessionUser:async()=>({...staff,platformPermissions:[grant]}),operations:{[op](){throw new Error('Must not execute');}}})({method:'POST',body:{op,args:{isSuperAdmin:true}}},res);
      assert.equal(res.code,403,`${grant}: ${op}`);
    }
  }
  const service=createTagService(()=>{throw new Error('Must not write platform grants');});
  await assert.rejects(service.update(staff,{key:'custom-staff',platformPermissions:['profiles.create']}),error=>error.status===403);
  await assert.rejects(service.create(staff,{label:'Elevated',visibility:'internal',platformPermissions:['profiles.edit']}),error=>error.status===403);
});

test('staff cannot edit a platform staff account, change direct grants or assign a privileged tag', async () => {
  await assert.rejects(updateUser('target',{platformPermissions:[]},staff,()=>{throw new Error('Must not query');}),error=>error.status===403);
  const defs=[{key:'custom-staff',label:'Staff',visibility:'internal',platform_permissions:['profiles.edit']}];
  for (const [target,tags] of [[{id:'target',email:'staff@example.test',tags:['custom-staff']},undefined],[{id:'target',email:'member@example.test',tags:[]},['custom-staff']]]) {
    const db=scriptedDatabase({table:'users',data:[target]},{table:'profile_tags',data:defs});
    await assert.rejects(updateUser('target',{name:'Edited',tags},staff,()=>db),error=>error.status===403);
    assert.equal(db.calls.length,2);
  }
});

test('staff profile directory excludes platform identities and omits invitation metadata', async () => {
  const db=scriptedDatabase({table:'users',data:[{id:'ordinary',email:'ordinary@example.test',tags:['standard'],platform_permissions:[]},{id:'staff',email:'staff@example.test',tags:['custom-staff'],platform_permissions:[]},{id:'creator',email:'creator@example.test',tags:[],platform_permissions:['profiles.create']}]},{table:'profile_tags',data:[{key:'custom-staff',platform_permissions:['profiles.edit']}]});
  const users=await listUsersDetailed(staff,()=>db);
  assert.deepEqual(users.map(user=>user.id),['ordinary']);
  assert.ok(!Object.hasOwn(users[0],'platform_permissions'));
});

test('staff migration preserves grants and SQL edits enforce current permissions and protected tags',async()=>{
  const db=new PGlite();
  const actor='11111111-1111-4111-8111-111111111111',target='22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create table users(id uuid primary key,name text,email text unique,slug text unique,tags text[] default '{}',platform_permissions text[] default '{}',approval_status text default 'approved');create table profile_tags(key text primary key,platform_permissions text[] default '{}');insert into profile_tags values('custom-staff',array['profiles.edit','master.manage']),('standard','{}');`);
    const migration=await readFile(new URL('../supabase/staff-permissions.sql',import.meta.url),'utf8');
    await db.exec(migration);await db.exec(migration);
    await db.query("insert into users(id,name,email,tags) values($1,'Staff','staff@example.test',array['custom-staff']),($2,'Member','member@example.test',array['standard'])",[actor,target]);
    await db.query("select update_staff_profile($1,$2,'member@example.test',$3)",[actor,target,{name:'Edited',tags:['standard']}]);
    assert.equal((await db.query('select name from users where id=$1',[target])).rows[0].name,'Edited');
    await assert.rejects(db.query("select update_staff_profile($1,$2,'member@example.test',$3)",[actor,target,{tags:['custom-staff']}]),/Superadmin/);
    await assert.rejects(db.query("select update_staff_profile($1,$2,'member@example.test',$3)",[actor,target,{platform_permissions:['master.manage']}]),/ordinary/);
    await db.exec("update profile_tags set platform_permissions='{}' where key='custom-staff'");
    await assert.rejects(db.query("select update_staff_profile($1,$2,'member@example.test',$3)",[actor,target,{name:'Blocked'}]),/access/);
    await assert.rejects(db.exec("set role anon;select update_staff_profile('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','member@example.test','{}')"),/permission denied/);
  } finally {await db.close();}
});
