-- Run after engage.sql. Re-running is safe. Changes are applied together.
begin;

alter table updates drop constraint if exists updates_kind_check;
alter table updates add constraint updates_kind_check check (kind in ('update','schedule','event'));
alter table updates add column if not exists rsvp jsonb not null default '{}'::jsonb;
create unique index if not exists updates_owner_event_idx on updates (owner_id, id);
alter table offerings add column if not exists delivery_url text not null default '';

create table if not exists event_responses (
  id bigint generated always as identity primary key,
  owner_id uuid not null references users(id) on delete cascade,
  event_id bigint not null,
  name text not null check (length(name) between 2 and 100),
  email text not null check (length(email) <= 160 and email = lower(email)),
  phone text not null default '',
  response text not null check (response in ('going','not_going')),
  public_name boolean not null default false,
  note text not null default '' check (length(note) <= 500),
  answers jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array' and jsonb_array_length(answers) <= 6),
  edit_token_hash text not null check (edit_token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (owner_id,event_id) references updates(owner_id,id) on delete cascade,
  unique (owner_id,event_id,email)
);
create index if not exists event_responses_owner_idx on event_responses (owner_id,event_id,response,created_at);

create table if not exists payment_accounts (
  owner_id uuid primary key references users(id) on delete cascade,
  enabled boolean not null default false, updated_at timestamptz not null default now()
);

create table if not exists purchases (
  id uuid primary key,
  owner_id uuid not null references users(id) on delete cascade,
  request_id uuid not null,
  receipt_token_hash text not null check (receipt_token_hash ~ '^[a-f0-9]{64}$'),
  item_kind text not null check (item_kind in ('offering','product')), item_id text not null, item_title text not null,
  buyer_name text not null, buyer_email text not null, buyer_phone text not null default '',
  amount integer not null check (amount >= 0), currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null check (status in ('pending','paid','free','failed','refunded')),
  refunded_amount integer not null default 0 check (refunded_amount >= 0 and refunded_amount <= amount),
  razorpay_order_id text, razorpay_payment_id text, razorpay_key_id text,
  payment_credentials text, -- encrypted credential snapshot; never returned to a browser
  delivery_url text not null default '',
  fulfillment_status text not null default 'pending' check (fulfillment_status in ('pending','fulfilled')),
  admin_note text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), paid_at timestamptz,
  unique (owner_id,request_id),
  check ((status = 'free' and amount = 0) or (status <> 'free' and amount > 0))
);
create unique index if not exists purchases_order_idx on purchases (owner_id,razorpay_order_id) where razorpay_order_id is not null;
create unique index if not exists purchases_payment_idx on purchases (owner_id,razorpay_payment_id) where razorpay_payment_id is not null;
create unique index if not exists purchases_shared_order_idx on purchases (razorpay_order_id) where razorpay_order_id is not null;
create unique index if not exists purchases_shared_payment_idx on purchases (razorpay_payment_id) where razorpay_payment_id is not null;
create index if not exists purchases_owner_idx on purchases (owner_id,created_at desc);

create table if not exists public_actions (
  id bigint generated always as identity primary key,
  owner_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('rsvp','checkout')), ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists public_actions_rate_idx on public_actions (owner_id,kind,ip_hash,created_at);

-- Serialize requests for each owner/IP/action to make the hourly limit reliable across serverless workers.
create or replace function claim_public_action(p_owner uuid,p_kind text,p_ip_hash text,p_limit integer)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  if p_owner is null or p_kind is null or p_kind not in ('rsvp','checkout') or p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' or p_limit is null or p_limit < 1 or p_limit > 50 then raise exception 'Invalid submission.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text || ':' || p_kind || ':' || p_ip_hash,0));
  if (select count(*) from public_actions where owner_id=p_owner and kind=p_kind and ip_hash=p_ip_hash and created_at > now()-interval '1 hour') >= p_limit then
    raise exception 'Too many requests. Please try again later.';
  end if;
  delete from public_actions where owner_id=p_owner and created_at < now()-interval '1 day';
  insert into public_actions(owner_id,kind,ip_hash) values(p_owner,p_kind,p_ip_hash);
  return true;
end $$;

