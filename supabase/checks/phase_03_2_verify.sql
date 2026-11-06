-- Read-only catalog evidence, not a replacement for A/B Auth/PostgREST/Storage tests.
with targets(name) as (
 values ('documents'),('generations'),('quiz_revisions'),('quiz_drafts'),('generation_events'),('scorm_packages')
), tables as (
 select name,to_regclass('public.'||name) as oid from targets
), functions as (
 select p.*,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='scorm_private' or (n.nspname='public' and p.proname like 'workspace\_%' escape '\')
), checks(name,pass) as (
 select 'six_tables_exist',count(oid)=6 from tables
 union all select 'six_tables_rls',count(*)=6 and bool_and(coalesce(c.relrowsecurity,false)) from tables t left join pg_class c on c.oid=t.oid
 union all select 'authenticated_read_only_grants',count(oid)=6 and bool_and(
  has_table_privilege('authenticated',oid,'SELECT') and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_any_column_privilege('authenticated',oid,'INSERT,UPDATE,REFERENCES')) from tables
 union all select 'anonymous_no_table_grants',count(oid)=6 and bool_and(
  not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_any_column_privilege('anon',oid,'SELECT,INSERT,UPDATE,REFERENCES')) from tables
 union all select 'six_owner_read_policies',count(*)=6 and bool_and(cmd='SELECT' and policyname='owner_read' and roles=array['authenticated']::name[] and qual like '%auth.uid()%')
  from pg_policies where schemaname='public' and tablename in (select name from targets)
 union all select 'twelve_rpc_owner_definers',count(*)=12 and bool_and(prosecdef and proconfig @> array['search_path=""']
  and has_function_privilege('authenticated',oid,'EXECUTE') and not has_function_privilege('anon',oid,'EXECUTE')) from functions where nspname='public'
 union all select 'two_private_helpers',count(*)=2 and bool_and(prosecdef and proconfig @> array['search_path=""']
  and not has_function_privilege('authenticated',oid,'EXECUTE') and not has_function_privilege('anon',oid,'EXECUTE')) from functions where nspname='scorm_private'
 union all select 'private_schema_not_exposed',exists(select 1 from pg_namespace where nspname='scorm_private')
  and not has_schema_privilege('authenticated','scorm_private','USAGE') and not has_schema_privilege('anon','scorm_private','USAGE')
 union all select 'two_private_buckets',count(*)=2 and bool_and(not public and
  case id when 'scorm-pdfs' then file_size_limit=20971520 and allowed_mime_types=array['application/pdf']
   when 'scorm-packages' then file_size_limit=10485760 and allowed_mime_types=array['application/zip'] else false end)
  from storage.buckets where id in ('scorm-pdfs','scorm-packages')
 union all select 'storage_objects_rls',relrowsecurity from pg_class where oid='storage.objects'::regclass
 union all select 'six_storage_owner_policies',count(*)=6 and bool_and(roles=array['authenticated']::name[])
  and count(*) filter(where cmd='SELECT')=2 and count(*) filter(where cmd='INSERT')=2 and count(*) filter(where cmd='DELETE')=2
  from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'workspace\_%' escape '\'
)
select jsonb_build_object(
 'catalog_pass',(select bool_and(coalesce(pass,false)) from checks),
 'checks',(select jsonb_agg(jsonb_build_object('check',name,'pass',coalesce(pass,false))) from checks),
 'policies_to_review',(select jsonb_agg(jsonb_build_object('table',schemaname||'.'||tablename,'name',policyname,'command',cmd,'using',qual,'with_check',with_check))
  from pg_policies where (schemaname='public' and tablename in (select name from targets))
   or (schemaname='storage' and tablename='objects')),
 'constraints_to_review',(select jsonb_agg(jsonb_build_object('table',t.name,'definition',pg_get_constraintdef(c.oid))) from tables t join pg_constraint c on c.conrelid=t.oid),
 'rpc_to_review',(select jsonb_agg(jsonb_build_object('schema',nspname,'name',proname,'security_definer',prosecdef,'settings',proconfig)) from functions)
) as workspace_catalog;
