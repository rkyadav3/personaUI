-- Run after hosted-assets.sql and tenant-boundaries.sql. Safe to re-run.
-- NULL quantity is unlimited. Limited items reserve one unit per checkout.
begin;
alter table public.offerings add column if not exists quantity integer check (quantity between 0 and 1000000000);
alter table public.purchases add column if not exists inventory_reserved boolean not null default false;

create or replace function public.change_item_inventory(p_owner uuid,p_kind text,p_item text,p_change integer)
returns boolean language plpgsql security invoker set search_path=public as $$
declare stock integer; document jsonb; position integer; stock_text text;
begin
  if p_owner is null or p_change not in (-1,1) or p_change is null then raise exception 'Invalid inventory operation.'; end if;
  if p_kind='offering' then
    select quantity into stock from public.offerings where owner_id=p_owner and id::text=p_item for update;
    if not found then
      if p_change=1 then return false; end if;
      raise exception 'Item is not available in this account.';
    end if;
    if stock is null then return false; end if;
    if stock+p_change<0 then raise exception 'This item is sold out.'; end if;
    update public.offerings set quantity=least(1000000000,stock+p_change),updated_at=clock_timestamp() where owner_id=p_owner and id::text=p_item;
  elsif p_kind='product' then
    select portfolio into document from public.site_settings where owner_id=p_owner for update;
    select (ordinality-1)::integer,value->>'quantity' into position,stock_text
      from jsonb_array_elements(coalesce(document->'products','[]'::jsonb)) with ordinality where value->>'id'=p_item;
    if not found then
      if p_change=1 then return false; end if;
      raise exception 'Item is not available in this account.';
    end if;
    if stock_text is null then return false; end if;
    if stock_text !~ '^\d+$' then raise exception 'Item quantity is invalid.'; end if;
    stock:=stock_text::integer;
    if stock>1000000000 or stock+p_change<0 then raise exception 'This item is sold out.'; end if;
    update public.site_settings set portfolio=jsonb_set(document,array['products',position::text,'quantity'],to_jsonb(least(1000000000,stock+p_change))),updated_at=clock_timestamp() where owner_id=p_owner;
  else raise exception 'Unknown item type.';
  end if;
  return true;
end $$;

create or replace function public.reserve_purchase_inventory() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
  if new.owner_id is null or (tg_op='UPDATE' and new.owner_id is distinct from old.owner_id) then raise exception 'Account ownership cannot be changed.'; end if;
  if tg_op='INSERT' then
    new.inventory_reserved:=false;
    perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text||':checkout:'||new.request_id::text,0));
    if exists(select 1 from public.purchases where owner_id=new.owner_id and request_id=new.request_id) then return new; end if;
    if new.status in ('pending','free','paid') then
      new.inventory_reserved:=public.change_item_inventory(new.owner_id,new.item_kind,new.item_id,-1);
    end if;
  else
    if (new.item_kind,new.item_id) is distinct from (old.item_kind,old.item_id) then raise exception 'A purchase item cannot be changed.'; end if;
    new.inventory_reserved:=old.inventory_reserved;
    if old.inventory_reserved and old.status='pending' and new.status='failed' and old.razorpay_order_id is null and new.razorpay_order_id is null then
      perform public.change_item_inventory(old.owner_id,old.item_kind,old.item_id,1);
      new.inventory_reserved:=false;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists purchase_inventory_boundary on public.purchases;
create trigger purchase_inventory_boundary before insert or update on public.purchases for each row execute function public.reserve_purchase_inventory();
revoke all on function public.change_item_inventory(uuid,text,text,integer),public.reserve_purchase_inventory() from public,anon,authenticated;
grant execute on function public.change_item_inventory(uuid,text,text,integer),public.reserve_purchase_inventory() to service_role;
commit;
