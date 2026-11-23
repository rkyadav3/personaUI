-- Run after master-rbac.sql, hosted-assets.sql,
-- workspaces.sql, organization-profiles.sql and collaboration-webhooks.sql.
begin;
alter table users add column if not exists platform_permissions text[] not null default '{}';
alter table users add column if not exists approval_status text not null default 'approved' check(approval_status in('approved','pending','rejected'));
alter table users add column if not exists profile_created_by uuid references users(id) on delete set null;
alter table users add column if not exists profile_approved_by uuid references users(id) on delete set null;
alter table users drop constraint if exists users_platform_permissions_check;
alter table users add constraint users_platform_permissions_check check(platform_permissions <@ array['profiles.create','profiles.edit','master.manage']::text[] and array_position(platform_permissions,null) is null);
alter table profile_tags add column if not exists platform_permissions text[] not null default '{}';
alter table profile_tags drop constraint if exists profile_tags_visibility_check;
alter table profile_tags add constraint profile_tags_visibility_check check(visibility in('public','private','internal'));
alter table profile_tags drop constraint if exists profile_tags_key_check;
alter table profile_tags add constraint profile_tags_key_check check(key in('hero','special','private','university','hospital','contributors','standard','founders','god','fraud','scammer','narration-setter','gov-departments','commercial-enterprises','community','manufacturer','profile-creator') or key ~ '^custom-[a-z0-9]+(-[a-z0-9]+)*$');
alter table profile_tags drop constraint if exists profile_tags_permissions_check;
alter table profile_tags add constraint profile_tags_permissions_check check(permissions <@ array['profile','content','knowledge','commerce','enquiries','community','jobs']::text[] and array_position(permissions,null) is null);
alter table profile_tags drop constraint if exists profile_tags_platform_permissions_check;
alter table profile_tags add constraint profile_tags_platform_permissions_check check(platform_permissions <@ array['profiles.create','profiles.edit','master.manage']::text[] and array_position(platform_permissions,null) is null);
-- Apply the initial default grant once. Later edits and reruns must preserve denials.
create table if not exists persona_migrations(key text primary key, applied_at timestamptz not null default now());
alter table persona_migrations enable row level security;
revoke all on persona_migrations from public,anon,authenticated;
grant all on persona_migrations to service_role;
do $$ begin
  if not exists(select 1 from persona_migrations where key='jobs-profiles-defaults') then
    update profile_tags set permissions=array_append(permissions,'jobs')
      where visibility<>'internal' and key<>'profile-creator'
        and permissions @> array['profile','content','knowledge','commerce','enquiries','community']::text[]
        and not 'jobs'=any(permissions);
    insert into persona_migrations(key) values('jobs-profiles-defaults');
  end if;
end $$;
alter table profile_tags alter column permissions set default array['profile','content','knowledge','commerce','enquiries','community','jobs'];
-- Preserve an existing custom tag and its assignments if its label matches the new built-in.
do $$ declare target text; candidate text; suffix integer:=1; begin
  lock table profile_tags in share row exclusive mode;
  select key into target from profile_tags where lower(trim(label))='profile creator' and key<>'profile-creator';
  if target is not null then
    candidate:='Profile Creator (custom)';
    while exists(select 1 from profile_tags where lower(trim(label))=lower(candidate) and key<>target) loop
      suffix:=suffix+1; candidate:='Profile Creator (custom '||suffix||')';
    end loop;
    update profile_tags set label=candidate where key=target;
  end if;
end $$;
insert into profile_tags(key,label,visibility,permissions,platform_permissions) values('profile-creator','Profile Creator','internal','{}',array['profiles.create']) on conflict(key) do nothing;
update storage.buckets set allowed_mime_types=case
  when allowed_mime_types is null then null
  when 'application/msword'=any(allowed_mime_types) then allowed_mime_types
  else array_append(allowed_mime_types,'application/msword') end
  where id='persona-assets';

