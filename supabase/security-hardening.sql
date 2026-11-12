-- Apply after platform-governance.sql, home.sql and studio-assistant.sql, before deploying the matching server.
begin;
create or replace function public.finalize_login(p_user uuid, p_email text, p_password_hash text, p_matched boolean)
returns jsonb language plpgsql set search_path = public as $$
declare current_user_row public.users; observed timestamptz; failures int;
begin
  select * into current_user_row from public.users where id = p_user for update;
  if not found then return jsonb_build_object('status','invalid'); end if;
  observed := clock_timestamp();
  -- A reset/email change/deletion invalidates the earlier bcrypt comparison.
  if current_user_row.email is distinct from p_email or current_user_row.password_hash is distinct from p_password_hash then
    return jsonb_build_object('status','invalid');
  end if;
  if current_user_row.locked_until > observed then
    return jsonb_build_object('status','locked','locked_until',current_user_row.locked_until);
  end if;
  if p_matched is true then
    update public.users set failed_attempts=0,locked_until=null where id=p_user;
    return jsonb_build_object('status','authenticated','user',jsonb_build_object(
      'id',current_user_row.id,'email',current_user_row.email,'name',current_user_row.name,'slug',current_user_row.slug,'tags',current_user_row.tags
    ));
  end if;
  failures := coalesce(current_user_row.failed_attempts,0)+1;
  update public.users set failed_attempts=case when failures>=5 then 0 else failures end,
    locked_until=case when failures>=5 then observed+interval '10 minutes' else null end where id=p_user;
  return jsonb_build_object('status','invalid');
end $$;
revoke all on function public.finalize_login(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.finalize_login(uuid,text,text,boolean) to service_role;

-- Serialize votes on one offering before reading its aggregated vote totals.
create or replace function public.rate_offering(p_id bigint, p_voter text, p_stars int) returns void
language plpgsql set search_path = public as $$
begin
  perform 1 from public.offerings where id=p_id and active for update;
  if not found then return; end if;
  insert into public.offering_ratings(offering_id,voter,stars) values(p_id,p_voter,p_stars)
    on conflict(offering_id,voter) do update set stars=excluded.stars,created_at=now();
  update public.offerings o set rating_sum=s.sum,rating_count=s.n
    from (select coalesce(sum(stars),0)::int as sum,count(*)::int as n from public.offering_ratings where offering_id=p_id) s
    where o.id=p_id;
end $$;
revoke all on function public.rate_offering(bigint,text,int) from public,anon,authenticated;
grant execute on function public.rate_offering(bigint,text,int) to service_role;
commit;
