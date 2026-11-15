-- Run after workspace-operations.sql.
begin;
create table if not exists workspace_invitations (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references workspaces(id) on delete cascade,
 email text not null,role text not null check(role in('admin','contributor','viewer')),token_hash text not null unique,
 status text not null default 'pending' check(status in('pending','accepted','revoked')),expires_at timestamptz not null default now()+interval '7 days',
 created_by uuid references users(id) on delete set null,created_at timestamptz not null default now()
);
create table if not exists workspace_webhooks (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references workspaces(id) on delete cascade,
 endpoint text not null,encrypted_secret text not null,events text[] not null,
 enabled boolean not null default true,created_at timestamptz not null default now()
);
create table if not exists webhook_events (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references workspaces(id) on delete cascade,
 type text not null,payload jsonb not null,created_at timestamptz not null default now()
);
create table if not exists webhook_deliveries (
 id uuid primary key default gen_random_uuid(),webhook_id uuid not null references workspace_webhooks(id) on delete cascade,
 event_id uuid not null references webhook_events(id) on delete cascade,
 state text not null default 'pending' check(state in('pending','delivering','delivered','failed')),attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),lease uuid,leased_until timestamptz,response_status integer,last_error text,
 created_at timestamptz not null default now(),unique(webhook_id,event_id)
);
create index if not exists webhook_delivery_queue on webhook_deliveries(state,next_attempt_at);
create or replace function enqueue_workspace_event(p_workspace uuid,p_type text,p_payload jsonb) returns uuid
language plpgsql set search_path=public as $$
declare event_id uuid;
begin
 if not exists(select 1 from workspace_webhooks h join workspaces w on w.id=h.workspace_id where w.id=p_workspace and w.status='active' and h.enabled and p_type=any(h.events)) then return null; end if;
 insert into webhook_events(workspace_id,type,payload) values(p_workspace,p_type,p_payload) returning id into event_id;
 insert into webhook_deliveries(webhook_id,event_id) select id,event_id from workspace_webhooks where workspace_id=p_workspace and enabled and p_type=any(events);
 return event_id;
end $$;
create or replace function webhook_source_changed() returns trigger
language plpgsql set search_path=public as $$
declare row_data jsonb; target uuid; event_type text;
begin
 if tg_op='UPDATE' and (to_jsonb(new)-'views'-'updated_at')=(to_jsonb(old)-'views'-'updated_at') then return null; end if;
 row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 target:=(row_data->>'workspace_id')::uuid;
 event_type:=case when tg_table_name='profiles' then 'profile.updated' else 'knowledge.changed' end;
 perform enqueue_workspace_event(target,event_type,jsonb_build_object('sourceId',row_data->>'id','sourceKind',tg_table_name,'operation',lower(tg_op)));
 return null;
end $$;
do $$ declare tab text; begin
 foreach tab in array array['profiles','files','posts'] loop
  execute format('drop trigger if exists webhook_source_event on %I',tab);
  execute format('create trigger webhook_source_event after insert or update or delete on %I for each row execute function webhook_source_changed()',tab);
 end loop;
end $$;
create or replace function webhook_persona_completed() returns trigger
language plpgsql set search_path=public as $$
begin
 if new.state='complete' and old.state='pending' then
  perform enqueue_workspace_event(new.workspace_id,'persona.answered',jsonb_build_object('requestId',new.id,'source',new.source));
 end if;
 return null;
end $$;
drop trigger if exists webhook_persona_event on persona_requests;
create trigger webhook_persona_event after update of state on persona_requests for each row execute function webhook_persona_completed();
create or replace function manage_workspace_team(p_actor uuid,p_workspace uuid,p_action text,p_input jsonb) returns jsonb
language plpgsql set search_path=public as $$
declare w workspaces; target uuid; invitation workspace_invitations;
begin
 select * into w from workspaces where id=p_workspace and status='active' for update;
 if w.id is null or not exists(select 1 from workspace_members where workspace_id=w.id and user_id=p_actor and status='active' and role in('owner','admin')) then raise exception 'Workspace administrator access is required.'; end if;
 if p_action='invite' then
  if p_input->>'role' not in('admin','contributor','viewer') or length(coalesce(p_input->>'hash',''))<>64 then raise exception 'Choose a team role.'; end if;
  if (select count(*) from workspace_invitations where workspace_id=w.id and status='pending' and expires_at>now())>=100 then raise exception 'Too many pending invitations.'; end if;
  insert into workspace_invitations(workspace_id,email,role,token_hash,created_by) values(w.id,lower(p_input->>'email'),p_input->>'role',p_input->>'hash',p_actor) returning * into invitation;
 elsif p_action in('member','remove') then
  target:=(p_input->>'userId')::uuid;
  if target=w.owner_id then raise exception 'The workspace owner cannot be changed here.'; end if;
  if not exists(select 1 from workspace_members where workspace_id=w.id and user_id=target) then raise exception 'Member not found.'; end if;
  update workspace_invitations set status='revoked' where workspace_id=w.id and status='pending'
   and email=(select lower(email) from users where id=target);
  if p_action='member' then
   if p_input->>'role' not in('admin','contributor','viewer') then raise exception 'Choose a team role.'; end if;
   update workspace_members set role=p_input->>'role',status='active' where workspace_id=w.id and user_id=target;
  else
   update workspace_members set status='revoked' where workspace_id=w.id and user_id=target;
   update users set active_workspace_id=null where id=target and active_workspace_id=w.id;
  end if;
 elsif p_action='revoke' then
  update workspace_invitations set status='revoked' where id=(p_input->>'id')::uuid and workspace_id=w.id and status='pending';
 else raise exception 'Choose a team action.'; end if;
 insert into workspace_audit(workspace_id,actor_id,action,detail) values(w.id,p_actor,'team.'||p_action,p_input-'hash');
 perform enqueue_workspace_event(w.id,'membership.changed',jsonb_build_object('operation',p_action));
 return jsonb_build_object('ok',true,'invitationId',invitation.id);
