-- AI registration: profile, contributions, offerings. Run after multitenant.sql. Safe to run again.
-- Profile data and contribution data live in separate tables on purpose.

create table if not exists profiles (
  id bigint generated always as identity primary key,
  owner_id uuid not null unique references users(id) on delete cascade,
  name text, education jsonb not null default '[]', contact jsonb not null default '{}',
  experience jsonb not null default '{}', designation text, expertise jsonb not null default '[]',
  purpose text not null default '',
  visibility jsonb not null default '{}',                 -- per-section show/hide; contact is private by default
  status text not null default 'draft' check (status in ('draft','published')),
  original_text text,                                     -- what the person wrote (private, for corrections and audit)
  ai_extracted jsonb,                                     -- what the AI produced, kept to tell AI vs user-confirmed apart
  field_sources jsonb not null default '{}',              -- per field: 'ai' (unchanged) or 'user' (edited/added)
  confirmed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists contributions (
  id bigint generated always as identity primary key,
  owner_id uuid not null references users(id) on delete cascade,
  category text not null, subtype text not null default '', description text not null default '',
  intent text not null default 'unspecified' check (intent in ('free','paid','mixed','unspecified')),
  enabled boolean not null default true, visible boolean not null default true,
  source text not null default 'user' check (source in ('ai','user')),
  created_at timestamptz not null default now()
);
create unique index if not exists contributions_unique on contributions (owner_id, category, lower(subtype));

create table if not exists offerings (
  id bigint generated always as identity primary key,
  owner_id uuid not null references users(id) on delete cascade,
  contribution_id bigint not null references contributions(id) on delete cascade,
  title text not null, description text not null default '',
  pricing text not null default 'unspecified' check (pricing in ('free','paid','unspecified')),
  price numeric, currency text, details jsonb not null default '{}',
  active boolean not null default true, created_at timestamptz not null default now()
);
create index if not exists offerings_contribution_idx on offerings (contribution_id);

create table if not exists profile_submissions (            -- every AI extraction, for audit and rate limiting
  id bigint generated always as identity primary key,
  owner_id uuid not null references users(id) on delete cascade,
  input_text text not null, ai_output jsonb, created_at timestamptz not null default now()
);
create index if not exists profile_submissions_owner_time on profile_submissions (owner_id, created_at);

alter table profiles enable row level security;
alter table contributions enable row level security;
alter table offerings enable row level security;
alter table profile_submissions enable row level security;
