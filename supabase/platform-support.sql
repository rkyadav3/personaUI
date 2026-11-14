-- Apply after registration.sql. Support requires an authenticated platform account.
begin;
create table if not exists public.support_tickets (
  id bigint generated always as identity primary key,
  owner_id uuid references public.users(id) on delete set null,
  author_name text,
  author_email text not null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  category text not null check (category in ('account','payments','technical','other')),
  status text not null default 'open' check (status in ('open','in_progress','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_tickets_owner_updated on public.support_tickets(owner_id,updated_at desc,id desc);
create index if not exists support_tickets_updated on public.support_tickets(updated_at desc,id desc);
create table if not exists public.support_messages (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references public.support_tickets(id) on delete cascade,
  author_id uuid references public.users(id) on delete set null,
  author_name text,
  author_email text not null,
  is_superadmin boolean not null,
  body text not null default '' check (char_length(body) <= 5000),
  status text not null check (status in ('open','in_progress','resolved')),
  created_at timestamptz not null default now()
);
create index if not exists support_messages_ticket_order on public.support_messages(ticket_id,created_at,id);
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
revoke all on public.support_tickets,public.support_messages from public,anon,authenticated;
grant all on public.support_tickets,public.support_messages to service_role;
grant usage,select on sequence public.support_tickets_id_seq,public.support_messages_id_seq to service_role;

create or replace function public.reply_support_ticket(p_ticket bigint,p_actor uuid,p_superadmin boolean,p_body text,p_status text default null)
returns jsonb language plpgsql set search_path = public as $$
declare request public.support_tickets; actor public.users; next_status text; observed timestamptz;
begin
  if p_superadmin is null or p_actor is null then raise exception 'Missing support identity'; end if;
  if p_body is null or char_length(btrim(p_body)) > 5000 then raise exception 'Invalid support message'; end if;
  if p_status is not null and (not p_superadmin or p_status not in ('open','in_progress','resolved')) then raise exception 'Invalid support status'; end if;
  if btrim(p_body) = '' and (not p_superadmin or p_status is null) then raise exception 'Enter a reply'; end if;
  select * into request from public.support_tickets where id=p_ticket for update;
  if not found then return jsonb_build_object('ok',false); end if;
  if not p_superadmin and request.owner_id is distinct from p_actor then return jsonb_build_object('ok',false); end if;
  select * into actor from public.users where id=p_actor;
  if not found then return jsonb_build_object('ok',false); end if;
  observed := clock_timestamp();
  next_status := case when p_superadmin then coalesce(p_status,case when request.status='open' then 'in_progress' else request.status end)
    when request.status = 'resolved' then 'open' else request.status end;
  if btrim(p_body) <> '' or next_status <> request.status then
    insert into public.support_messages(ticket_id,author_id,author_name,author_email,is_superadmin,body,status,created_at)
      values(p_ticket,p_actor,actor.name,actor.email,p_superadmin,btrim(p_body),next_status,observed);
    update public.support_tickets set status=next_status,updated_at=observed where id=p_ticket;
  end if;
  return jsonb_build_object('ok',true,'status',next_status);
end $$;
revoke all on function public.reply_support_ticket(bigint,uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.reply_support_ticket(bigint,uuid,boolean,text,text) to service_role;
commit;
