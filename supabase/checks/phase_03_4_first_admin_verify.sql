-- Read-only evidence for the explicitly authorized first administrator.
select jsonb_build_object(
 'targetIsAdmin',exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id='22924639-38df-4f2a-9f92-82a63389fe0d'::uuid and p.role='ADMIN' and u.email_confirmed_at is not null and u.deleted_at is null and not coalesce(u.is_anonymous,false)),
 'exactlyOneAdmin',(select count(*)=1 from public.profiles where role='ADMIN'),
 'secondAccountRemainsTeacher',(select count(*)=1 and bool_and(role='TEACHER') from public.profiles where id<>'22924639-38df-4f2a-9f92-82a63389fe0d'::uuid),
 'exactlyOneAudit',(select count(*)=1 from scorm_private.admin_audit),
 'authorizedAudit',exists(select 1 from scorm_private.admin_audit where id='05439e0c-91c2-473b-a7cd-00a509ebf782'::uuid and request_id='ce6139be-7625-443e-9fd5-6740cad49c28'::uuid and target_id='22924639-38df-4f2a-9f92-82a63389fe0d'::uuid and old_role='TEACHER' and new_role='ADMIN' and source='OPERATOR' and actor_id is null),
 'ownershipPoliciesUnchanged',(select md5(coalesce(string_agg(schemaname||':'||tablename||':'||policyname||':'||coalesce(qual,'')||':'||coalesce(with_check,''),',' order by schemaname,tablename,policyname),''))='e728cd0443c3a5b6ffd4496bc8bd2095' from pg_policies where schemaname in ('public','storage')),
 'helpersStillPrivate',not has_schema_privilege('authenticated','scorm_private','USAGE') and not has_schema_privilege('anon','scorm_private','USAGE') and not has_function_privilege('authenticated','scorm_private.bootstrap_admin(uuid,uuid,text)','EXECUTE') and not has_function_privilege('anon','scorm_private.bootstrap_admin(uuid,uuid,text)','EXECUTE'),
 'migrationCountUnchanged',(select count(*)=5 from supabase_migrations.schema_migrations)
) as first_admin_verification;
