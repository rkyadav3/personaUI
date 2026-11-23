import test from 'node:test';
import assert from 'node:assert/strict';
import { createTagService } from '../server/tags.js';
import { publicTags, isPrivateProfile } from '../shared/governance.js';
import { scriptedDatabase, step } from './support/database.js';
import { publicProfile } from '../server/profile.js';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

test('Superadmin can update visibility on built-in tags without renaming them',async()=>{
  const db=scriptedDatabase({table:'profile_tags',data:[{key:'hero',visibility:'internal'}]});
  await createTagService(()=>db).update({isSuperAdmin:true},{key:'hero',visibility:'internal'});
  assert.deepEqual(step(db.calls[0],'update')[0],{visibility:'internal'});
});

test('public tag labels respect saved visibility even for built-in profile roles',()=>{
  const definitions=[{key:'hero',visibility:'internal'},{key:'profile-creator',visibility:'public'}];
  assert.deepEqual(publicTags(['hero','profile-creator'],definitions),['profile-creator']);
  assert.equal(isPrivateProfile({tags:['private'],profile_private:false}),false);
});

test('public profile loads built-in definitions and removes internal labels from both fields',async()=>{
  const db=scriptedDatabase(
    {table:'users',data:[{id:'owner',email:'owner@example.test',tags:['hero','profile-creator'],profile_private:false}]},
    {table:'profiles',data:[{name:'Profile',status:'published'}]},
    {table:'contributions',data:[]},{table:'offerings',data:[]},{table:'site_settings',data:[]},{table:'updates',data:[]},
    {table:'profile_tags',data:[{key:'hero',label:'Hero',visibility:'internal'},{key:'profile-creator',label:'Profile Creator',visibility:'public'}]},
  );
  const result=await publicProfile('profile',null,db);
  assert.deepEqual(result.tags,['profile-creator']);
  assert.deepEqual(result.tagDefinitions.map(tag=>tag.key),['profile-creator']);
});

test('visibility migration unlocks every built-in tag and refreshes privacy without changing grants',async()=>{
  const db=new PGlite();
  try {
    await db.exec("create role anon;create role authenticated;create role service_role;create table users(id uuid primary key,tags text[] default '{}',email text,name text,slug text,password_hash text,failed_attempts int,locked_until timestamptz);");
    const legacy=await readFile(new URL('../supabase/admin-experience.sql',import.meta.url),'utf8');
    await db.exec(legacy.slice(0,legacy.indexOf('create table if not exists public.admin_presence'))+'\ncommit;');
    await db.exec(await readFile(new URL('../supabase/master-rbac.sql',import.meta.url),'utf8'));
    await db.exec("alter table profile_tags drop constraint profile_tags_visibility_check;alter table profile_tags add constraint profile_tags_visibility_check check(visibility in('public','private','internal'));alter table profile_tags drop constraint profile_tags_key_check;alter table profile_tags add column platform_permissions text[] default '{}';insert into profile_tags(key,label,visibility,permissions,platform_permissions) values('profile-creator','Profile Creator','internal','{}',array['profiles.create']);insert into users(id,tags) values('11111111-1111-4111-8111-111111111111',array['hero']);");
    const migration=await readFile(new URL('../supabase/tag-visibility.sql',import.meta.url),'utf8');
    await db.exec(migration);await db.exec(migration);
    await db.exec("update profile_tags set visibility='private' where key='hero'");
    assert.equal((await db.query('select profile_private from users')).rows[0].profile_private,true);
    await db.exec("update profile_tags set visibility='internal' where key='hero'");
    assert.equal((await db.query('select profile_private from users')).rows[0].profile_private,false);
    await db.exec("update users set tags=array['private'];update profile_tags set visibility='public' where key='private';update profile_tags set visibility='public' where key='profile-creator';");
    assert.equal((await db.query('select profile_private from users')).rows[0].profile_private,false);
    assert.deepEqual((await db.query("select platform_permissions from profile_tags where key='profile-creator'")).rows[0].platform_permissions,['profiles.create']);
    await assert.rejects(db.exec("update profile_tags set key='custom-renamed' where key='hero'"),/keys/);
    await assert.rejects(db.exec("update profile_tags set label='Renamed' where key='hero'"),/Protected/);
  } finally {await db.close();}
});
