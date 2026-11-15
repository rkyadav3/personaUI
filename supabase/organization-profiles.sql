-- Run after workspaces.sql, before enabling WORKSPACES_ENABLED.
begin;
alter table public.profiles add column if not exists profile_type text not null default 'individual' check(profile_type in ('individual','organization'));
alter table public.profiles add column if not exists organization jsonb not null default '{}' check(jsonb_typeof(organization)='object');
alter table public.users add column if not exists workspace_status text not null default 'active' check(workspace_status in ('active','suspended','archived'));
alter table public.users add column if not exists workspace_type text check(workspace_type in ('individual','organization'));
update public.users u set workspace_status=w.status,workspace_type=w.type from public.workspaces w where w.owner_id=u.id;
create or replace function public.sync_workspace_account_state() returns trigger
language plpgsql set search_path=public as $$
begin
  update users set workspace_status=new.status,workspace_type=new.type where id=new.owner_id;
  return new;
end $$;
drop trigger if exists workspace_account_state on public.workspaces;
create trigger workspace_account_state after insert or update of status,type on public.workspaces for each row execute function public.sync_workspace_account_state();
do $$
declare tab text;
begin
  foreach tab in array array['files','posts'] loop
    execute format('alter table public.%I add column if not exists audience text not null default ''public'' check(audience in (''public'',''internal''))',tab);
    execute format('alter table public.%I add column if not exists valid_from timestamptz',tab);
    execute format('alter table public.%I add column if not exists valid_until timestamptz',tab);
    execute format('alter table public.%I add column if not exists revision integer not null default 1',tab);
    execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()',tab);
  end loop;
end $$;
create or replace function public.set_source_policy(
  p_user uuid,p_workspace uuid,p_kind text,p_source bigint,p_audience text,p_valid_from timestamptz,p_valid_until timestamptz,p_revision integer
) returns jsonb language plpgsql set search_path=public as $$
declare target text; owner uuid; saved jsonb;
begin
  if p_kind not in ('file','post') or p_audience not in ('public','internal') or p_revision<1 or p_revision is null then raise exception 'Choose a valid source policy.'; end if;
  if p_valid_from is not null and p_valid_until is not null and p_valid_until<=p_valid_from then raise exception 'End date must be after start date.'; end if;
  select w.owner_id into owner from workspaces w join workspace_members m on m.workspace_id=w.id
    where w.id=p_workspace and w.status='active' and m.user_id=p_user and m.status='active' and m.role in ('owner','admin');
  if owner is null then raise exception 'Workspace is not available to your account.'; end if;
  target:=case p_kind when 'file' then 'files' else 'posts' end;
  execute format('update %I set audience=$1,valid_from=$2,valid_until=$3,revision=revision+1,updated_at=now(),updated_by=$4
    where id=$5 and owner_id=$6 and workspace_id=$7 and revision=$8 returning to_jsonb(%I.*)',target,target)
    into saved using p_audience,p_valid_from,p_valid_until,p_user,p_source,owner,p_workspace,p_revision;
  if saved is null then raise exception 'The source changed or is not available. Reload it before saving.'; end if;
  return saved;
end $$;
revoke all on function public.set_source_policy(uuid,uuid,text,bigint,text,timestamptz,timestamptz,integer) from public;
grant execute on function public.set_source_policy(uuid,uuid,text,bigint,text,timestamptz,timestamptz,integer) to service_role;
commit;
