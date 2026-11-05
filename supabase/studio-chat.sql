-- Run after schema.sql, multitenant.sql and studio-assistant.sql.
-- Admin conversations are private and are written only by the command service.
begin;
create table if not exists studio_chat (
  id bigint generated always as identity primary key,
  owner_id uuid not null references users(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 2000),
  answer text not null check (char_length(answer) between 1 and 12000),
  review_id uuid references studio_reviews(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists studio_chat_owner_id_idx on studio_chat (owner_id, id desc);
alter table studio_chat enable row level security;
revoke all on studio_chat from anon, authenticated;
grant all on studio_chat to service_role;
grant usage, select on sequence studio_chat_id_seq to service_role;
commit;
