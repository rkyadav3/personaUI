-- Run after multitenant.sql, registration.sql and events-commerce.sql, before deploying the platform dashboard.
begin;
alter table public.users add column if not exists tags text[] not null default '{}';
alter table public.users drop constraint if exists users_profile_tags_check;
alter table public.users add constraint users_profile_tags_check check (tags <@ array['hero','special','private']::text[]);
alter table public.invite_codes add column if not exists creator_name text;
alter table public.invite_codes add column if not exists creator_email text;
update public.invite_codes c set creator_name = creator.name, creator_email = creator.email
from public.users creator where creator.id = c.created_by and c.creator_email is null;

create table if not exists public.platform_suggestions (
  id bigint generated always as identity primary key,
  owner_id uuid references public.users(id) on delete set null,
  author_name text, author_email text not null,
  kind text not null check (kind in ('add','remove','update')),
  title text not null check (length(title) between 1 and 160),
  body text not null check (length(body) between 1 and 5000),
  status text not null default 'new' check (status in ('new','reviewed','planned','done','declined')),
  owner_reply text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists platform_suggestions_owner_time on public.platform_suggestions(owner_id, created_at desc);
alter table public.platform_suggestions enable row level security;

create table if not exists public.invite_redemptions (
  id bigint generated always as identity primary key,
  invite_code_id bigint references public.invite_codes(id) on delete set null,
  code text not null, created_by uuid,
  creator_name text, creator_email text,
  invited_user_id uuid unique references public.users(id) on delete set null,
  invited_name text, invited_email text not null,
  joined_at timestamptz not null default now()
);
create index if not exists invite_redemptions_creator_time on public.invite_redemptions(created_by, joined_at desc);
alter table public.invite_redemptions enable row level security;

create table if not exists public.platform_settings (
  key text primary key check (key = 'home'), value jsonb not null default '{}' check (jsonb_typeof(value) = 'object'),
  updated_by uuid references public.users(id) on delete set null, updated_at timestamptz not null default now()
);
alter table public.platform_settings enable row level security;

-- Financial snapshots survive account deletion and never contain payment credentials or delivery links.
create table if not exists public.platform_sales (
  id uuid primary key, owner_id uuid not null, seller_name text, seller_email text,
  item_kind text not null, item_id text not null, item_title text not null, buyer_name text,
  amount integer not null check (amount >= 0), currency text not null,
  status text not null check (status in ('pending','paid','free','failed','refunded')),
  refunded_amount integer not null default 0 check (refunded_amount >= 0 and refunded_amount <= amount),
  razorpay_payment_id text, created_at timestamptz not null, paid_at timestamptz, updated_at timestamptz not null default now()
);
create index if not exists platform_sales_owner_time on public.platform_sales(owner_id, created_at desc);
alter table public.platform_sales enable row level security;
create or replace function public.record_platform_sale() returns trigger
language plpgsql set search_path = public as $$
begin
  insert into platform_sales(id, owner_id, seller_name, seller_email, item_kind, item_id, item_title, buyer_name, amount, currency, status, refunded_amount, razorpay_payment_id, created_at, paid_at)
  select new.id, new.owner_id, u.name, u.email, new.item_kind, new.item_id, new.item_title, new.buyer_name, new.amount, new.currency, new.status, new.refunded_amount, new.razorpay_payment_id, new.created_at, new.paid_at
  from users u where u.id = new.owner_id
  on conflict (id) do update set amount = excluded.amount, currency = excluded.currency, status = excluded.status,
  refunded_amount = excluded.refunded_amount, razorpay_payment_id = excluded.razorpay_payment_id, paid_at = excluded.paid_at, updated_at = now();
  return new;
end $$;
drop trigger if exists purchases_platform_sale on public.purchases;
create trigger purchases_platform_sale after insert or update on public.purchases for each row execute function public.record_platform_sale();
insert into public.platform_sales(id, owner_id, seller_name, seller_email, item_kind, item_id, item_title, buyer_name, amount, currency, status, refunded_amount, razorpay_payment_id, created_at, paid_at)
select p.id, p.owner_id, u.name, u.email, p.item_kind, p.item_id, p.item_title, p.buyer_name, p.amount, p.currency, p.status, p.refunded_amount, p.razorpay_payment_id, p.created_at, p.paid_at
from public.purchases p join public.users u on u.id = p.owner_id on conflict (id) do nothing;

create or replace function public.log_invite_redemption() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.invite_code_id is not null then
    insert into invite_redemptions(invite_code_id, code, created_by, creator_name, creator_email, invited_user_id, invited_name, invited_email, joined_at)
    select c.id, c.code, c.created_by, coalesce(c.creator_name, creator.name), coalesce(c.creator_email, creator.email), new.id, new.name, new.email, new.created_at
    from invite_codes c left join users creator on creator.id = c.created_by where c.id = new.invite_code_id
    on conflict (invited_user_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists users_invite_redemption on public.users;
create trigger users_invite_redemption after insert or update of invite_code_id on public.users
for each row execute function public.log_invite_redemption();

-- Existing joins retain their original creation date; snapshots survive account deletion.
insert into public.invite_redemptions(invite_code_id, code, created_by, creator_name, creator_email, invited_user_id, invited_name, invited_email, joined_at)
select c.id, c.code, c.created_by, coalesce(c.creator_name, creator.name), coalesce(c.creator_email, creator.email), u.id, u.name, u.email, u.created_at
from public.users u join public.invite_codes c on c.id = u.invite_code_id left join public.users creator on creator.id = c.created_by
on conflict (invited_user_id) do nothing;

-- Lock the code, create the account, consume one use and record attribution in one transaction.
create or replace function public.register_with_invite(p_code text, p_email text, p_name text, p_slug text, p_password_hash text)
returns setof public.users language plpgsql set search_path = public as $$
declare invitation public.invite_codes; created public.users;
begin
  select * into invitation from invite_codes where code = p_code for update;
  if invitation.id is null or invitation.revoked or (invitation.expires_at is not null and invitation.expires_at <= now()) or invitation.uses >= invitation.max_uses then
    raise exception 'Invite unavailable';
  end if;
  insert into users(email, name, slug, password_hash, invite_code_id)
  values (p_email, p_name, p_slug, p_password_hash, invitation.id) returning * into created;
  update invite_codes set uses = uses + 1 where id = invitation.id;
  return next created;
end $$;
revoke all on function public.register_with_invite(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.register_with_invite(text,text,text,text,text) to service_role;
revoke all on public.platform_suggestions, public.invite_redemptions, public.platform_settings, public.platform_sales from anon, authenticated;
grant all on public.platform_suggestions, public.invite_redemptions, public.platform_settings, public.platform_sales to service_role;
grant usage, select on sequence public.platform_suggestions_id_seq, public.invite_redemptions_id_seq to service_role;
commit;
