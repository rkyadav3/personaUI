-- Apply after jobs-profiles.sql, staff-permissions.sql and tag-visibility.sql. Safe to rerun.
begin;
alter table users drop constraint if exists users_profile_type_check;
alter table users add constraint users_profile_type_check check(profile_type in('individual','organisation','jobs'));
alter table users drop constraint if exists users_workspace_type_check;
alter table users add constraint users_workspace_type_check check(workspace_type in('individual','organization','jobs'));
alter table workspaces drop constraint if exists workspaces_type_check;
alter table workspaces add constraint workspaces_type_check check(type in('individual','organization','jobs'));
alter table profiles drop constraint if exists profiles_profile_type_check;
alter table profiles add constraint profiles_profile_type_check check(profile_type in('individual','organization','jobs'));
alter table users drop constraint if exists users_platform_permissions_check;
alter table users add constraint users_platform_permissions_check check(platform_permissions <@ array['profiles.create','profiles.edit','master.manage','profiles.review']::text[] and array_position(platform_permissions,null) is null);
alter table profile_tags drop constraint if exists profile_tags_platform_permissions_check;
alter table profile_tags add constraint profile_tags_platform_permissions_check check(platform_permissions <@ array['profiles.create','profiles.edit','master.manage','profiles.review']::text[] and array_position(platform_permissions,null) is null);
alter table profile_tags add column if not exists jobs_profile_permissions text[] not null default array['basics','experience','mindset','direction','business','interests','nation','hustles','inspiration'];
alter table profile_tags drop constraint if exists profile_tags_jobs_profile_permissions_check;
alter table profile_tags add constraint profile_tags_jobs_profile_permissions_check check(jobs_profile_permissions <@ array['basics','experience','mindset','direction','business','interests','nation','hustles','inspiration']::text[] and array_position(jobs_profile_permissions,null) is null);
alter table profile_tags drop constraint if exists profile_tags_key_check;
alter table profile_tags add constraint profile_tags_key_check check(key in('hero','special','private','university','hospital','contributors','standard','founders','god','fraud','scammer','narration-setter','gov-departments','commercial-enterprises','community','manufacturer','profile-creator') or key ~ '^custom-[a-z0-9]+(-[a-z0-9]+)*$');
alter table profile_tags drop constraint if exists profile_tags_permissions_check;
alter table profile_tags add constraint profile_tags_permissions_check check(permissions <@ array['profile','content','knowledge','commerce','enquiries','community','jobs','job_seeker']::text[] and array_position(permissions,null) is null and (not 'job_seeker'=any(permissions) or cardinality(permissions)=1));
alter table profile_tags drop constraint if exists profile_tags_job_seeker_conflict;
alter table profile_tags add constraint profile_tags_job_seeker_conflict check(not 'job_seeker'=any(permissions) or cardinality(platform_permissions)=0);
alter table users add column if not exists job_seeker boolean not null default false;
create or replace function sync_job_seeker_mode() returns trigger language plpgsql set search_path=public as $$ begin
  new.job_seeker:=exists(select 1 from profile_tags where key=any(new.tags) and 'job_seeker'=any(permissions));
  if new.job_seeker and (cardinality(new.platform_permissions)>0 or exists(select 1 from profile_tags where key=any(new.tags) and cardinality(platform_permissions)>0)) then raise exception 'Job Seeker conflicts with Superadmin access'; end if;
  return new;
end $$;
drop trigger if exists users_job_seeker_mode on users;
create trigger users_job_seeker_mode before insert or update of tags,platform_permissions on users for each row execute function sync_job_seeker_mode();
create or replace function refresh_tag_visibility() returns trigger language plpgsql set search_path=public as $$ begin
  if new.key<>old.key then raise exception 'Tag keys cannot be changed'; end if;
  if old.key not like 'custom-%' and new.label<>old.label then raise exception 'Protected tag names cannot be changed'; end if;
  if new.visibility is distinct from old.visibility or new.permissions is distinct from old.permissions or new.platform_permissions is distinct from old.platform_permissions then update users set tags=tags where new.key=any(tags); end if;
  return new;
end $$;
update users set tags=tags;

