-- Read-only deployment checkpoint: catalog only, no PDF/account content.
select jsonb_build_object(
 'server_version',current_setting('server_version'),
 'profiles_exists',to_regclass('public.profiles') is not null,
 'scorm_private_exists',exists(select 1 from pg_namespace where nspname='scorm_private'),
 'target_tables',(select jsonb_agg(jsonb_build_object('name',name,'exists',to_regclass('public.'||name) is not null))
   from unnest(array['documents','generations','quiz_drafts','quiz_revisions','scorm_packages','generation_events']) as name),
 'existing_target_buckets',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'public',public)),'[]'::jsonb) from storage.buckets where id in ('scorm-pdfs','scorm-packages')),
 'existing_workspace_functions',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'workspace\_%' escape '\'),
 'existing_storage_policies',(select coalesce(jsonb_agg(jsonb_build_object('name',policyname,'command',cmd,'roles',roles,'using',qual,'with_check',with_check)),'[]'::jsonb)
   from pg_policies where schemaname='storage' and tablename='objects')
) as preflight;
