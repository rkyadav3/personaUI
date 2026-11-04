-- Run after schema.sql, multitenant.sql and events-commerce.sql.
-- Custom admin sessions use the server's service role. Browsers cannot read or approve reviews directly.
begin;
create table if not exists studio_reviews (
  id uuid primary key,
  owner_id uuid not null references users(id) on delete cascade,
  command text not null check (char_length(command) between 1 and 2000),
  plan jsonb not null check (jsonb_typeof(plan) = 'object'),
  status text not null default 'pending' check (status in ('pending','running','applied','partial','failed','cancelled')),
  results jsonb not null default '[]'::jsonb check (jsonb_typeof(results) = 'array'),
  error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz not null,
  check (plan ? 'steps' and jsonb_typeof(plan->'steps') = 'array' and jsonb_array_length(plan->'steps') between 1 and 16),
  check (expires_at > created_at)
);
create index if not exists studio_reviews_owner_created_idx on studio_reviews (owner_id, created_at desc);
alter table studio_reviews enable row level security;
revoke all on studio_reviews from anon, authenticated;
grant all on studio_reviews to service_role;
commit;