-- Registration consumes an actor-bound upload once, before reading storage.
create table if not exists file_uploads(
  storage_path text primary key, name text not null,
  owner_id uuid not null references users(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  created_by uuid not null references users(id) on delete cascade,
  updated_by uuid references users(id) on delete set null,
  consumed boolean not null default false,
  expires_at timestamptz not null default now()+interval '2 hours',
  foreign key(workspace_id,owner_id) references workspaces(id,owner_id)
);
alter table file_uploads enable row level security;
revoke all on file_uploads from public,anon,authenticated;
grant all on file_uploads to service_role;
drop trigger if exists workspace_reference on file_uploads;
create trigger workspace_reference before insert or update on file_uploads for each row execute function stamp_workspace_reference();

create or replace function create_admin_profile(p_actor uuid,p_owner boolean,p_name text,p_email text,p_slug text,p_type text,p_hash text) returns jsonb language plpgsql set search_path=public as $$
declare target uuid; approval text;
begin
  perform 1 from users where id=p_actor and approval_status='approved' for update;
  if not found then raise exception 'Creator is unavailable'; end if;
  if not p_owner and not exists(select 1 from users u where u.id=p_actor and ('profiles.create'=any(u.platform_permissions) or exists(select 1 from profile_tags t where t.key=any(u.tags) and 'profiles.create'=any(t.platform_permissions)))) then raise exception 'Profile creation access required'; end if;
  if p_type not in('individual','organisation') or length(p_name) not between 1 and 120 or length(p_email)>160 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug) not between 3 and 40 or p_hash !~ '^\$2[aby]\$' then raise exception 'Invalid profile'; end if;
  if not p_owner and (select count(*) from users where profile_created_by=p_actor and approval_status='pending')>=50 then raise exception 'Approve existing pending profiles first'; end if;
  approval:=case when p_owner then 'approved' else 'pending' end;
  insert into users(name,email,slug,password_hash,profile_type,tags,approval_status,profile_created_by,profile_approved_by) values(p_name,p_email,p_slug,p_hash,p_type,array['standard'],approval,p_actor,case when p_owner then p_actor else null end) returning id into target;
  update workspaces set type=case when p_type='organisation' then 'organization' else 'individual' end,name=p_name where owner_id=target;
  insert into profiles(owner_id,workspace_id,name,status,profile_type) values(target,target,p_name,'draft',case when p_type='organisation' then 'organization' else 'individual' end);
  return jsonb_build_object('id',target,'name',p_name,'approvalStatus',approval);
end $$;
revoke all on function create_admin_profile(uuid,boolean,text,text,text,text,text) from public,anon,authenticated;
grant execute on function create_admin_profile(uuid,boolean,text,text,text,text,text) to service_role;
create or replace function approved_profile_publication() returns trigger language plpgsql set search_path=public as $$ begin
 if new.status='published' and not exists(select 1 from users where id=new.owner_id and approval_status='approved') then raise exception 'Superadmin approval is required'; end if; return new;
end $$;
drop trigger if exists approved_profile_publication on profiles;
create trigger approved_profile_publication before insert or update on profiles for each row execute function approved_profile_publication();

