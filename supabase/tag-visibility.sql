-- Apply after jobs-profiles.sql and staff-permissions.sql. Safe to rerun.
begin;
create or replace function public.refresh_tag_visibility() returns trigger language plpgsql set search_path=public as $$
begin
  if new.key<>old.key then raise exception 'Tag keys cannot be changed'; end if;
  if old.key not like 'custom-%' and new.label<>old.label then raise exception 'Protected tag names cannot be changed'; end if;
  if new.visibility is distinct from old.visibility then
    update users set tags=tags where new.key=any(tags);
  end if;
  return new;
end $$;
commit;
