-- 03.4: additive, pending explicit remote deployment approval. No role is changed here.
begin;
create table scorm_private.admin_audit (
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
 actor_id uuid, target_id uuid not null, old_role text not null check(old_role in ('TEACHER','ADMIN')),
 new_role text not null check(new_role in ('TEACHER','ADMIN')), reason text not null check(char_length(reason) between 10 and 300),
 source text not null check(source in ('APP','OPERATOR')), operator_role text not null,
 created_at timestamptz not null default now()
);
alter table scorm_private.admin_audit enable row level security;
revoke all on scorm_private.admin_audit from public,anon,authenticated;
create index admin_audit_date on scorm_private.admin_audit(created_at desc,id desc);
create index generations_admin_updated on public.generations(updated_at desc,id desc);
create index generations_admin_created on public.generations(created_at desc,id desc);
create index events_admin_period on public.generation_events(created_at,event_type,status);

create function scorm_private.require_admin() returns void language plpgsql stable set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=auth.uid() and p.role='ADMIN' and u.email_confirmed_at is not null and u.deleted_at is null and not coalesce(u.is_anonymous,false))
 then raise exception using errcode='42501',message='admin_required'; end if;
end $$;
revoke all on function scorm_private.require_admin() from public,anon,authenticated;

create function public.admin_overview(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; since timestamptz;
begin
 perform scorm_private.require_admin();
 if p_days is null or p_days not between 1 and 90 then raise exception using errcode='22023',message='invalid_period'; end if;
 since:=now()-pg_catalog.make_interval(days=>p_days);
 select jsonb_build_object(
  'asOf',now(),'days',p_days,'since',since,
  'accounts',(select count(*) from public.profiles),
  'teachers',(select count(*) from public.profiles where role='TEACHER'),
  'admins',(select count(*) from public.profiles where role='ADMIN'),
  'activities',(select count(*) from public.generations where deleting_at is null),
  'quizzes',(select count(*) from public.generations where deleting_at is null and current_revision>0),
  'pendingDrafts',(select count(*) from public.generations where deleting_at is null and current_revision>0 and current_package_id is null),
  'failedActivities',(select count(*) from public.generations where deleting_at is null and status='FAILED'),
  'preparing',(select count(*) from public.generations where deleting_at is null and status in ('UPLOADED','PREPARED','GENERATING')),
  'currentPackages',(select count(*) from public.generations g join public.scorm_packages p on p.id=g.current_package_id and p.revision=g.current_revision and p.status='READY' where g.deleting_at is null),
  'period',jsonb_build_object(
   'createdActivities',(select count(*) from public.generations where created_at>=since),
   'completedGenerations',(select count(*) from public.generation_events where event_type='GENERATE' and status='COMPLETED' and created_at>=since),
   'packagedSCORM',(select count(*) from public.generation_events where event_type='PACKAGE' and status='COMPLETED' and created_at>=since),
   'failedOperations',(select count(*) from public.generation_events where status='FAILED' and created_at>=since)),
  'storage',(select jsonb_build_object('objects',count(*),'measuredObjects',count(*) filter(where metadata->>'size' ~ '^[0-9]{1,16}$'),
   'bytes',coalesce(sum(case when metadata->>'size' ~ '^[0-9]{1,16}$' then (metadata->>'size')::bigint else 0 end),0),
   'complete',count(*)=count(*) filter(where metadata->>'size' ~ '^[0-9]{1,16}$')) from storage.objects where bucket_id in ('scorm-pdfs','scorm-packages')),
  'recent',coalesce((select jsonb_agg(x) from (select g.id,g.title,p.full_name as "ownerName",g.status,g.deleting_at is not null as deleting,g.updated_at as "updatedAt",g.question_count as questions from public.generations g join public.profiles p on p.id=g.user_id order by g.updated_at desc,g.id desc limit 5)x),'[]'::jsonb),
  'audit',coalesce((select jsonb_agg(x) from (select a.id,a.actor_id as "actorId",a.target_id as "targetId",a.old_role as "oldRole",a.new_role as "newRole",a.reason,a.source,a.created_at as "createdAt" from scorm_private.admin_audit a order by a.created_at desc,a.id desc limit 5)x),'[]'::jsonb)
 ) into result;
 return result;
end $$;
revoke all on function public.admin_overview(integer) from public,anon,authenticated;
grant execute on function public.admin_overview(integer) to authenticated;

create function public.admin_people(p_query text default '',p_role text default 'ALL',p_order text default 'newest',p_page integer default 1,p_size integer default 10,p_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare pattern text; total bigint; items jsonb; actual_page integer;
begin
 perform scorm_private.require_admin();
 if p_role is null or p_order is null or p_page is null or p_size is null or p_query is null or char_length(p_query)>100 or p_role not in ('ALL','TEACHER','ADMIN') or p_order not in ('newest','oldest','name') or p_page not between 1 and 10000 or p_size not between 1 and 25
 then raise exception using errcode='22023',message='invalid_admin_filters'; end if;
 pattern:='%'||replace(replace(replace(trim(p_query),'\','\\'),'%','\%'),'_','\_')||'%';
 select count(*) into total from public.profiles p join auth.users u on u.id=p.id
 where (p_id is null or p.id=p_id) and (p_role='ALL' or p.role=p_role) and (p.full_name ilike pattern or coalesce(u.email,'') ilike pattern);
 actual_page:=case when (p_page::bigint-1)*p_size>=total then 1 else p_page end;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into items from (
  select p.id,p.full_name as name,u.email,p.role,u.created_at as "createdAt",u.last_sign_in_at as "lastSignIn",u.email_confirmed_at is not null as confirmed,
   (select count(*) from public.generations g where g.user_id=p.id and g.deleting_at is null) as activities,
   (select count(*) from public.generations g where g.user_id=p.id and g.current_revision>0 and g.deleting_at is null) as quizzes
  from public.profiles p join auth.users u on u.id=p.id
  where (p_id is null or p.id=p_id) and (p_role='ALL' or p.role=p_role) and (p.full_name ilike pattern or coalesce(u.email,'') ilike pattern)
  order by case when p_order='newest' then u.created_at end desc,case when p_order='oldest' then u.created_at end asc,case when p_order='name' then lower(p.full_name) end asc,p.id asc
  limit p_size offset (actual_page::bigint-1)*p_size
 )x;
 return jsonb_build_object('items',items,'total',total,'page',actual_page,'pageSize',p_size,'adminCount',(select count(*) from public.profiles p join auth.users u on u.id=p.id where p.role='ADMIN' and u.email_confirmed_at is not null and u.deleted_at is null and not coalesce(u.is_anonymous,false)));
end $$;
revoke all on function public.admin_people(text,text,text,integer,integer,uuid) from public,anon,authenticated;
grant execute on function public.admin_people(text,text,text,integer,integer,uuid) to authenticated;

create function public.admin_activities(p_query text default '',p_status text default 'ALL',p_owner uuid default null,p_order text default 'updated',p_page integer default 1,p_size integer default 10) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare pattern text; total bigint; items jsonb; actual_page integer;
begin
 perform scorm_private.require_admin();
 if p_status is null or p_order is null or p_page is null or p_size is null or p_query is null or char_length(p_query)>100 or p_status not in ('ALL','UPLOADED','PREPARED','GENERATING','NEEDS_REVIEW','READY','SCORM_GENERATED','FAILED') or p_order not in ('updated','newest','oldest') or p_page not between 1 and 10000 or p_size not between 1 and 25
 then raise exception using errcode='22023',message='invalid_admin_filters'; end if;
 pattern:='%'||replace(replace(replace(trim(p_query),'\','\\'),'%','\%'),'_','\_')||'%';
 select count(*) into total from public.generations g where (p_owner is null or g.user_id=p_owner) and (p_status='ALL' or g.status=p_status) and g.title ilike pattern;
 actual_page:=case when (p_page::bigint-1)*p_size>=total then 1 else p_page end;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into items from (
  select g.id,g.user_id as "ownerId",p.full_name as "ownerName",g.title,g.activity_type as type,g.status,g.question_count as questions,g.current_revision as revision,
   g.created_at as "createdAt",g.updated_at as "updatedAt",g.deleting_at is not null as deleting,
   case when s.id is not null and s.status='READY' and s.revision=g.current_revision then 'CURRENT' when g.active_operation is not null then 'PROCESSING' else 'NONE' end as "packageState",
   case when g.error_code in ('generation_failed','storage_unavailable','revision_conflict','operation_busy','package_invalid','package_obsolete') then g.error_code when g.error_code is not null then 'operation_failed' else null end as "issueCode"
  from public.generations g join public.profiles p on p.id=g.user_id left join public.scorm_packages s on s.id=g.current_package_id
  where (p_owner is null or g.user_id=p_owner) and (p_status='ALL' or g.status=p_status) and g.title ilike pattern
  order by case when p_order='updated' then g.updated_at end desc,case when p_order='newest' then g.created_at end desc,case when p_order='oldest' then g.created_at end asc,g.id asc
  limit p_size offset (actual_page::bigint-1)*p_size
 )x;
 return jsonb_build_object('items',items,'total',total,'page',actual_page,'pageSize',p_size);
end $$;
revoke all on function public.admin_activities(text,text,uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.admin_activities(text,text,uuid,text,integer,integer) to authenticated;

create function public.admin_change_role(p_target uuid,p_role text,p_expected_role text,p_request uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous text; audit scorm_private.admin_audit;
begin
 perform scorm_private.require_admin();
 if p_role is null or p_expected_role is null or p_target is null or p_request is null or p_role not in ('TEACHER','ADMIN') or p_expected_role not in ('TEACHER','ADMIN') or p_reason is null or char_length(trim(p_reason)) not between 10 and 300
 then raise exception using errcode='22023',message='invalid_role_change'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('scorm-studio/admin-roles',0));
 perform scorm_private.require_admin();
 select * into audit from scorm_private.admin_audit where request_id=p_request;
 if found then
  if audit.actor_id is distinct from auth.uid() or audit.target_id<>p_target or audit.new_role<>p_role or audit.old_role<>p_expected_role or audit.reason<>trim(p_reason)
  then raise exception using errcode='PT409',message='admin_request_conflict'; end if;
  return jsonb_build_object('id',audit.id,'changed',audit.old_role<>audit.new_role,'replayed',true);
 end if;
 select p.role into previous from public.profiles p join auth.users u on u.id=p.id where p.id=p_target and u.email_confirmed_at is not null and u.deleted_at is null and not coalesce(u.is_anonymous,false) for update of p;
 if not found then raise exception using errcode='P0002',message='admin_target_unavailable'; end if;
 if previous<>p_expected_role then raise exception using errcode='PT409',message='admin_role_conflict'; end if;
 if previous='ADMIN' and p_role='TEACHER' and (select count(*) from public.profiles p join auth.users u on u.id=p.id where p.role='ADMIN' and u.email_confirmed_at is not null and u.deleted_at is null and not coalesce(u.is_anonymous,false))<=1
 then raise exception using errcode='PT409',message='last_admin_required'; end if;
 update public.profiles set role=p_role where id=p_target;
 insert into scorm_private.admin_audit(request_id,actor_id,target_id,old_role,new_role,reason,source,operator_role)
 values(p_request,auth.uid(),p_target,previous,p_role,trim(p_reason),'APP',session_user) returning * into audit;
 return jsonb_build_object('id',audit.id,'changed',previous<>p_role,'replayed',false);
end $$;
revoke all on function public.admin_change_role(uuid,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_change_role(uuid,text,text,uuid,text) to authenticated;

-- Operator-only bootstrap. Not exposed in public; no application/user EXECUTE grant.
create function scorm_private.bootstrap_admin(p_target uuid,p_request uuid,p_reason text) returns jsonb
language plpgsql set search_path='' as $$
declare previous text; audit scorm_private.admin_audit;
begin
 if p_target is null or p_request is null or p_reason is null or char_length(trim(p_reason)) not between 10 and 300 then raise exception using errcode='22023',message='invalid_bootstrap'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('scorm-studio/admin-roles',0));
 select * into audit from scorm_private.admin_audit where request_id=p_request;
 if found then
  if audit.source<>'OPERATOR' or audit.target_id<>p_target or audit.reason<>trim(p_reason) then raise exception using errcode='PT409',message='bootstrap_request_conflict'; end if;
  return jsonb_build_object('id',audit.id,'changed',audit.old_role<>audit.new_role,'replayed',true);
 end if;
 select p.role into previous from public.profiles p join auth.users u on u.id=p.id where p.id=p_target and u.email_confirmed_at is not null and u.deleted_at is null and not coalesce(u.is_anonymous,false) for update of p;
 if not found then raise exception using errcode='P0002',message='bootstrap_target_unavailable'; end if;
 if previous<>'ADMIN' and exists(select 1 from public.profiles where role='ADMIN') then raise exception using errcode='PT409',message='bootstrap_already_initialized'; end if;
 update public.profiles set role='ADMIN' where id=p_target;
 insert into scorm_private.admin_audit(request_id,actor_id,target_id,old_role,new_role,reason,source,operator_role)
 values(p_request,null,p_target,previous,'ADMIN',trim(p_reason),'OPERATOR',session_user) returning * into audit;
 return jsonb_build_object('id',audit.id,'changed',previous<>'ADMIN','replayed',false);
end $$;
revoke all on function scorm_private.bootstrap_admin(uuid,uuid,text) from public,anon,authenticated;
commit;
