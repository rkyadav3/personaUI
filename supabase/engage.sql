-- Updates, schedule and enquiries. Run after portfolio.sql. Safe to run again.
--  updates   : what an admin posts for visitors (kind 'update' = news / upcoming update, kind 'schedule' = dated event)
--  enquiries : what visitors send through the form on /p/<slug>/contact; each row belongs to the profile owner only

create table if not exists updates (
  id bigint generated always as identity primary key,
  owner_id uuid not null references users(id) on delete cascade,
  kind text not null default 'update' check (kind in ('update','schedule')),
  title text not null,
  body text not null default '',
  starts_at timestamptz,                     -- schedule: when it starts. update: optional "happens on" date (a future date shows as Upcoming)
  ends_at timestamptz,
  location text not null default '',
  url text not null default '', link_label text not null default '',
  status text not null default 'draft' check (status in ('draft','published')),
  pinned boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists updates_owner_idx on updates (owner_id, kind, status, starts_at);

create table if not exists enquiries (
  id bigint generated always as identity primary key,
  owner_id uuid not null references users(id) on delete cascade,
  -- who
  name text not null, email text not null, phone text not null default '',
  organisation text not null default '', location text not null default '',
  -- what
  kind text not null default 'general',
  offering_id bigint references offerings(id) on delete set null,
  offering_title text not null default '',   -- copied at send time, so it still reads right if the offering is renamed or removed
  subject text not null, message text not null,
  -- when / how
  pref_date date, pref_time text not null default '', pref_contact text not null default '',
  meeting_mode text not null default '', budget text not null default '',
  consent boolean not null default false,
  -- admin side
  status text not null default 'new' check (status in ('new','read','replied','archived')),
  admin_note text not null default '',
  ip_hash text,                              -- salted hash for rate limiting, never the IP itself
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists enquiries_owner_idx on enquiries (owner_id, status, created_at desc);
create index if not exists enquiries_rate_idx on enquiries (ip_hash, created_at);

alter table updates enable row level security;
alter table enquiries enable row level security;