create table if not exists jobs_profiles(
  owner_id uuid primary key references users(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  sections jsonb not null default '{}' check(jsonb_typeof(sections)='object'),
  home jsonb not null default '{}' check(jsonb_typeof(home)='object'),
  published boolean not null default false,
  version integer not null default 0 check(version>=0),
  created_by uuid references users(id) on delete set null,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key(workspace_id,owner_id) references workspaces(id,owner_id),
  check(coalesce(sections->'nation'->>'audience','private')<>'public')
);
alter table jobs_profiles enable row level security;
revoke all on jobs_profiles from public,anon,authenticated;
grant all on jobs_profiles to service_role;
drop trigger if exists workspace_reference on jobs_profiles;
create trigger workspace_reference before insert or update on jobs_profiles for each row execute function stamp_workspace_reference();
alter table enquiries add column if not exists applicant_profile_owner uuid references users(id) on delete set null;

create or replace function setup_workspace_type(p_user uuid,p_workspace uuid,p_type text) returns jsonb language plpgsql set search_path=public as $$
declare target workspaces;
begin
  if p_type is null or p_type not in('individual','organization','jobs') then raise exception 'Choose Individual, Organization or Jobs Profile'; end if;
  select w.* into target from workspaces w join workspace_members m on m.workspace_id=w.id
    where w.id=p_workspace and w.status='active' and m.user_id=p_user and m.status='active' and m.role in('owner','admin') for update of w;
  if target.id is null then raise exception 'Workspace is not available to your account'; end if;
  if target.type is not null and target.type<>p_type then raise exception 'This workspace is already configured'; end if;
  update workspaces set type=p_type,updated_at=now() where id=target.id returning * into target;
  update users set profile_type=case when p_type='organization' then 'organisation' else p_type end where id=target.owner_id;
  if p_type='jobs' then
    insert into profiles(owner_id,workspace_id,name,status,profile_type) values(target.owner_id,target.id,'Jobs Profile','draft','jobs') on conflict(owner_id) do nothing;
  end if;
  return to_jsonb(target);
end $$;
create or replace function choose_profile_type(p_user uuid,p_type text) returns jsonb language plpgsql set search_path=public as $$
declare account users;
begin
  if p_type is null or p_type not in('individual','organisation','jobs') then raise exception 'Choose Individual, Organisation or Jobs Profile'; end if;
  select * into account from users where id=p_user for update;
  if account.id is null then raise exception 'Account not found'; end if;
  if account.profile_type is not null and account.profile_type<>p_type then raise exception 'Your profile type has already been chosen'; end if;
  update users set profile_type=p_type where id=p_user;
  update workspaces set type=case when p_type='organisation' then 'organization' else p_type end where owner_id=p_user and (type is null or type=case when p_type='organisation' then 'organization' else p_type end);
  if p_type='jobs' then
    insert into profiles(owner_id,workspace_id,name,status,profile_type) select p_user,id,'Jobs Profile','draft','jobs' from workspaces where owner_id=p_user and type='jobs' on conflict(owner_id) do nothing;
  end if;
  return jsonb_build_object('profile_type',p_type);
end $$;
create or replace function create_admin_profile(p_actor uuid,p_owner boolean,p_name text,p_email text,p_slug text,p_type text,p_hash text) returns jsonb language plpgsql set search_path=public as $$
declare target uuid; approval text;
begin
  perform 1 from users where id=p_actor and approval_status='approved' for update;
  if not found then raise exception 'Creator is unavailable'; end if;
  if not p_owner and not exists(select 1 from users u where u.id=p_actor and ('profiles.create'=any(u.platform_permissions) or exists(select 1 from profile_tags t where t.key=any(u.tags) and 'profiles.create'=any(t.platform_permissions)))) then raise exception 'Profile creation access required'; end if;
  if p_type is null or p_type not in('individual','organisation','jobs') or length(p_name) not between 1 and 120 or length(p_email)>160 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug) not between 3 and 40 or p_hash !~ '^\$2[aby]\$' then raise exception 'Invalid profile'; end if;
  if not p_owner and (select count(*) from users where profile_created_by=p_actor and approval_status='pending')>=50 then raise exception 'Approve existing pending profiles first'; end if;
  approval:=case when p_owner then 'approved' else 'pending' end;
  insert into users(name,email,slug,password_hash,profile_type,tags,approval_status,profile_created_by,profile_approved_by) values(p_name,p_email,p_slug,p_hash,p_type,array['standard'],approval,p_actor,case when p_owner then p_actor else null end) returning id into target;
  update workspaces set type=case when p_type='organisation' then 'organization' else p_type end,name=p_name where owner_id=target;
  insert into profiles(owner_id,workspace_id,name,status,profile_type) values(target,target,case when p_type='jobs' then 'Jobs Profile' else p_name end,'draft',case when p_type='organisation' then 'organization' else p_type end);
  return jsonb_build_object('id',target,'name',p_name,'approvalStatus',approval);
end $$;

