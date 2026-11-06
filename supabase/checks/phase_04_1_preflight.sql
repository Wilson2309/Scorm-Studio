-- Read-only metadata, never document content or credentials.
select jsonb_build_object(
 'counts',jsonb_build_object('documents',(select count(*) from public.documents),'generations',(select count(*) from public.generations),'revisions',(select count(*) from public.quiz_revisions),'packages',(select count(*) from public.scorm_packages)),
 'types',(select jsonb_agg(t) from (select activity_type,count(*) from public.generations group by activity_type)t),
 'constraints',(select jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid))) from pg_constraint where conrelid='public.generations'::regclass and conname='generations_activity_type_check'),
 'function', (select jsonb_build_object('securityDefiner',p.prosecdef,'configuration',p.proconfig,'definition',pg_get_functiondef(p.oid),'anonymousExecute',has_function_privilege('anon',p.oid,'execute'),'authenticatedExecute',has_function_privilege('authenticated',p.oid,'execute')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='scorm_private' and p.proname='write_revision'),
 'ownership',(select pg_get_functiondef('scorm_private.owned_generation(uuid)'::regprocedure)),
 'rls',(select jsonb_agg(jsonb_build_object('table',relname,'enabled',relrowsecurity)) from pg_class where relnamespace='public'::regnamespace and relname in ('profiles','documents','generations','quiz_revisions','quiz_drafts','scorm_packages','generation_events')),
 'policyDigest',(select md5(coalesce(string_agg(row(schemaname,tablename,policyname,roles,cmd,qual,with_check)::text,'|' order by schemaname,tablename,policyname),'')) from pg_policies where schemaname in ('public','storage')),
 'buckets',(select jsonb_agg(jsonb_build_object('id',id,'public',public)) from storage.buckets where id in ('scorm-pdfs','scorm-packages')),
 'migrations',(select jsonb_agg(jsonb_build_object('version',version,'name',name) order by version) from supabase_migrations.schema_migrations)
) as preflight;