-- Lock the event before validating and saving. An email's existing response requires its private edit token.
create or replace function save_event_response(p_owner uuid,p_event bigint,p_value jsonb,p_token_hash text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare e updates%rowtype; previous event_responses%rowtype; q jsonb; saved_id bigint; v_email text;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid edit receipt.'; end if;
  select * into e from updates where owner_id=p_owner and id=p_event and kind='event' and status='published' for update;
  if not found then raise exception 'Event not found.'; end if;
  if coalesce(e.rsvp->>'enabled','true')='false' or coalesce(e.ends_at,e.starts_at+interval '3 hours') < now() or e.starts_at is null then raise exception 'This event is no longer accepting responses.'; end if;
  if p_value->>'response' not in ('going','not_going') or length(coalesce(p_value->>'name','')) < 2 then raise exception 'Check your response form.'; end if;
  if coalesce(e.rsvp->>'requirePhone','false')='true' and length(regexp_replace(coalesce(p_value->>'phone',''),'\D','','g')) < 7 then raise exception 'A phone number is required.'; end if;
  for q in select value from jsonb_array_elements(coalesce(e.rsvp->'questions','[]'::jsonb)) loop
    if q->>'required'='true' and not exists(select 1 from jsonb_array_elements(coalesce(p_value->'answers','[]'::jsonb)) a where a->>'id'=q->>'id' and length(trim(coalesce(a->>'value',''))) > 0) then raise exception 'Please answer every required question.'; end if;
  end loop;
  v_email := lower(trim(p_value->>'email'));
  select * into previous from event_responses where owner_id=p_owner and event_id=p_event and email=v_email for update;
  if found then
    if previous.edit_token_hash <> p_token_hash then raise exception 'A response using this email already exists. Use the browser where it was submitted to update it.'; end if;
    update event_responses set name=p_value->>'name',phone=coalesce(p_value->>'phone',''),response=p_value->>'response',public_name=coalesce(p_value->>'publicName','false')='true',note=coalesce(p_value->>'note',''),answers=coalesce(p_value->'answers','[]'::jsonb),updated_at=now() where owner_id=p_owner and id=previous.id returning id into saved_id;
  else
    insert into event_responses(owner_id,event_id,name,email,phone,response,public_name,note,answers,edit_token_hash)
    values(p_owner,p_event,p_value->>'name',v_email,coalesce(p_value->>'phone',''),p_value->>'response',coalesce(p_value->>'publicName','false')='true',coalesce(p_value->>'note',''),coalesce(p_value->'answers','[]'::jsonb),p_token_hash) returning id into saved_id;
  end if;
  return jsonb_build_object('id',saved_id,'response',p_value->>'response');
end $$;

-- Contact details and edit capabilities never appear in this public summary. Counts include all responses.
create or replace function event_rsvp_summary(p_owner uuid,p_event bigint)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'going',(select count(*) from event_responses where owner_id=p_owner and event_id=p_event and response='going'),
    'notGoing',(select count(*) from event_responses where owner_id=p_owner and event_id=p_event and response='not_going'),
    'goingNames',case when coalesce(u.rsvp->>'showAttendees','true')='true' then (select coalesce(jsonb_agg(name),'[]'::jsonb) from (select name from event_responses where owner_id=p_owner and event_id=p_event and response='going' and public_name order by created_at,id limit 200) names) else '[]'::jsonb end,
    'notGoingNames',case when coalesce(u.rsvp->>'showAttendees','true')='true' then (select coalesce(jsonb_agg(name),'[]'::jsonb) from (select name from event_responses where owner_id=p_owner and event_id=p_event and response='not_going' and public_name order by created_at,id limit 200) names) else '[]'::jsonb end
  ) from updates u where u.owner_id=p_owner and u.id=p_event and u.kind='event' and u.status='published';
$$;

-- The only transition to paid. Compare the stored order, owner, amount and currency under a row lock.
create or replace function complete_purchase(p_owner uuid,p_purchase uuid,p_order text,p_payment text,p_amount integer,p_currency text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare p purchases%rowtype;
begin
  select * into p from purchases where owner_id=p_owner and id=p_purchase for update;
  if not found or p.razorpay_order_id is distinct from p_order or p.amount is distinct from p_amount or p.currency is distinct from p_currency or p_order is null or p_payment is null or p_payment !~ '^pay_[A-Za-z0-9]+$' then raise exception 'The payment does not match this purchase.'; end if;
  if p.status in ('paid','refunded') then
    if p.razorpay_payment_id is distinct from p_payment then raise exception 'This purchase already has a different payment.'; end if;
    return to_jsonb(p);
  end if;
  update purchases set status='paid',razorpay_payment_id=p_payment,paid_at=coalesce(paid_at,now()),fulfillment_status=case when delivery_url<>'' then 'fulfilled' else fulfillment_status end,updated_at=now() where owner_id=p_owner and id=p_purchase returning * into p;
  return to_jsonb(p);
end $$;

create or replace function purchase_summary(p_owner uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'total',(select count(*) from purchases where owner_id=p_owner),
    'paid',(select count(*) from purchases where owner_id=p_owner and status='paid'),
    'free',(select count(*) from purchases where owner_id=p_owner and status='free'),
    'pending',(select count(*) from purchases where owner_id=p_owner and status='pending'),
    'revenue',(select coalesce(jsonb_agg(t),'[]'::jsonb) from (select currency,sum(amount-refunded_amount) as amount from purchases where owner_id=p_owner and status in ('paid','refunded') group by currency order by currency) t)
  );
$$;

-- Use Razorpay's cumulative refunded amount so repeated notifications never count a refund twice.
create or replace function record_purchase_refund(p_owner uuid,p_purchase uuid,p_amount integer)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare p purchases%rowtype;
begin
  select * into p from purchases where owner_id=p_owner and id=p_purchase and status in ('paid','refunded') for update;
  if not found or p_amount is null or p_amount < 0 or p_amount > p.amount then raise exception 'Invalid refund amount.'; end if;
  update purchases set refunded_amount=greatest(refunded_amount,p_amount),status=case when greatest(refunded_amount,p_amount)=amount then 'refunded' else status end,updated_at=now() where owner_id=p_owner and id=p_purchase returning * into p;
  return to_jsonb(p);
end $$;

alter table event_responses enable row level security;
alter table payment_accounts enable row level security;
alter table purchases enable row level security;
alter table public_actions enable row level security;
revoke all on event_responses,payment_accounts,purchases,public_actions from anon,authenticated;
grant select,insert,update,delete on event_responses,payment_accounts,purchases,public_actions to service_role;
grant usage,select on sequence event_responses_id_seq,public_actions_id_seq to service_role;
revoke all on function claim_public_action(uuid,text,text,integer),save_event_response(uuid,bigint,jsonb,text),event_rsvp_summary(uuid,bigint),complete_purchase(uuid,uuid,text,text,integer,text),record_purchase_refund(uuid,uuid,integer),purchase_summary(uuid) from public,anon,authenticated;
grant execute on function claim_public_action(uuid,text,text,integer),save_event_response(uuid,bigint,jsonb,text),event_rsvp_summary(uuid,bigint),complete_purchase(uuid,uuid,text,text,integer,text),record_purchase_refund(uuid,uuid,integer),purchase_summary(uuid) to service_role;

commit;
