import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
export const ownerId='11111111-1111-4111-8111-111111111111', memberId='22222222-2222-4222-8222-222222222222';
export async function addonDatabase(stages=[]) {
  const db=new PGlite();
  try {
  await db.exec(`create role service_role bypassrls; create role anon; create role authenticated;
    create table users(id uuid primary key,name text,slug text,email text,tags jsonb default '[]',profile_private boolean default false,locked_until timestamptz);
    create table profiles(id bigint primary key,owner_id uuid unique,name text,status text default 'published',views integer default 0);
    create table files(id bigint primary key,owner_id uuid,name text,status text default 'published');
    create table posts(id bigint primary key,owner_id uuid,title text,status text default 'published');
    insert into users(id,name,slug,email) values('${ownerId}','Acme','acme','admin@example.test'),('${memberId}','Member','member','member@example.test');
    grant all on all tables in schema public to service_role;`);
  for(const name of ['workspaces','organization-profiles','website-integrations',...stages]){
    const sql=await readFile(new URL('../../supabase/'+name+'.sql',import.meta.url),'utf8');
    await db.exec(sql);await db.exec(sql);
  }
  return db;
  } catch (error) { await db.close(); throw error; }
}

