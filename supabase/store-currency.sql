-- Apply after portfolio.sql and profile setup. Updates only the selected owner's catalogue.
begin;
create or replace function public.save_store_currency(p_owner uuid, p_currency text, p_expected_version timestamptz)
returns void language plpgsql set search_path = public as $$
declare current_site public.site_settings; products jsonb;
begin
  if p_currency not in ('INR','USD','EUR','GBP','AUD','CAD','SGD','AED') or p_currency is null then raise exception 'Choose a supported Store currency.'; end if;
  -- Match the inventory lock order for offerings, then portfolio products.
  perform 1 from public.offerings where owner_id=p_owner order by id for update;
  select * into current_site from public.site_settings where owner_id=p_owner for update;
  if not found then
    if p_expected_version is not null then raise exception 'Your settings changed. Reload before applying Store currency.'; end if;
    insert into public.site_settings(owner_id,page,portfolio,updated_at) values(p_owner,'{}'::jsonb,'{}'::jsonb,clock_timestamp())
      on conflict(owner_id) do nothing returning * into current_site;
    if not found then raise exception 'Your settings changed. Reload before applying Store currency.'; end if;
  elsif current_site.updated_at is distinct from p_expected_version then raise exception 'Your settings changed. Reload before applying Store currency.';
  end if;
  select coalesce(jsonb_agg(jsonb_set(item,'{currency}',to_jsonb(p_currency)) order by ord),'[]'::jsonb)
    into products from jsonb_array_elements(coalesce(current_site.portfolio->'products','[]'::jsonb)) with ordinality as entries(item,ord);
  update public.offerings set currency=p_currency,updated_at=clock_timestamp() where owner_id=p_owner;
  update public.site_settings set page=jsonb_set(coalesce(page,'{}'::jsonb),'{currency}',to_jsonb(p_currency)),
    portfolio=jsonb_set(coalesce(portfolio,'{}'::jsonb),'{products}',products),updated_at=clock_timestamp() where owner_id=p_owner;
end $$;
revoke all on function public.save_store_currency(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.save_store_currency(uuid,text,timestamptz) to service_role;
commit;
