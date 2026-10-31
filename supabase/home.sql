-- Home page: view / click / rating counters for the member directory and the ranked rails.
-- Run after settings.sql. Safe to run again.

alter table profiles  add column if not exists views int not null default 0;
alter table offerings add column if not exists views int not null default 0;          -- opened on a profile
alter table offerings add column if not exists clicks int not null default 0;         -- "Buy / Open / Enquire" clicks (demand, not confirmed sales)
alter table offerings add column if not exists rating_sum int not null default 0;
alter table offerings add column if not exists rating_count int not null default 0;

-- One rating per visitor per offering. `voter` is a salted hash (never an IP or an email).
create table if not exists offering_ratings (
  id bigint generated always as identity primary key,
  offering_id bigint not null references offerings(id) on delete cascade,
  voter text not null,
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  unique (offering_id, voter)
);
alter table offering_ratings enable row level security;

create index if not exists offerings_created_idx on offerings (created_at desc);

-- Atomic counters (supabase-js cannot do `views = views + 1`).
create or replace function bump_profile_view(p_owner uuid) returns void
language sql as $$ update profiles set views = views + 1 where owner_id = p_owner and status = 'published' $$;

create or replace function bump_offering(p_id bigint, p_field text) returns void
language plpgsql as $$
begin
  if p_field = 'views' then update offerings set views = views + 1 where id = p_id and active;
  elsif p_field = 'clicks' then update offerings set clicks = clicks + 1 where id = p_id and active;
  end if;
end $$;

-- Insert or change a visitor's rating and refresh the totals in one transaction.
create or replace function rate_offering(p_id bigint, p_voter text, p_stars int) returns void
language plpgsql as $$
begin
  if not exists (select 1 from offerings where id = p_id and active) then return; end if;
  insert into offering_ratings (offering_id, voter, stars) values (p_id, p_voter, p_stars)
    on conflict (offering_id, voter) do update set stars = excluded.stars, created_at = now();
  update offerings o set rating_sum = s.sum, rating_count = s.n
    from (select coalesce(sum(stars), 0)::int as sum, count(*)::int as n from offering_ratings where offering_id = p_id) s
    where o.id = p_id;
end $$;