-- Actor, current tag grants, approval and optimistic version are checked under locks.
create or replace function save_jobs_profile(p_owner uuid,p_actor uuid,p_section text,p_value jsonb,p_version integer,p_published boolean default null) returns jsonb language plpgsql security invoker set search_path=public as $$
declare actor users; target workspaces; document jobs_profiles; tag_keys text[];
begin
  lock table profile_tags in share mode;
  select * into actor from users where id=p_actor and approval_status='approved' for share;
  if actor.id is null then raise exception 'An approved account is required'; end if;
  select w.* into target from workspaces w join workspace_members m on m.workspace_id=w.id
    where w.owner_id=p_owner and (w.type='jobs' or actor.job_seeker) and w.status='active' and m.user_id=p_actor and m.status='active' and m.role in('owner','admin') for update of w;
  if target.id is null or not exists(select 1 from users where id=p_owner and approval_status='approved') then raise exception 'Jobs Profile administrator access required'; end if;
  tag_keys:=case when cardinality(actor.tags)>0 then actor.tags else array['standard'] end;
  if exists(select 1 from unnest(tag_keys) k left join profile_tags t on t.key=k where t.key is null or (not actor.job_seeker and not 'profile'=any(t.permissions)) or (p_section<>'home' and not p_section=any(t.jobs_profile_permissions))) then raise exception 'This section is hidden by current role permissions'; end if;
  if p_section is null or p_section not in('home','basics','experience','mindset','direction','business','interests','nation','hustles','inspiration') or jsonb_typeof(p_value) is distinct from 'object' or octet_length(p_value::text)>150000 then raise exception 'Invalid profile section'; end if;
  if p_section<>'home' and (coalesce(p_value->>'audience','') not in('private','public','applied_jobs') or jsonb_typeof(p_value->'value') is distinct from 'object') then raise exception 'Choose a valid audience and section'; end if;
  if p_section='nation' and p_value->>'audience'='public' then raise exception 'Nation-growth ideas cannot be public'; end if;
  if p_published is not null and p_section<>'home' then raise exception 'Publish from the Home editor'; end if;
  insert into jobs_profiles(owner_id,workspace_id,created_by) values(p_owner,target.id,p_actor) on conflict(owner_id) do nothing;
  select * into document from jobs_profiles where owner_id=p_owner for update;
  if p_version is null or p_version<>document.version then raise exception 'The profile changed in another editor'; end if;
  update jobs_profiles set
    sections=case when p_section='home' then sections else jsonb_set(sections,array[p_section],p_value) end,
    home=case when p_section='home' then p_value else home end,
    published=coalesce(p_published,published),version=version+1,updated_by=p_actor,updated_at=now()
    where owner_id=p_owner returning * into document;
  if target.type='jobs' then update profiles set
    name=coalesce(nullif(document.home->>'title',''),case when document.sections->'basics'->>'audience'='public' then nullif(document.sections->'basics'->'value'->>'name','') end,'Jobs Profile'),
    profile_type='jobs',status=case when document.published then 'published' else 'draft' end where owner_id=p_owner; end if;
  return to_jsonb(document);
end $$;

-- Only the authenticated applicant supplied by the API is linked; body fields never establish identity.
create or replace function submit_job_profile_application(p_job uuid,p_resume uuid,p_input jsonb,p_applicant uuid) returns bigint language plpgsql security invoker set search_path=public as $$
declare application bigint;
begin
  perform 1 from users u join workspaces w on w.owner_id=u.id where u.id=p_applicant and (w.type='jobs' or u.job_seeker) and w.status='active' and u.approval_status='approved' and (u.locked_until is null or u.locked_until<=now()) for share of u,w;
  if not found or not exists(select 1 from jobs_profiles where owner_id=p_applicant) then raise exception 'Save your Jobs Profile before sharing it with an application'; end if;
  application:=submit_job_application(p_job,p_resume,p_input);
  update enquiries set applicant_profile_owner=p_applicant where id=application;
  return application;
end $$;
revoke all on function save_jobs_profile(uuid,uuid,text,jsonb,integer,boolean),submit_job_profile_application(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function save_jobs_profile(uuid,uuid,text,jsonb,integer,boolean),submit_job_profile_application(uuid,uuid,jsonb,uuid) to service_role;
revoke all on function choose_profile_type(uuid,text),setup_workspace_type(uuid,uuid,text),create_admin_profile(uuid,boolean,text,text,text,text,text) from public,anon,authenticated;
grant execute on function choose_profile_type(uuid,text),setup_workspace_type(uuid,uuid,text),create_admin_profile(uuid,boolean,text,text,text,text,text) to service_role;
commit;
