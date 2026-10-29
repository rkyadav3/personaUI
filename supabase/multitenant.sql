-- Run AFTER schema.sql (safe to run again). The admin code was already multi-tenant (accounts, invite codes,
-- owner_id on every table) but schema.sql predates that. If your Supabase project already has these objects,
-- compare before running: this file only adds what is missing.
create extension if not exists pgcrypto;

create table if not exists invite_codes (
  id bigint generated always as identity primary key,
  code text not null unique, label text,
  max_uses int not null default 1, uses int not null default 0,
  expires_at timestamptz, revoked boolean not null default false,
  created_by uuid, created_at timestamptz not null default now()
);
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique, name text, slug text unique,
  password_hash text not null,
  failed_attempts int not null default 0, locked_until timestamptz,
  invite_code_id bigint references invite_codes(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table users enable row level security;
alter table invite_codes enable row level security;

do $$ declare t text; begin
  foreach t in array array['files','folders','topics','posts','templates','chunks','chat_log'] loop
    execute format('alter table %I add column if not exists owner_id uuid references users(id) on delete cascade', t);
    execute format('create index if not exists %I on %I (owner_id)', t || '_owner_idx', t);
  end loop;
end $$;

-- Folder names are unique per owner and parent, not globally.
drop index if exists folders_unique_name;
create unique index if not exists folders_unique_name on folders (owner_id, coalesce(parent_id, 0), name);

create or replace function chunk_sources(p_owner uuid)
returns table (source_key text, source_hash text)
language sql stable as $$ select source_key, min(source_hash) from chunks where owner_id = p_owner group by source_key $$;

create or replace function hybrid_search(
  query_embedding extensions.vector(768),
  keyword_query text default '',
  match_count int default 6,
  min_similarity float default 0.6,
  min_keyword_rank float default 0.2,
  p_owner uuid default null
)
returns table (id bigint, source_name text, heading text, content text, similarity float, keyword_rank float, score float)
language sql stable set search_path = public, extensions as $$
  with vec as (
    select c.id, 1 - (c.embedding <=> query_embedding) as sim,
           row_number() over (order by c.embedding <=> query_embedding) as rnk
    from chunks c where c.embedding is not null and c.owner_id = p_owner
    order by c.embedding <=> query_embedding limit 30
  ),
  q as (select case when coalesce(keyword_query,'') = '' then null else to_tsquery('english', keyword_query) end as tsq),
  kw as (
    select c.id, ts_rank_cd(c.fts, q.tsq) as r,
           row_number() over (order by ts_rank_cd(c.fts, q.tsq) desc) as rnk
    from chunks c, q where q.tsq is not null and c.owner_id = p_owner and c.fts @@ q.tsq
    order by r desc limit 30
  ),
  fused as (
    select coalesce(v.id, k.id) as id, v.sim, k.r,
           coalesce(1.0 / (60 + v.rnk), 0) + coalesce(1.0 / (60 + k.rnk), 0) as score
    from vec v full outer join kw k on k.id = v.id
  )
  select c.id, c.source_name, c.heading, c.content,
         coalesce(f.sim, 0)::float, coalesce(f.r, 0)::float, f.score::float
  from fused f join chunks c on c.id = f.id
  where coalesce(f.sim, 0) >= min_similarity or coalesce(f.r, 0) >= min_keyword_rank
  order by f.score desc limit match_count
$$;
-- The old single-tenant signatures would leak across owners; drop them.
drop function if exists hybrid_search(extensions.vector, text, int, float, float);
drop function if exists chunk_sources();
