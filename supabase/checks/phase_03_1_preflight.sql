-- Read-only. Run with CLI 3.0.0: db query --remote=<ref> --read-only --file <this file>.
-- No user rows, emails, tokens or connection strings are returned.
select jsonb_build_object(
  'server_version', current_setting('server_version'),
  'profiles_exists', to_regclass('public.profiles') is not null,
  'history_exists', to_regclass('supabase_migrations.schema_migrations') is not null,
  'profile_trigger_exists', exists (
    select 1 from pg_trigger where tgrelid = 'auth.users'::regclass
      and tgname = 'scorm_auth_user_created' and not tgisinternal
  ),
  'profile_functions_present', (
    select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('scorm_new_profile', 'scorm_profile_updated')
  )
) as preflight;
