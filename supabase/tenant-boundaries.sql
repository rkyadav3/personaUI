-- Apply after hosted-assets.sql. Transaction aborts if legacy foreign-owner references exist.
-- Service role bypasses RLS, so enforce ownership and relationship boundaries in the database too.
begin;
drop function if exists public.set_embeddings(jsonb);
create or replace function public.set_embeddings(items jsonb, p_owner uuid)
returns void language sql set search_path=public,extensions as $$
  update public.chunks c set embedding=(i->>'embedding')::extensions.vector(768)
  from jsonb_array_elements(items) i where c.id=(i->>'id')::bigint and c.owner_id=p_owner
$$;
revoke all on function public.set_embeddings(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.set_embeddings(jsonb,uuid) to service_role;
create or replace function public.check_tenant_reference() returns trigger
language plpgsql set search_path=public as $$
declare values_json jsonb; field_name text; target_table text; target_id text; valid_reference boolean; pair text;
begin
  values_json:=to_jsonb(new);
  if new.owner_id is null or (tg_op='UPDATE' and new.owner_id is distinct from old.owner_id) then
    raise exception 'Account ownership cannot be changed.';
  end if;
  foreach pair in array coalesce(tg_argv, array[]::text[]) loop
    field_name:=split_part(pair,':',1); target_table:=split_part(pair,':',2); target_id:=values_json->>field_name;
    if target_id is not null then
      execute format('select exists(select 1 from public.%I where id::text=$1 and owner_id=$2)',target_table)
        into valid_reference using target_id,new.owner_id;
      if not valid_reference then raise exception 'Referenced record is not available in this account.'; end if;
    end if;
  end loop;
  if tg_table_name='chunks' then
    target_table:=case new.source_type when 'file' then 'files' when 'post' then 'posts' else null end;
    if target_table is null then raise exception 'Unknown knowledge source.'; end if;
    execute format('select exists(select 1 from public.%I where id=$1 and owner_id=$2)',target_table)
      into valid_reference using new.source_id,new.owner_id;
    if not valid_reference then raise exception 'Knowledge source is not available in this account.'; end if;
  end if;
  if tg_table_name='purchases' then
    if new.delivery_kind='file' and new.delivery_asset_id is not null and new.status in ('paid','free') and (tg_op='INSERT' or old.status not in ('paid','free')) then
      new.fulfillment_status:='fulfilled';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.check_tenant_reference() from public,anon,authenticated;
grant execute on function public.check_tenant_reference() to service_role;
do $$ declare table_name text; references_sql text; begin
  foreach table_name in array array['files','folders','topics','posts','templates','chunks','chat_log','profiles','contributions','offerings','profile_submissions','site_settings','updates','enquiries','event_responses','purchases','payment_accounts','public_actions','studio_reviews','studio_chat','admin_presence','assets'] loop
    references_sql:=case table_name
      when 'files' then '''folder_id:folders'',''topic_id:topics'''
      when 'folders' then '''parent_id:folders'''
      when 'posts' then '''topic_id:topics'',''template_id:templates'''
      when 'offerings' then '''contribution_id:contributions'',''delivery_asset_id:assets'''
      when 'event_responses' then '''event_id:updates'''
      when 'purchases' then '''delivery_asset_id:assets'''
      else '' end;
    execute format('drop trigger if exists tenant_reference_boundary on public.%I',table_name);
    execute format('create trigger tenant_reference_boundary before insert or update on public.%I for each row execute function public.check_tenant_reference(%s)',table_name,references_sql);
  end loop;
end $$;
-- Validate existing relationships without modifying customer content.
do $$ declare pair text; child_table text; field_name text; parent_table text; invalid boolean; begin
  foreach pair in array array['files:folder_id:folders','files:topic_id:topics','folders:parent_id:folders','posts:topic_id:topics','posts:template_id:templates','offerings:contribution_id:contributions','event_responses:event_id:updates'] loop
    child_table:=split_part(pair,':',1); field_name:=split_part(pair,':',2); parent_table:=split_part(pair,':',3);
    execute format('select exists(select 1 from public.%I c join public.%I p on p.id=c.%I where c.owner_id is distinct from p.owner_id)',child_table,parent_table,field_name) into invalid;
    if invalid then raise exception 'Legacy account references require repair before deploying tenant boundaries.'; end if;
  end loop;
end $$;
commit;