create table if not exists jobs(
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references users(id) on delete cascade,
 workspace_id uuid references workspaces(id) on delete cascade, created_by uuid references users(id), updated_by uuid references users(id),
 title text not null check(length(title) between 1 and 160), description text not null check(length(description) between 20 and 12000), requirements text not null default '', location text not null default '',
 employment_type text not null check(employment_type in('Full-time','Part-time','Contract','Temporary','Internship','Volunteer')),
 workplace text not null check(workplace in('On-site','Hybrid','Remote')), salary text not null default '',
 status text not null default 'draft' check(status in('draft','published','closed')), closes_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(workspace_id,owner_id) references workspaces(id,owner_id)
);
create index if not exists jobs_owner_idx on jobs(owner_id,status,created_at desc);
create table if not exists job_resumes(
 id uuid primary key, owner_id uuid not null references users(id) on delete cascade, workspace_id uuid references workspaces(id) on delete cascade,
 job_id uuid references jobs(id) on delete set null, name text not null, mime text not null, size bigint not null check(size between 1 and 5242880), storage_path text not null unique,
 submitted boolean not null default false, created_at timestamptz not null default now(), created_by uuid references users(id), updated_by uuid references users(id),
 foreign key(workspace_id,owner_id) references workspaces(id,owner_id)
);
alter table jobs enable row level security;
alter table job_resumes enable row level security;
revoke all on jobs,job_resumes from anon,authenticated;
grant all on jobs,job_resumes to service_role;
alter table enquiries add column if not exists job_id uuid references jobs(id) on delete set null;
alter table enquiries add column if not exists resume_id uuid references job_resumes(id) on delete set null;
alter table enquiries add column if not exists resume_url text;
alter table public_actions drop constraint if exists public_actions_kind_check;
alter table public_actions add constraint public_actions_kind_check check(kind in('rsvp','checkout','job'));
create or replace function claim_public_action(p_owner uuid,p_kind text,p_ip_hash text,p_limit integer)
returns boolean language plpgsql security invoker set search_path=public as $$
begin
  if p_owner is null or p_kind is null or p_kind not in('rsvp','checkout','job') or p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' or p_limit is null or p_limit<1 or p_limit>50 then raise exception 'Invalid submission.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_kind||':'||p_ip_hash,0));
  if (select count(*) from public_actions where owner_id=p_owner and kind=p_kind and ip_hash=p_ip_hash and created_at>now()-interval '1 hour')>=p_limit then raise exception 'Too many requests. Please try again later.'; end if;
  delete from public_actions where owner_id=p_owner and created_at<now()-interval '1 day';
  insert into public_actions(owner_id,kind,ip_hash) values(p_owner,p_kind,p_ip_hash);
  return true;
end $$;
revoke all on function claim_public_action(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function claim_public_action(uuid,text,text,integer) to service_role;
create or replace function submit_job_application(p_job uuid,p_resume uuid,p_input jsonb) returns bigint language plpgsql set search_path=public as $$
declare job jobs; resume job_resumes; result bigint;
begin
 select * into job from jobs where id=p_job and status='published' and (closes_at is null or closes_at>now()) for share;
 if job.id is null or not exists(select 1 from users u join profiles p on p.owner_id=u.id where u.id=job.owner_id and u.approval_status='approved' and coalesce(u.profile_private,false)=false and (u.locked_until is null or u.locked_until<now()) and p.status='published') then raise exception 'Job is no longer accepting applications'; end if;
 if job.workspace_id is not null and not exists(select 1 from workspaces where id=job.workspace_id and status='active') then raise exception 'Profile unavailable'; end if;
 if length(coalesce(p_input->>'name','')) not between 1 and 120 or length(coalesce(p_input->>'email','')) not between 3 and 160 then raise exception 'Invalid application'; end if;
 if p_resume is not null then
   select * into resume from job_resumes where id=p_resume and job_id=job.id and owner_id=job.owner_id and not submitted and created_at>now()-interval '1 day' for update;
   if resume.id is null then raise exception 'Upload the resume again'; end if;
   update job_resumes set submitted=true where id=p_resume;
 elsif coalesce(p_input->>'resume_url','') !~ '^https://' then raise exception 'Resume required'; end if;
 insert into enquiries(owner_id,workspace_id,name,email,phone,kind,subject,message,consent,job_id,resume_id,resume_url) values(job.owner_id,job.workspace_id,p_input->>'name',p_input->>'email',coalesce(p_input->>'phone',''),'job','Job application: '||job.title,coalesce(p_input->>'message',''),true,job.id,p_resume,p_input->>'resume_url') returning id into result;
 return result;
end $$;
revoke all on function submit_job_application(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function submit_job_application(uuid,uuid,jsonb) to service_role;
commit;
