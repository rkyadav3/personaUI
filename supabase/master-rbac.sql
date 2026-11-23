-- Existing installations: run after admin-experience.sql. Safe to rerun.
begin;
drop trigger if exists profile_tags_refresh_visibility on public.profile_tags;
alter table public.profile_tags drop constraint if exists profile_tags_key_check;
alter table public.users add column if not exists profile_type text check (profile_type in ('individual','organisation'));
-- Move former parent tags to the account's onboarding type, then flatten tags.
update public.users set profile_type='organisation' where profile_type is null and 'organisation'=any(tags);
update public.users set profile_type='individual' where profile_type is null and 'individual-profile'=any(tags);
update public.users set tags=array_remove(array_remove(tags,'organisation'),'individual-profile') where tags && array['organisation','individual-profile'];
alter table public.profile_tags drop column if exists parent_key;
alter table public.profile_tags drop column if exists category;
delete from public.profile_tags where key in ('organisation','individual-profile');
alter table public.profile_tags add constraint profile_tags_key_check check (
  key in ('hero','special','private','university','hospital','contributors','standard','founders','god','fraud','scammer','narration-setter','gov-departments','commercial-enterprises','community','manufacturer')
  or key ~ '^custom-[a-z0-9]+(-[a-z0-9]+)*$'
);
-- Existing published or draft profiles keep working; new accounts choose a type.
do $$ begin
  if to_regclass('public.profiles') is not null then
    update public.users u set profile_type='individual' where profile_type is null and exists(select 1 from public.profiles p where p.owner_id=u.id);
  end if;
end $$;
alter table public.profile_tags add column if not exists permissions text[] not null default array['profile','content','knowledge','commerce','enquiries','community'];
alter table public.profile_tags drop constraint if exists profile_tags_permissions_check;
alter table public.profile_tags add constraint profile_tags_permissions_check check (
  permissions <@ array['profile','content','knowledge','commerce','enquiries','community']::text[]
  and array_position(permissions,null) is null
);
-- Preserve custom tag keys, assignments, permissions and privacy when a label
-- overlaps a newly seeded tag. Its display name gets a bounded suffix.
do $$
declare tag record; candidate text; suffix text; attempt integer;
begin
  for tag in select key,label from public.profile_tags where key like 'custom-%' and lower(label) in
    ('university','hospital','contributors','standard','founders','god','fraud','scammer','narration setter','gov-departments','commercial/enterprises','community','manufacturer')
  loop
    attempt := 1;
    loop
      suffix := case when attempt=1 then ' (custom)' else ' (custom ' || attempt || ')' end;
      candidate := left(tag.label,40-length(suffix)) || suffix;
      exit when not exists(select 1 from public.profile_tags where lower(label)=lower(candidate));
      attempt := attempt+1;
    end loop;
    update public.profile_tags set label=candidate where key=tag.key;
  end loop;
end $$;
insert into public.profile_tags(key,label,visibility) values
  ('university','University','public'), ('hospital','Hospital','public'),
  ('contributors','Contributors','public'), ('standard','Standard','public'),
  ('founders','Founders','public'), ('god','God','public'), ('fraud','Fraud','public'),
  ('scammer','Scammer','public'), ('narration-setter','Narration Setter','public'),
  ('gov-departments','Gov-Departments','public'),
  ('commercial-enterprises','Commercial/Enterprises','public'),
  ('community','Community','public'), ('manufacturer','Manufacturer','public')
on conflict (key) do nothing;

create or replace function public.refresh_tag_visibility() returns trigger language plpgsql set search_path = public as $$
begin
  if new.key<>old.key then raise exception 'Tag keys cannot be changed'; end if;
  if old.key not like 'custom-%' and new.label<>old.label then raise exception 'Protected tag names cannot be changed'; end if;
  if new.visibility is distinct from old.visibility then update users set tags=tags where new.key=any(tags); end if;
  return new;
end $$;
create trigger profile_tags_refresh_visibility after update on public.profile_tags for each row execute function public.refresh_tag_visibility();

create or replace function public.choose_profile_type(p_user uuid,p_type text) returns jsonb language plpgsql set search_path=public as $$
declare account public.users;
begin
  if p_type is null or p_type not in ('individual','organisation') then raise exception 'Choose Individual or Organisation'; end if;
  select * into account from public.users where id=p_user for update;
  if not found then raise exception 'Account not found'; end if;
  if account.profile_type is not null and account.profile_type<>p_type then raise exception 'Your profile type has already been chosen'; end if;
  update public.users set profile_type=p_type where id=p_user;
  return jsonb_build_object('profile_type',p_type);
end $$;
revoke all on function public.choose_profile_type(uuid,text) from public,anon,authenticated;
grant execute on function public.choose_profile_type(uuid,text) to service_role;
-- Refresh the existing login RPC as part of this upgrade so a saved profile
-- type is returned immediately on sign-in, including unfinished onboarding.
create or replace function public.finalize_login(p_user uuid,p_email text,p_password_hash text,p_matched boolean)
returns jsonb language plpgsql set search_path=public as $$
declare account public.users; observed timestamptz; failures int;
begin
  select * into account from public.users where id=p_user for update;
  if not found then return jsonb_build_object('status','invalid'); end if;
  observed := clock_timestamp();
  if account.email is distinct from p_email or account.password_hash is distinct from p_password_hash then return jsonb_build_object('status','invalid'); end if;
  if account.locked_until>observed then return jsonb_build_object('status','locked','locked_until',account.locked_until); end if;
  if p_matched is true then
    update public.users set failed_attempts=0,locked_until=null where id=p_user;
    return jsonb_build_object('status','authenticated','user',jsonb_build_object(
      'id',account.id,'email',account.email,'name',account.name,'slug',account.slug,'tags',account.tags,
      'session_version',coalesce((to_jsonb(account)->>'session_version')::bigint,0),'slug_changed_at',to_jsonb(account)->'slug_changed_at',
      'profile_type',account.profile_type));
  end if;
  failures := coalesce(account.failed_attempts,0)+1;
  update public.users set failed_attempts=case when failures>=5 then 0 else failures end,
    locked_until=case when failures>=5 then observed+interval '10 minutes' else null end where id=p_user;
  return jsonb_build_object('status','invalid');
end $$;
revoke all on function public.finalize_login(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.finalize_login(uuid,text,text,boolean) to service_role;
revoke all on public.profile_tags from anon,authenticated;
grant all on public.profile_tags to service_role;
commit;
