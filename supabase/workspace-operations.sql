begin;
create or replace function public.sync_workspace_profile_name() returns trigger
language plpgsql set search_path=public as $$
begin
  update workspaces set name=coalesce(new.name,''),updated_at=now() where id=new.workspace_id;
  return new;
end $$;
drop trigger if exists workspace_profile_name on profiles;
create trigger workspace_profile_name after insert or update of name on profiles for each row execute function sync_workspace_profile_name();
update workspaces w set name=coalesce(p.name,w.name) from profiles p where p.workspace_id=w.id;
create table if not exists public.platform_health_checks (
  component text primary key check(component in('generation','embedding')), status text not null check(status in('ok','failed','unknown')),
  checked_at timestamptz not null default now(), detail text not null
);
create table if not exists public.api_security_buckets (
  bucket timestamptz not null, kind text not null check(kind in('unauthorized','forbidden','rate_limited')),
  hits bigint not null default 1, primary key(bucket,kind)
);
alter table platform_health_checks enable row level security;
alter table api_security_buckets enable row level security;
grant all on platform_health_checks,api_security_buckets to service_role;
create or replace function public.record_api_rejection(p_kind text) returns void
language sql set search_path=public as $$
  insert into api_security_buckets(bucket,kind) values(date_trunc('hour',now()),p_kind)
  on conflict(bucket,kind) do update set hits=api_security_buckets.hits+1
$$;
create or replace function public.manage_workspace_operations(p_actor uuid,p_workspace uuid,p_input jsonb)
returns jsonb language plpgsql set search_path=public as $$
declare w workspaces; settings workspace_api_settings; previous jsonb;
begin
  select * into w from workspaces where id=p_workspace for update;
  if w.id is null then raise exception 'Workspace not found.'; end if;
  insert into workspace_api_settings(workspace_id) values(w.id) on conflict do nothing;
  select to_jsonb(s)||jsonb_build_object('status',w.status) into previous from workspace_api_settings s where workspace_id=w.id;
  if p_input ? 'status' then
    if p_input->>'status' not in('active','suspended','archived') then raise exception 'Invalid workspace status.'; end if;
    update workspaces set status=p_input->>'status',updated_at=now() where id=w.id;
  end if;
  update workspace_api_settings set
    enabled=coalesce((p_input->>'enabled')::boolean,enabled),
    external_enabled=coalesce((p_input->>'external_enabled')::boolean,external_enabled),
    monthly_limit=coalesce((p_input->>'monthly_limit')::integer,monthly_limit),
    minute_limit=coalesce((p_input->>'minute_limit')::integer,minute_limit),
    retention_days=coalesce((p_input->>'retention_days')::integer,retention_days)
    where workspace_id=w.id returning * into settings;
  insert into workspace_audit(workspace_id,actor_id,action,detail) values(w.id,p_actor,'platform.workspace.change',jsonb_build_object('before',previous,'changes',p_input));
  return jsonb_build_object('ok',true,'settings',to_jsonb(settings));
end $$;
create or replace function public.platform_persona_health() returns jsonb
language plpgsql set search_path=public as $$
declare api jsonb; security jsonb;
begin
  select jsonb_build_object('windowHours',24,'requests',count(*),
    'failed',count(*) filter(where state='failed'),'pending',count(*) filter(where state='pending'),
    'stuck',count(*) filter(where state='pending' and created_at<now()-interval '50 seconds'),
    'platform',count(*) filter(where source='own_platform'),'external',count(*) filter(where source='external_api'),
    'p95Ms',round((percentile_cont(.95) within group(order by extract(epoch from(completed_at-created_at))*1000) filter(where completed_at is not null))::numeric),
    'lastRequestAt',max(created_at)) into api from persona_requests where created_at>now()-interval '24 hours';
  select jsonb_build_object('activeKeys',count(*) filter(where revoked_at is null and expires_at>now()),
    'expiringKeys',count(*) filter(where revoked_at is null and expires_at>now() and expires_at<now()+interval '7 days'),
    'expiredKeys',count(*) filter(where revoked_at is null and expires_at<=now()),
    'revokedKeys',count(*) filter(where revoked_at is not null),
    'rejectionWindowStart',date_trunc('hour',now()-interval '24 hours'),
    'rejections',coalesce((select jsonb_object_agg(kind,hits) from(select kind,sum(hits) hits from api_security_buckets where bucket>=date_trunc('hour',now()-interval '24 hours') group by kind) q),'{}'::jsonb))
    into security from persona_api_keys;
  return jsonb_build_object('checkedAt',now(),'api',api,'security',security);
end $$;
revoke all on function public.record_api_rejection(text),public.manage_workspace_operations(uuid,uuid,jsonb),public.platform_persona_health() from public;
grant execute on function public.record_api_rejection(text),public.manage_workspace_operations(uuid,uuid,jsonb),public.platform_persona_health() to service_role;
commit;

