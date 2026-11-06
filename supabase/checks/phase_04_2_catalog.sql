-- Read-only deployment verification; no document or account content.
select jsonb_build_object(
 'timeline_check', exists(select 1 from pg_constraint where conrelid='public.generations'::regclass and conname='generations_activity_type_check' and pg_get_constraintdef(oid) like '%TIMELINE%'),
 'timeline_revision_branch', position('TIMELINE' in p.prosrc)>0 and position('owned_generation' in p.prosrc)>0,
 'security_definer',p.prosecdef,
 'search_path',p.proconfig,
 'authenticated_cannot_execute_helper',not has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'anon_cannot_execute_helper',not has_function_privilege('anon',p.oid,'EXECUTE'),
 'public_cannot_execute_helper',not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'),
 'workspace_rls_enabled',(select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('profiles','documents','generations','quiz_drafts','quiz_revisions','scorm_packages','generation_events')),
 'two_private_buckets',(select count(*)=2 and bool_and(not public) from storage.buckets where id in ('scorm-pdfs','scorm-packages'))
) as timeline_catalog
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='scorm_private' and p.proname='write_revision';
