-- Portfolio-style public site (/p/<slug>, /work, /products, /experience, /talks, /about): every member's own text, as one JSON document.
-- Run after page.sql. Safe to run again.
alter table site_settings add column if not exists portfolio jsonb not null default '{}';
