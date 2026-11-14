-- Repairs the no-argument trigger upload error after tenant-boundaries.sql.
-- Replaces only the function; existing triggers and account checks remain in place.
begin;
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
commit;
