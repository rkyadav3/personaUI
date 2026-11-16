-- Run after the current profile/platform migrations. Compatible with legacy owner_id callers.
begin;
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.users(id) on delete cascade,
  type text check (type in ('individual','organization')),
  name text not null default '', slug text unique,
  status text not null default 'active' check (status in ('active','suspended','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,owner_id)
);
create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','contributor','viewer')),
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now(),
  primary key(workspace_id,user_id)
);
create index if not exists workspace_members_user on public.workspace_members(user_id,status);
insert into public.workspaces(id,owner_id,type,name,slug)
select u.id,u.id,case when exists(select 1 from public.profiles p where p.owner_id=u.id) then 'individual' else null end,
  coalesce((select p.name from public.profiles p where p.owner_id=u.id),u.name,''),u.slug
from public.users u on conflict(owner_id) do nothing;
insert into public.workspace_members(workspace_id,user_id,role)
select id,owner_id,'owner' from public.workspaces on conflict do nothing;

alter table public.users add column if not exists active_workspace_id uuid references public.workspaces(id) on delete set null;
update public.users u set active_workspace_id=w.id from public.workspaces w where w.owner_id=u.id and u.active_workspace_id is null;

create or replace function public.create_user_workspace() returns trigger
language plpgsql set search_path=public as $$
begin
  insert into workspaces(id,owner_id,name,slug) values(new.id,new.id,coalesce(new.name,''),new.slug);
  insert into workspace_members(workspace_id,user_id,role) values(new.id,new.id,'owner');
  update users set active_workspace_id=new.id where id=new.id;
  return new;
end $$;
drop trigger if exists user_workspace_created on public.users;
create trigger user_workspace_created after insert on public.users for each row execute function public.create_user_workspace();

create or replace function public.sync_workspace_slug() returns trigger
language plpgsql set search_path=public as $$
begin
  update workspaces set slug=new.slug,updated_at=now() where owner_id=new.id;
  return new;
end $$;
drop trigger if exists workspace_slug_changed on public.users;
create trigger workspace_slug_changed after update of slug on public.users for each row execute function public.sync_workspace_slug();

create or replace function public.stamp_workspace_reference() returns trigger
language plpgsql set search_path=public as $$
declare target uuid;
begin
  if tg_op='UPDATE' and new.owner_id is distinct from old.owner_id then
    raise exception 'Workspace ownership cannot be changed by a content operation.';
  end if;
  select id into target from workspaces where owner_id=new.owner_id;
  if target is null then raise exception 'Workspace is not available for this owner.'; end if;
  if new.workspace_id is not null and new.workspace_id<>target then
    raise exception 'Content belongs to a different workspace.';
  end if;
  new.workspace_id:=target;
  return new;
end $$;

do $$
declare tab text; constraint_name text;
begin
  foreach tab in array array['files','folders','topics','posts','templates','chunks','chat_log','profiles','contributions','offerings',
    'profile_submissions','site_settings','updates','enquiries','event_responses','purchases','payment_accounts','public_actions',
    'studio_reviews','studio_chat','admin_presence','assets'] loop
    if to_regclass('public.'||tab) is null then continue; end if;
    execute format('alter table public.%I add column if not exists workspace_id uuid',tab);
    execute format('alter table public.%I add column if not exists created_by uuid references public.users(id) on delete set null',tab);
    execute format('alter table public.%I add column if not exists updated_by uuid references public.users(id) on delete set null',tab);
    execute format('update public.%I t set workspace_id=w.id from workspaces w where t.owner_id=w.owner_id and t.workspace_id is null',tab);
    constraint_name:=tab||'_workspace_owner_fkey';
    if not exists(select 1 from pg_constraint where conname=constraint_name and conrelid=to_regclass('public.'||tab)) then
      execute format('alter table public.%I add constraint %I foreign key(workspace_id,owner_id) references public.workspaces(id,owner_id)',tab,constraint_name);
    end if;
    execute format('create index if not exists %I on public.%I(workspace_id)',tab||'_workspace_idx',tab);
    execute format('drop trigger if exists workspace_reference on public.%I',tab);
    execute format('create trigger workspace_reference before insert or update on public.%I for each row execute function stamp_workspace_reference()',tab);
  end loop;
end $$;

create or replace function public.setup_workspace_type(p_user uuid,p_workspace uuid,p_type text) returns jsonb
language plpgsql set search_path=public as $$
declare target workspaces;
begin
  if p_type not in ('individual','organization') or p_type is null then raise exception 'Choose Individual or Organization.'; end if;
  select w.* into target from workspaces w join workspace_members m on m.workspace_id=w.id
    where w.id=p_workspace and w.status='active' and m.user_id=p_user and m.status='active' and m.role in ('owner','admin') for update of w;
  if target.id is null then raise exception 'Workspace is not available to your account.'; end if;
  if target.type is not null and target.type<>p_type then raise exception 'This workspace is already configured.'; end if;
  update workspaces set type=p_type,updated_at=now() where id=target.id returning * into target;
  return to_jsonb(target);
end $$;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
revoke all on function public.setup_workspace_type(uuid,uuid,text) from public;
grant execute on function public.setup_workspace_type(uuid,uuid,text) to service_role;
grant all on public.workspaces,public.workspace_members to service_role;
commit;
