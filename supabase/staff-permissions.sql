-- Apply after jobs-profiles.sql. Preserves existing staff grants and defaults.
begin;
alter table users drop constraint if exists users_platform_permissions_check;
alter table users add constraint users_platform_permissions_check check(
  platform_permissions <@ array['profiles.create','profiles.edit','master.manage']::text[]
  and array_position(platform_permissions,null) is null
);
alter table profile_tags drop constraint if exists profile_tags_platform_permissions_check;
alter table profile_tags add constraint profile_tags_platform_permissions_check check(
  platform_permissions <@ array['profiles.create','profiles.edit','master.manage']::text[]
  and array_position(platform_permissions,null) is null
);

-- Check current grants and protected tags in the same transaction as the edit.
create or replace function update_staff_profile(p_actor uuid,p_target uuid,p_expected_email text,p_updates jsonb)
returns boolean language plpgsql security invoker set search_path=public as $$
declare actor users; target users; requested_tags text[];
begin
  if jsonb_typeof(p_updates)<>'object' or exists(select 1 from jsonb_object_keys(p_updates) k where k not in('name','email','slug','tags')) then raise exception 'Only ordinary profile fields can be edited'; end if;
  lock table profile_tags in share mode;
  select * into actor from users where id=p_actor and approval_status='approved' for share;
  if actor.id is null or not ('profiles.edit'=any(actor.platform_permissions) or exists(select 1 from profile_tags t where t.key=any(actor.tags) and 'profiles.edit'=any(t.platform_permissions))) then raise exception 'Profile editing access required'; end if;
  select * into target from users where id=p_target and email=p_expected_email for update;
  if target.id is null then raise exception 'Profile changed; reload before editing'; end if;
  if cardinality(target.platform_permissions)>0 or exists(select 1 from profile_tags t where t.key=any(target.tags) and cardinality(t.platform_permissions)>0) then raise exception 'Only Superadmin can edit platform staff'; end if;
  if p_updates ? 'tags' then
    if jsonb_typeof(p_updates->'tags')<>'array' then raise exception 'Choose valid tags'; end if;
    select coalesce(array_agg(tag),'{}') into requested_tags from jsonb_array_elements_text(p_updates->'tags') tag;
    if exists(select 1 from unnest(requested_tags) k left join profile_tags t on t.key=k where t.key is null or cardinality(t.platform_permissions)>0) then raise exception 'Only Superadmin can assign platform access tags'; end if;
  end if;
  if p_updates ? 'email' and coalesce(p_updates->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid email'; end if;
  if p_updates ? 'slug' and coalesce(p_updates->>'slug','') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Invalid profile ID'; end if;
  update users set
    name=case when p_updates ? 'name' then nullif(trim(p_updates->>'name'),'') else name end,
    email=case when p_updates ? 'email' then p_updates->>'email' else email end,
    slug=case when p_updates ? 'slug' then p_updates->>'slug' else slug end,
    tags=coalesce(requested_tags,tags)
  where id=target.id;
  return true;
end $$;
revoke all on function update_staff_profile(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function update_staff_profile(uuid,uuid,text,jsonb) to service_role;
commit;
