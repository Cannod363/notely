-- Deleting a user in Authentication → Users failed with "Database error
-- deleting user" because rhythms.user_id has a foreign key to auth.users
-- with no ON DELETE behavior — Postgres blocks the delete rather than leave
-- orphaned rows. Adding CASCADE means removing a user also removes their
-- rhythms, so account cleanup from the dashboard works going forward.

do $$
declare
  fk_name text;
begin
  select conname into fk_name
  from pg_constraint
  where conrelid = 'public.rhythms'::regclass
    and confrelid = 'auth.users'::regclass
    and contype = 'f'
  limit 1;

  if fk_name is null then
    raise exception 'No foreign key found from public.rhythms to auth.users — check the column name manually.';
  end if;

  execute format('alter table public.rhythms drop constraint %I', fk_name);
  execute format(
    'alter table public.rhythms add constraint %I foreign key (user_id) references auth.users(id) on delete cascade',
    fk_name
  );
end $$;
