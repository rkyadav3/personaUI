-- Public page (/p/<slug>) customisation: hero photo + texts, chips, store/sidebar layout, accent colour.
-- Run after settings.sql. Safe to run again.
alter table site_settings add column if not exists page jsonb not null default '{}';
alter table site_settings add column if not exists hero_path text;   -- file in the public "backgrounds" bucket, under <owner id>/
