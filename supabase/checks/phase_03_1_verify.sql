-- Catalog verification only: NOT a substitute for two real-user API tests.
-- All booleans must be true. Inspect the two policy expressions and trigger definition too.
with target as (select to_regclass('public.profiles') as oid),
checks(name, pass) as (
  select 'profiles_exists', oid is not null from target
  union all select 'rls_enabled', coalesce((select relrowsecurity from pg_class where oid = target.oid), false) from target
  union all select 'id_fk_auth_users_cascade', exists (
    select 1 from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attname = 'id'
      join pg_attribute u on u.attrelid = c.confrelid and u.attname = 'id'
    where c.conrelid = target.oid and c.contype = 'f' and c.confrelid = 'auth.users'::regclass
      and c.conkey = array[a.attnum] and c.confkey = array[u.attnum] and c.confdeltype = 'c'
  ) from target
  union all select 'anon_no_table_access', oid is not null and not has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    and not has_any_column_privilege('anon', oid, 'SELECT,INSERT,UPDATE,REFERENCES') from target
  union all select 'authenticated_select_allowed', coalesce(has_table_privilege('authenticated', oid, 'SELECT'), false) from target
  union all select 'authenticated_no_table_writes', oid is not null and not has_table_privilege('authenticated', oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') from target
  union all select 'full_name_update_allowed', coalesce(has_column_privilege('authenticated', oid, 'full_name', 'UPDATE'), false) from target
  union all select 'protected_column_updates_denied', oid is not null and not exists (
    select 1 from pg_attribute a where a.attrelid = target.oid and a.attnum > 0 and not a.attisdropped
      and a.attname <> 'full_name' and has_column_privilege('authenticated', target.oid, a.attname, 'UPDATE')
  ) from target
  union all select 'only_two_expected_policies', (
    select count(*) = 2 and count(*) filter (where policyname = 'profiles_read_self' and cmd = 'SELECT' and roles = array['authenticated']::name[]) = 1
      and count(*) filter (where policyname = 'profiles_update_self' and cmd = 'UPDATE' and roles = array['authenticated']::name[] and with_check is not null) = 1
    from pg_policies where schemaname = 'public' and tablename = 'profiles'
  )
  union all select 'new_user_trigger_enabled', exists (
    select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'scorm_auth_user_created'
      and tgenabled = 'O' and not tgisinternal and tgfoid = to_regprocedure('public.scorm_new_profile()')
      and (tgtype::integer & 1) = 1 and (tgtype::integer & 4) = 4 and (tgtype::integer & 2) = 0
  )
  union all select 'new_profile_function_private_definer', exists (
    select 1 from pg_proc where oid = to_regprocedure('public.scorm_new_profile()') and prosecdef
      and proconfig @> array['search_path=""']
      and not has_function_privilege('anon', oid, 'EXECUTE') and not has_function_privilege('authenticated', oid, 'EXECUTE')
  )
  union all select 'timestamp_function_private', exists (
    select 1 from pg_proc where oid = to_regprocedure('public.scorm_profile_updated()')
      and not has_function_privilege('anon', oid, 'EXECUTE') and not has_function_privilege('authenticated', oid, 'EXECUTE')
  )
)
select jsonb_build_object(
  'catalog_checks', (select jsonb_agg(jsonb_build_object('check', name, 'pass', coalesce(pass, false))) from checks),
  'catalog_pass', (select bool_and(coalesce(pass, false)) from checks),
  'policies_to_review', (select jsonb_agg(jsonb_build_object('name', policyname, 'using', qual, 'with_check', with_check))
    from pg_policies where schemaname = 'public' and tablename = 'profiles'),
  'columns_to_review', (select jsonb_agg(jsonb_build_object('name', column_name, 'type', data_type, 'nullable', is_nullable, 'default', column_default) order by ordinal_position)
    from information_schema.columns where table_schema = 'public' and table_name = 'profiles'),
  'constraints_to_review', (select jsonb_agg(pg_get_constraintdef(c.oid)) from pg_constraint c where c.conrelid = to_regclass('public.profiles')),
  'new_user_trigger', (select pg_get_triggerdef(oid) from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'scorm_auth_user_created'),
  'timestamp_trigger', (select pg_get_triggerdef(oid) from pg_trigger where tgrelid = to_regclass('public.profiles') and tgname = 'scorm_profile_timestamp'),
  'new_user_function_to_review', (select pg_get_functiondef(to_regprocedure('public.scorm_new_profile()'))),
  'timestamp_function_to_review', (select pg_get_functiondef(to_regprocedure('public.scorm_profile_updated()'))),
  'live_rls_status', 'NOT_VERIFIED_BY_CATALOG_CHECKS'
) as verification;
