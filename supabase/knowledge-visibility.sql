-- Apply after schema.sql and multitenant.sql. Safe to run again.
-- Public retrieval must check the current source state even if a sync is delayed.
begin;

create or replace function public.hybrid_search(
  query_embedding extensions.vector(768),
  keyword_query text default '', match_count int default 6,
  min_similarity float default 0.6, min_keyword_rank float default 0.2,
  p_owner uuid default null
)
returns table (id bigint, source_name text, heading text, content text, similarity float, keyword_rank float, score float)
language sql stable set search_path = public, extensions as $$
  with eligible as not materialized (
    select c.* from chunks c where c.owner_id = p_owner and (
      (c.source_type = 'file' and exists (
        select 1 from files f where f.id = c.source_id and f.owner_id = p_owner and f.status = 'published'
      )) or (c.source_type = 'post' and exists (
        select 1 from posts p where p.id = c.source_id and p.owner_id = p_owner and p.status = 'published'
      ))
    )
  ), vec as (
    select c.id, 1 - (c.embedding <=> query_embedding) as sim,
           row_number() over (order by c.embedding <=> query_embedding) as rnk
    from eligible c where c.embedding is not null
    order by c.embedding <=> query_embedding limit 30
  ), q as (
    select case when coalesce(keyword_query, '') = '' then null else to_tsquery('english', keyword_query) end as tsq
  ), kw as (
    select c.id, ts_rank_cd(c.fts, q.tsq) as r,
           row_number() over (order by ts_rank_cd(c.fts, q.tsq) desc) as rnk
    from eligible c, q where q.tsq is not null and c.fts @@ q.tsq
    order by r desc limit 30
  ), fused as (
    select coalesce(v.id, k.id) as id, v.sim, k.r,
           coalesce(1.0 / (60 + v.rnk), 0) + coalesce(1.0 / (60 + k.rnk), 0) as score
    from vec v full outer join kw k on k.id = v.id
  )
  select c.id, c.source_name, c.heading, c.content,
         coalesce(f.sim, 0)::float, coalesce(f.r, 0)::float, f.score::float
  from fused f join eligible c on c.id = f.id
  where coalesce(f.sim, 0) >= min_similarity or coalesce(f.r, 0) >= min_keyword_rank
  order by f.score desc limit match_count
$$;

create or replace function public.remove_unpublished_chunks()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from chunks where owner_id = old.owner_id and source_key = tg_argv[0] || ':' || old.id::text;
    return old;
  end if;
  if new.status <> 'published' then
    delete from chunks where owner_id = old.owner_id and source_key = tg_argv[0] || ':' || old.id::text;
  end if;
  return new;
end $$;
drop trigger if exists files_remove_unpublished_chunks on public.files;
create trigger files_remove_unpublished_chunks after update of status or delete on public.files
for each row execute function public.remove_unpublished_chunks('file');
drop trigger if exists posts_remove_unpublished_chunks on public.posts;
create trigger posts_remove_unpublished_chunks after update of status or delete on public.posts
for each row execute function public.remove_unpublished_chunks('post');

-- Clean up rows left behind by earlier saves/deletes; republishing requires Sync.
delete from public.chunks c where (
  (c.source_type = 'file' and exists (select 1 from public.files f where f.id = c.source_id and f.owner_id = c.owner_id and f.status = 'published'))
  or (c.source_type = 'post' and exists (select 1 from public.posts p where p.id = c.source_id and p.owner_id = c.owner_id and p.status = 'published'))
) is not true;
revoke all on function public.hybrid_search(extensions.vector, text, int, float, float, uuid), public.remove_unpublished_chunks() from public, anon, authenticated;
grant execute on function public.hybrid_search(extensions.vector, text, int, float, float, uuid), public.remove_unpublished_chunks() to service_role;
commit;
