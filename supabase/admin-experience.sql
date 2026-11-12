-- Run after platform-governance.sql and studio-chat.sql. Uses the existing service-role session architecture.
begin;
create table if not exists public.profile_tags (
  key text primary key, label text not null check (length(label) between 1 and 40),
  visibility text not null check (visibility in ('public','private')),
  check (key in ('hero','special','private') or key ~ '^custom-[a-z0-9]+(-[a-z0-9]+)*$')
);
create unique index if not exists profile_tags_label_unique on public.profile_tags(lower(label));
insert into public.profile_tags(key,label,visibility) values ('hero','Hero','public'),('special','Special','public'),('private','Private profile','private') on conflict (key) do nothing;
alter table public.profile_tags enable row level security;
alter table public.users add column if not exists profile_private boolean not null default false;
alter table public.users drop constraint if exists users_profile_tags_check;
alter table public.users add constraint users_profile_tags_check check (cardinality(tags) <= 20);
create or replace function public.resolve_profile_tags() returns trigger language plpgsql set search_path = public as $$
begin
  if exists(select 1 from unnest(new.tags) t where not exists(select 1 from profile_tags d where d.key=t)) then raise exception 'Unknown profile tag'; end if;
  new.profile_private := exists(select 1 from profile_tags where key=any(new.tags) and visibility='private');
  return new;
end $$;
drop trigger if exists users_resolve_profile_tags on public.users;
create trigger users_resolve_profile_tags before insert or update of tags,profile_private on public.users for each row execute function public.resolve_profile_tags();
update public.users set tags=tags;
create or replace function public.refresh_tag_visibility() returns trigger language plpgsql set search_path = public as $$
begin
  if old.key in ('hero','special','private') or new.key<>old.key then raise exception 'Built-in tags and tag keys cannot be changed'; end if;
  update users set tags=tags where new.key=any(tags);
  return new;
end $$;
drop trigger if exists profile_tags_refresh_visibility on public.profile_tags;
create trigger profile_tags_refresh_visibility after update on public.profile_tags for each row execute function public.refresh_tag_visibility();

create table if not exists public.admin_presence (
  owner_id uuid primary key references public.users(id) on delete cascade,
  last_seen timestamptz not null default now(), snapshot jsonb not null default '{}'
);
alter table public.admin_presence enable row level security;
create or replace function public.admin_activity_snapshot(p_owner uuid) returns jsonb language sql stable set search_path=public as $$
select jsonb_build_object(
  'sales',(select count(*) from purchases where owner_id=p_owner and status in ('paid','refunded')),
  'views',(select coalesce(sum(views),0) from profiles where owner_id=p_owner),
  'exchanges',(select count(*) from chat_log where owner_id=p_owner),
  'enquiries',(select count(*) from enquiries where owner_id=p_owner),
  'revenue',(select coalesce(jsonb_agg(r),'[]'::jsonb) from (select currency,sum(amount-refunded_amount)::bigint as net from purchases where owner_id=p_owner and status in ('paid','refunded') group by currency order by currency) r)
);
$$;
create or replace function public.resume_admin_activity(p_owner uuid) returns jsonb language plpgsql set search_path=public as $$
declare old_row admin_presence; current_snapshot jsonb; observed timestamptz := now();
begin
  -- Serialize resume and heartbeat calls for this admin, including the first insert.
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
  select * into old_row from admin_presence where owner_id=p_owner for update;
  current_snapshot := admin_activity_snapshot(p_owner);
  insert into admin_presence(owner_id,last_seen,snapshot) values(p_owner,observed,current_snapshot)
  on conflict(owner_id) do update set last_seen=excluded.last_seen,snapshot=excluded.snapshot;
  return jsonb_build_object('since',old_row.last_seen,'asOf',observed,'previous',old_row.snapshot,'current',current_snapshot);
end $$;
create or replace function public.touch_admin_activity(p_owner uuid) returns jsonb language plpgsql set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
  insert into admin_presence(owner_id,last_seen,snapshot) values(p_owner,now(),admin_activity_snapshot(p_owner))
  on conflict(owner_id) do update set last_seen=excluded.last_seen,snapshot=excluded.snapshot;
  return jsonb_build_object('ok',true);
end $$;
create or replace function public.admin_analytics(p_owner uuid) returns jsonb language sql stable set search_path=public as $$
with bounds as (select (now() at time zone 'UTC')::date as today), sales as (
  select (coalesce(paid_at,created_at) at time zone 'UTC')::date as day,count(*) as total
  from purchases,bounds where owner_id=p_owner and status in ('paid','refunded')
    and coalesce(paid_at,created_at)>=((today-29)::timestamp at time zone 'UTC') and coalesce(paid_at,created_at)<=now()
  group by 1
)
select jsonb_build_object('snapshot',admin_activity_snapshot(p_owner),'asOf',now(),'since',(today-29)::timestamp at time zone 'UTC',
  'dailySales',(select jsonb_agg(r order by r.day) from (
    select to_char(today-(29-i),'YYYY-MM-DD') as day,coalesce(s.total,0) as sales
    from generate_series(0,29) i left join sales s on s.day=today-(29-i)
  ) r)) from bounds;
$$;
alter table public.studio_chat add column if not exists insights jsonb;
revoke all on public.profile_tags,public.admin_presence from anon,authenticated;
grant all on public.profile_tags,public.admin_presence to service_role;
revoke all on function public.admin_activity_snapshot(uuid),public.resume_admin_activity(uuid),public.touch_admin_activity(uuid),public.admin_analytics(uuid) from public,anon,authenticated;
grant execute on function public.admin_activity_snapshot(uuid),public.resume_admin_activity(uuid),public.touch_admin_activity(uuid),public.admin_analytics(uuid) to service_role;
commit;
