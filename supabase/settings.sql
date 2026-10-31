-- Personal-AI page look (background image + adjustments). Run after registration.sql. Safe to run again.
create table if not exists site_settings (
  id bigint generated always as identity primary key,
  owner_id uuid not null unique references users(id) on delete cascade,
  bg_path text,                                   -- file in the public "backgrounds" bucket, under <owner id>/
  bg jsonb not null default '{}',                 -- focal point, zoom, blur, brightness, dim, parallax, ball
  updated_at timestamptz not null default now()
);
alter table site_settings enable row level security;

-- Public bucket (visitors must be able to see the image). Only images, 3 MB max; uploads need a server-issued token.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backgrounds', 'backgrounds', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
