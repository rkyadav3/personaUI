-- Apply after the existing migrations, including events-commerce.sql and knowledge-visibility.sql.
-- Uploads are separate from files/chunks: store assets never become persona knowledge.
begin;
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  name text not null, storage_path text not null unique,
  mime text not null, size bigint not null check (size between 1 and 52428800),
  bucket text not null default 'persona-assets' check(bucket in ('persona-assets','backgrounds')),
  purpose text not null check (purpose in ('media','delivery')),
  status text not null default 'pending' check (status in ('pending','ready')),
  created_at timestamptz not null default now(),
  unique(owner_id,id),
  check (storage_path like owner_id::text || '/' || id::text || '.%')
);
create index if not exists assets_owner_idx on public.assets(owner_id);
alter table public.assets enable row level security;
revoke all on public.assets from public,anon,authenticated;
grant all on public.assets to service_role;
alter table public.offerings add column if not exists delivery_asset_id uuid;
alter table public.offerings add column if not exists updated_at timestamptz not null default now();
create or replace function public.touch_store_item() returns trigger language plpgsql set search_path=public as $$
begin new.updated_at:=clock_timestamp(); return new; end $$;
drop trigger if exists store_item_updated on public.offerings;
create trigger store_item_updated before update on public.offerings for each row execute function public.touch_store_item();
alter table public.offerings add column if not exists delivery_kind text not null default 'file' check (delivery_kind in ('file','service'));
alter table public.purchases add column if not exists delivery_asset_id uuid;
alter table public.purchases add column if not exists delivery_kind text not null default 'file' check (delivery_kind in ('file','service'));
-- Keep snapshots and old receipts intact. New checkouts require a hosted asset or service fulfillment.
create index if not exists purchases_owner_email_idx on public.purchases(owner_id,buyer_email,created_at desc);
create index if not exists purchases_owner_phone_idx on public.purchases(owner_id,buyer_phone,created_at desc);
update public.purchases set buyer_email=lower(trim(buyer_email)),buyer_phone=regexp_replace(coalesce(buyer_phone,''),'[^0-9+]','','g');
do $$ begin
  if not exists(select 1 from pg_constraint where conname='offerings_owned_delivery_asset') then
    alter table public.offerings add constraint offerings_owned_delivery_asset foreign key(owner_id,delivery_asset_id) references public.assets(owner_id,id);
  end if;
  if not exists(select 1 from pg_constraint where conname='purchases_owned_delivery_asset') then
    alter table public.purchases add constraint purchases_owned_delivery_asset foreign key(owner_id,delivery_asset_id) references public.assets(owner_id,id);
  end if;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('persona-assets','persona-assets',false,52428800,array['image/jpeg','image/png','image/webp','image/gif','application/pdf','application/epub+zip','text/plain','video/mp4','video/webm','audio/mpeg','audio/wav','application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
update storage.buckets set public=false where id in ('files','backgrounds');
-- Register previous cover/image uploads in place, without copying or indexing their contents.
insert into public.assets(id,owner_id,name,storage_path,mime,size,purpose,status,bucket)
select split_part(split_part(o.name,'/',2),'.',1)::uuid,u.id,split_part(o.name,'/',2),o.name,
  o.metadata->>'mimetype',case when o.metadata->>'size' ~ '^[0-9]{1,8}$' then (o.metadata->>'size')::bigint end,'media','ready','backgrounds'
from storage.objects o join public.users u on split_part(o.name,'/',1)=u.id::text
where o.bucket_id='backgrounds' and o.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and o.metadata->>'mimetype' in ('image/jpeg','image/png','image/webp')
  and case when o.metadata->>'size' ~ '^[0-9]{1,8}$' then (o.metadata->>'size')::bigint end between 1 and 52428800
on conflict(id) do nothing;
-- Restrictive policies override any broad permissive policy previously installed.
drop policy if exists persona_private_objects on storage.objects;
create policy persona_private_objects on storage.objects as restrictive for all to anon,authenticated
using(bucket_id not in ('files','persona-assets','backgrounds')) with check(bucket_id not in ('files','persona-assets','backgrounds'));
commit;
