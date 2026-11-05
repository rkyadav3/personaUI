-- Run after schema.sql and multitenant.sql, before deploying the Profile Q&A code.
-- Existing questions remain available; their answers were never stored and stay NULL.
alter table public.chat_log add column if not exists answer text;
alter table public.chat_log add column if not exists sources jsonb not null default '[]'::jsonb;
create index if not exists chat_log_owner_history_idx
  on public.chat_log (owner_id, created_at desc, id desc);