end $$;
create or replace function accept_workspace_invitation(p_actor uuid,p_hash text) returns jsonb
language plpgsql set search_path=public as $$
declare invite workspace_invitations; target uuid;
begin
 select workspace_id into target from workspace_invitations where token_hash=p_hash;
 perform 1 from workspaces where id=target and status='active' for update;
 if not found then raise exception 'Invitation is unavailable.'; end if;
 select * into invite from workspace_invitations where token_hash=p_hash and status='pending' and expires_at>now() for update;
 if invite.id is null or not exists(select 1 from users where id=p_actor and lower(email)=invite.email) then raise exception 'Sign in using the email this invitation was sent to.'; end if;
 if not exists(select 1 from workspace_members where workspace_id=invite.workspace_id and user_id=p_actor and role='owner') then
  insert into workspace_members(workspace_id,user_id,role) values(invite.workspace_id,p_actor,invite.role)
   on conflict(workspace_id,user_id) do update set role=excluded.role,status='active';
 end if;
 update workspace_invitations set status='accepted' where id=invite.id;
 update users set active_workspace_id=invite.workspace_id where id=p_actor;
 insert into workspace_audit(workspace_id,actor_id,action,detail) values(invite.workspace_id,p_actor,'team.accept',jsonb_build_object('invitationId',invite.id));
 perform enqueue_workspace_event(invite.workspace_id,'membership.changed',jsonb_build_object('operation','accepted'));
 return jsonb_build_object('workspaceId',invite.workspace_id);
end $$;
create or replace function switch_workspace(p_actor uuid,p_workspace uuid) returns jsonb
language plpgsql set search_path=public as $$
begin
 perform 1 from workspaces w join workspace_members m on m.workspace_id=w.id where w.id=p_workspace and w.status='active' and m.user_id=p_actor and m.status='active' for update of w;
 if not found then raise exception 'Workspace is unavailable to your account.'; end if;
 update users set active_workspace_id=p_workspace where id=p_actor;
 return jsonb_build_object('workspaceId',p_workspace);
end $$;
create or replace function manage_workspace_webhook(p_actor uuid,p_workspace uuid,p_action text,p_input jsonb) returns jsonb
language plpgsql set search_path=public as $$
declare target uuid;
begin
 perform 1 from workspaces where id=p_workspace and status='active' for update;
 if not found or not exists(select 1 from workspace_members where workspace_id=p_workspace and user_id=p_actor and status='active' and role in('owner','admin')) then raise exception 'Workspace administrator access is required.'; end if;
 if p_action='create' then
  if (select count(*) from workspace_webhooks where workspace_id=p_workspace)>=10 then raise exception 'Ten webhook endpoints are already configured.'; end if;
  if not (p_input->'events' ?| array['profile.updated','knowledge.changed','persona.answered','membership.changed']) then raise exception 'Choose webhook events.'; end if;
  insert into workspace_webhooks(workspace_id,endpoint,encrypted_secret,events) values(p_workspace,p_input->>'endpoint',p_input->>'encryptedSecret',array(select jsonb_array_elements_text(p_input->'events'))) returning id into target;
 elsif p_action='toggle' then
  update workspace_webhooks set enabled=(p_input->>'enabled')::boolean where workspace_id=p_workspace and id=(p_input->>'id')::uuid returning id into target;
 elsif p_action='retry' then
  update webhook_deliveries d set state='pending',attempts=0,next_attempt_at=now(),last_error=null where d.id=(p_input->>'id')::uuid and d.state='failed' and d.webhook_id in(select id from workspace_webhooks where workspace_id=p_workspace) returning id into target;
 else raise exception 'Choose a webhook action.'; end if;
 if target is null then raise exception 'Webhook or failed delivery is unavailable.'; end if;
 insert into workspace_audit(workspace_id,actor_id,action,detail) values(p_workspace,p_actor,'webhook.'||p_action,jsonb_build_object('id',target));
 return jsonb_build_object('id',target);
