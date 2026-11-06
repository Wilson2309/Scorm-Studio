-- Read-only. Returns catalog booleans/counts, never accounts, emails or document data.
with checks(name,pass) as (values
 ('audit_table_rls',exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='scorm_private' and c.relname='admin_audit' and c.relrowsecurity)),
 ('public_rpc_count',(select count(*)=4 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('admin_overview','admin_people','admin_activities','admin_change_role') and p.prosecdef and 'search_path=""'=any(p.proconfig))),
 ('public_rpc_permissions',(select count(*)=4 and bool_and(has_function_privilege('authenticated',p.oid,'EXECUTE') and not has_function_privilege('anon',p.oid,'EXECUTE')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('admin_overview','admin_people','admin_activities','admin_change_role'))),
 ('bootstrap_not_public',(select count(*)=1 and bool_and(not has_function_privilege('authenticated',p.oid,'EXECUTE') and not has_function_privilege('anon',p.oid,'EXECUTE')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='scorm_private' and p.proname='bootstrap_admin')),
 ('private_schema_denied',not has_schema_privilege('authenticated','scorm_private','USAGE') and not has_schema_privilege('anon','scorm_private','USAGE')),
 ('role_update_denied',not has_column_privilege('authenticated','public.profiles','role','UPDATE')),
 ('profile_self_policy_retained',exists(select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_read_self' and qual like '%auth.uid()%')),
 ('workspace_owner_policies_retained',(select count(*)=6 from pg_policies where schemaname='public' and policyname='owner_read' and tablename in ('documents','generations','quiz_revisions','quiz_drafts','generation_events','scorm_packages')))
)
select jsonb_build_object('checks',jsonb_agg(jsonb_build_object('name',name,'pass',coalesce(pass,false))),'catalogPass',bool_and(coalesce(pass,false)),'adminCount',(select count(*) from public.profiles where role='ADMIN')) as admin_catalog from checks;
