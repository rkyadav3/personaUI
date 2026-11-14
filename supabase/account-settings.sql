-- Apply after multitenant.sql and security-hardening.sql, before deploying account changes.
begin;
alter table public.users add column if not exists session_version bigint not null default 0;
alter table public.users add column if not exists slug_changed_at timestamptz;

create or replace function public.guard_account_changes() returns trigger language plpgsql set search_path = public as $$
declare observed timestamptz := clock_timestamp();
begin
  if new.slug is distinct from old.slug then
    if old.slug_changed_at is not null and observed < old.slug_changed_at+interval '14 days' then
      raise exception 'User ID can be changed again on %.',old.slug_changed_at+interval '14 days';
    end if;
    new.slug_changed_at := observed;
  else new.slug_changed_at := old.slug_changed_at;
  end if;
  new.session_version := old.session_version + case when new.password_hash is distinct from old.password_hash then 1 else 0 end;
  return new;
end $$;
drop trigger if exists guard_account_changes on public.users;
create trigger guard_account_changes before update on public.users for each row execute function public.guard_account_changes();

create or replace function public.change_own_account(p_user uuid,p_expected_hash text,p_password_hash text,p_slug text)
returns jsonb language plpgsql set search_path = public as $$
declare account public.users;
begin
  select * into account from public.users where id=p_user for update;
  if not found or account.password_hash is distinct from p_expected_hash or account.locked_until>clock_timestamp() then
    raise exception 'Your account changed or was suspended. Sign in again before changing it.';
  end if;
  if (p_password_hash is null) = (p_slug is null) then raise exception 'Choose one account change.'; end if;
  if p_slug is not null and (length(p_slug)<3 or length(p_slug)>40 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$') then raise exception 'Choose a valid user ID.'; end if;
  if p_password_hash is not null and p_password_hash !~ '^\$2[aby]\$12\$[./A-Za-z0-9]{53}$' then raise exception 'Invalid password hash.'; end if;
  update public.users set password_hash=coalesce(p_password_hash,password_hash),slug=coalesce(p_slug,slug) where id=p_user returning * into account;
  return to_jsonb(account)-'password_hash';
end $$;
revoke all on function public.change_own_account(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.change_own_account(uuid,text,text,text) to service_role;

-- Upgrade existing sign-in installations so newly issued cookies carry the current session version.
create or replace function public.finalize_login(p_user uuid,p_email text,p_password_hash text,p_matched boolean)
returns jsonb language plpgsql set search_path = public as $$
declare current_user_row public.users; observed timestamptz; failures int;
begin
  select * into current_user_row from public.users where id=p_user for update;
  if not found then return jsonb_build_object('status','invalid'); end if;
  observed := clock_timestamp();
  if current_user_row.email is distinct from p_email or current_user_row.password_hash is distinct from p_password_hash then
    return jsonb_build_object('status','invalid');
  end if;
  if current_user_row.locked_until>observed then return jsonb_build_object('status','locked','locked_until',current_user_row.locked_until); end if;
  if p_matched is true then
    update public.users set failed_attempts=0,locked_until=null where id=p_user;
    return jsonb_build_object('status','authenticated','user',jsonb_build_object(
      'id',current_user_row.id,'email',current_user_row.email,'name',current_user_row.name,'slug',current_user_row.slug,'tags',current_user_row.tags,
      'session_version',current_user_row.session_version,'slug_changed_at',current_user_row.slug_changed_at
    ));
  end if;
  failures := coalesce(current_user_row.failed_attempts,0)+1;
  update public.users set failed_attempts=case when failures>=5 then 0 else failures end,
    locked_until=case when failures>=5 then observed+interval '10 minutes' else null end where id=p_user;
  return jsonb_build_object('status','invalid');
end $$;
revoke all on function public.finalize_login(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.finalize_login(uuid,text,text,boolean) to service_role;
commit;