end $$;
create or replace function claim_webhook_deliveries(p_limit integer,p_workspace uuid) returns jsonb
language plpgsql set search_path=public as $$
declare ids uuid[];
begin
 update webhook_deliveries set state='failed',last_error='Delivery attempts exhausted.' where state='delivering' and leased_until<now() and attempts>=5
  and (p_workspace is null or webhook_id in(select id from workspace_webhooks where workspace_id=p_workspace));
 select array_agg(id) into ids from(
  select d.id from webhook_deliveries d join workspace_webhooks h on h.id=d.webhook_id join workspaces w on w.id=h.workspace_id
  where h.enabled and w.status='active' and (p_workspace is null or w.id=p_workspace) and d.attempts<5
    and ((d.state='pending' and d.next_attempt_at<=now()) or(d.state='delivering' and d.leased_until<now()))
  order by d.created_at limit least(greatest(p_limit,1),5) for update of d skip locked
 ) q;
 update webhook_deliveries set state='delivering',attempts=attempts+1,lease=gen_random_uuid(),leased_until=now()+interval '60 seconds' where id=any(ids);
 return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'lease',d.lease,'endpoint',h.endpoint,'encryptedSecret',h.encrypted_secret,
  'event',jsonb_build_object('id',e.id,'type',e.type,'workspaceId',e.workspace_id,'createdAt',e.created_at,'data',e.payload)))
  from webhook_deliveries d join workspace_webhooks h on h.id=d.webhook_id join webhook_events e on e.id=d.event_id where d.id=any(ids)),'[]'::jsonb);
end $$;
create or replace function finish_webhook_delivery(p_id uuid,p_lease uuid,p_status integer,p_error text) returns boolean
language plpgsql set search_path=public as $$
begin
 update webhook_deliveries set state=case when p_status between 200 and 299 then 'delivered' when attempts>=5 then 'failed' else 'pending' end,
 response_status=p_status,last_error=left(p_error,200),leased_until=null,
 next_attempt_at=now()+make_interval(secs=>least(3600,(power(2,attempts)*30)::integer))
 where id=p_id and lease=p_lease and state='delivering';
 return found;
end $$;
create or replace function run_workspace_retention() returns jsonb
language plpgsql set search_path=public as $$
declare tab text; removed integer:=0; n integer;
begin
 foreach tab in array array['chat_log','studio_chat'] loop
  if to_regclass('public.'||tab) is null then continue; end if;
  execute format('delete from %I where id in(select t.id from %I t join workspace_api_settings s on s.workspace_id=t.workspace_id where t.created_at<now()-make_interval(days=>s.retention_days) limit 1000)',tab,tab);
  get diagnostics n=row_count; removed:=removed+n;
 end loop;
 update persona_requests r set response=null,message_hash='retained_usage_only' from workspace_api_settings s
  where r.workspace_id=s.workspace_id and r.created_at<now()-make_interval(days=>s.retention_days) and r.response is not null;
 delete from persona_requests r using workspace_api_settings s where r.workspace_id=s.workspace_id and r.created_at<date_trunc('month',now()) and r.created_at<now()-make_interval(days=>s.retention_days);
 delete from persona_sessions where expires_at<now();
 delete from webhook_events e where e.created_at<now()-interval '30 days'
  and not exists(select 1 from webhook_deliveries d where d.event_id=e.id and d.state in('pending','delivering'));
 delete from workspace_audit where created_at<now()-interval '365 days';
 delete from api_security_buckets where bucket<now()-interval '30 days';
 delete from workspace_invitations where expires_at<now()-interval '30 days';
 return jsonb_build_object('removedConversations',removed,'completedAt',now());
end $$;
do $$ declare tab text; begin
 foreach tab in array array['workspace_invitations','workspace_webhooks','webhook_events','webhook_deliveries'] loop
  execute format('alter table %I enable row level security',tab);execute format('grant all on %I to service_role',tab);
 end loop;
end $$;
revoke all on function enqueue_workspace_event(uuid,text,jsonb),manage_workspace_team(uuid,uuid,text,jsonb),accept_workspace_invitation(uuid,text),switch_workspace(uuid,uuid),
 manage_workspace_webhook(uuid,uuid,text,jsonb),claim_webhook_deliveries(integer,uuid),finish_webhook_delivery(uuid,uuid,integer,text),run_workspace_retention() from public;
grant execute on function enqueue_workspace_event(uuid,text,jsonb),manage_workspace_team(uuid,uuid,text,jsonb),accept_workspace_invitation(uuid,text),switch_workspace(uuid,uuid),
 manage_workspace_webhook(uuid,uuid,text,jsonb),claim_webhook_deliveries(integer,uuid),finish_webhook_delivery(uuid,uuid,integer,text),run_workspace_retention() to service_role;
commit;

