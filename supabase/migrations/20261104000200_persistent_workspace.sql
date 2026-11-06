-- 03.2. Pending explicit approval. Never edit the deployed profiles migration.
begin;
do $$ begin
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'workspace\_%' escape '\')
 then raise exception 'workspace_function_names_already_used'; end if;
end $$;
create schema scorm_private;
revoke all on schema scorm_private from public, anon, authenticated;

create table public.documents (
 id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 filename text not null check (char_length(filename) between 1 and 255),
 file_size integer not null check (file_size between 1 and 20971520),
 file_sha256 text not null check (file_sha256 ~ '^[a-f0-9]{64}$'),
 storage_path text not null unique, page_count integer check (page_count between 1 and 100),
 status text not null default 'UPLOADED' check (status in ('UPLOADED','PREPARED','FAILED')),
 prepared_json jsonb, deleting_at timestamptz, error_code text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,user_id),
 check (storage_path = user_id::text || '/' || id::text || '/original.pdf'),
 check (status <> 'PREPARED' or (page_count is not null and prepared_json is not null)),
 check (prepared_json is null or (jsonb_typeof(prepared_json) = 'object' and octet_length(prepared_json::text) <= 4000000))
);
create table public.generations (
 id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 document_id uuid not null, title text not null check (char_length(title) between 3 and 100),
 activity_type text not null default 'QUIZ' check (activity_type = 'QUIZ'),
 generation_mode text not null default 'hybrid' check (generation_mode in ('hybrid','manual')),
 status text not null default 'PREPARED' check (status in ('UPLOADED','PREPARED','GENERATING','NEEDS_REVIEW','READY','SCORM_GENERATED','FAILED')),
 question_count integer not null default 0 check (question_count between 0 and 20),
 current_revision integer not null default 0 check (current_revision >= 0), quality_summary jsonb check (quality_summary is null or (jsonb_typeof(quality_summary)='object' and octet_length(quality_summary::text)<=400000)),
 active_operation uuid, current_package_id uuid, deleting_at timestamptz, error_code text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,user_id), foreign key(document_id,user_id) references public.documents(id,user_id)
);
create table public.quiz_revisions (
 generation_id uuid not null, user_id uuid not null, revision integer not null check (revision > 0),
 draft_json jsonb not null check (jsonb_typeof(draft_json) = 'object' and octet_length(draft_json::text) <= 1500000),
 origin text not null check (origin in ('ai','manual')), created_at timestamptz not null default now(),
 primary key(generation_id,revision), unique(generation_id,revision,user_id),
 foreign key(generation_id,user_id) references public.generations(id,user_id) on delete cascade
);
-- Current pointer only: a snapshot is stored once, in quiz_revisions.
create table public.quiz_drafts (
 generation_id uuid primary key, user_id uuid not null, revision integer not null,
 updated_at timestamptz not null default now(),
 foreign key(generation_id,revision,user_id) references public.quiz_revisions(generation_id,revision,user_id)
   on delete cascade deferrable initially deferred
);
create table public.generation_events (
 id uuid primary key, generation_id uuid not null, user_id uuid not null,
 event_type text not null check (event_type in ('GENERATE','REGENERATE','PACKAGE')),
 request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
 status text not null default 'RUNNING' check (status in ('RUNNING','COMPLETED','FAILED')),
 base_revision integer not null, result_revision integer, error_code text,
 created_at timestamptz not null default now(), finished_at timestamptz,
 foreign key(generation_id,user_id) references public.generations(id,user_id) on delete cascade,
 unique(id,user_id)
);
create table public.scorm_packages (
 id uuid primary key, generation_id uuid not null, user_id uuid not null, revision integer not null,
 operation_id uuid not null unique references public.generation_events(id), storage_path text not null unique,
 status text not null default 'UPLOADING' check (status in ('UPLOADING','READY','OBSOLETE','FAILED')),
 file_size integer check (file_size between 1 and 10485760), file_sha256 text check (file_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 foreign key(generation_id,revision,user_id) references public.quiz_revisions(generation_id,revision,user_id) on delete cascade,
 check (storage_path = user_id::text || '/' || generation_id::text || '/r' || revision::text || '/' || id::text || '/package.zip'),
 check (status <> 'READY' or (file_size is not null and file_sha256 is not null))
);
create index documents_owner_date on public.documents(user_id,created_at desc,id desc);
create index generations_owner_date on public.generations(user_id,created_at desc,id desc);
create index generations_document on public.generations(document_id,user_id);
create index generations_owner_status on public.generations(user_id,status);
create index revisions_owner on public.quiz_revisions(user_id,generation_id,revision desc);
create index drafts_owner on public.quiz_drafts(user_id,generation_id);
create index packages_owner on public.scorm_packages(user_id,generation_id,revision);
create index events_owner on public.generation_events(user_id,generation_id,created_at desc);

-- All reads use RLS; mutations use narrowly scoped, owner-checking transactional RPCs.
do $$ declare t text; begin
 foreach t in array array['documents','generations','quiz_revisions','quiz_drafts','generation_events','scorm_packages'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public, anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy owner_read on public.%I for select to authenticated using (user_id = (select auth.uid()))',t);
 end loop;
end $$;

create function scorm_private.owned_generation(p_id uuid) returns public.generations
language plpgsql security definer set search_path = '' as $$
declare g public.generations;
begin
 select * into g from public.generations where id=p_id and user_id=auth.uid() for update;
 if not found or g.deleting_at is not null then raise exception using errcode='42501',message='workspace_not_found'; end if;
 return g;
end $$;
create function scorm_private.write_revision(p_id uuid,p_draft jsonb,p_quality jsonb,p_ready boolean,p_origin text) returns integer
language plpgsql security definer set search_path = '' as $$
declare g public.generations; n integer; count_questions integer;
begin
 g := scorm_private.owned_generation(p_id);
 if jsonb_typeof(p_draft) <> 'object' or p_draft->>'version' <> '1' or jsonb_typeof(p_draft->'quiz'->'questions') <> 'array'
    or p_origin not in ('ai','manual') then raise exception using errcode='22023',message='invalid_draft'; end if;
 count_questions := jsonb_array_length(p_draft->'quiz'->'questions');
 if count_questions > 20 then raise exception using errcode='22023',message='invalid_draft'; end if;
 n := g.current_revision + 1;
 insert into public.quiz_revisions(generation_id,user_id,revision,draft_json,origin) values(p_id,auth.uid(),n,p_draft,p_origin);
 insert into public.quiz_drafts(generation_id,user_id,revision) values(p_id,auth.uid(),n)
   on conflict(generation_id) do update set revision=excluded.revision,updated_at=now();
 update public.scorm_packages set status='OBSOLETE' where generation_id=p_id and user_id=auth.uid() and status='READY';
 update public.generations set current_revision=n,current_package_id=null,quality_summary=p_quality,
  question_count=count_questions,title=left(p_draft->'quiz'->>'title',100),generation_mode=case when p_origin='manual' then 'manual' else 'hybrid' end,
  status=case when p_ready then 'READY' else 'NEEDS_REVIEW' end,error_code=null,updated_at=now() where id=p_id;
 return n;
end $$;

create function public.workspace_create_document(p_id uuid,p_filename text,p_size integer,p_sha text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.documents;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='workspace_auth_required'; end if;
 insert into public.documents(id,user_id,filename,file_size,file_sha256,storage_path)
  values(p_id,auth.uid(),p_filename,p_size,p_sha,auth.uid()::text||'/'||p_id::text||'/original.pdf') on conflict(id) do nothing;
 select * into d from public.documents where id=p_id and user_id=auth.uid() for update;
 if not found or d.deleting_at is not null then raise exception using errcode='42501',message='workspace_not_found'; end if;
 if d.file_sha256<>p_sha or d.file_size<>p_size then raise exception using errcode='40001',message='workspace_conflict'; end if;
 return to_jsonb(d);
end $$;
create function public.workspace_prepare_document(p_id uuid,p_pages integer,p_prepared jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.documents;
begin
 select * into d from public.documents where id=p_id and user_id=auth.uid() for update;
 if not found or d.deleting_at is not null then raise exception using errcode='42501',message='workspace_not_found'; end if;
 if d.status='PREPARED' then return to_jsonb(d); end if;
 if jsonb_typeof(p_prepared) <> 'object' then raise exception using errcode='22023',message='invalid_preparation'; end if;
 update public.documents set page_count=p_pages,prepared_json=p_prepared,status='PREPARED',error_code=null,updated_at=now() where id=p_id returning * into d;
 return to_jsonb(d);
end $$;
create function public.workspace_create_generation(p_id uuid,p_document uuid,p_title text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.generations;
begin
 perform 1 from public.documents where id=p_document and user_id=auth.uid() and status='PREPARED' and deleting_at is null for update;
 if not found then raise exception using errcode='42501',message='workspace_not_found'; end if;
 insert into public.generations(id,user_id,document_id,title) values(p_id,auth.uid(),p_document,p_title) on conflict(id) do nothing;
 g := scorm_private.owned_generation(p_id);
 if g.document_id<>p_document then raise exception using errcode='40001',message='workspace_conflict'; end if;
 return to_jsonb(g);
end $$;
create function public.workspace_save_draft(p_id uuid,p_expected integer,p_draft jsonb,p_quality jsonb,p_ready boolean,p_origin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.generations; n integer;
begin
 g := scorm_private.owned_generation(p_id);
 if g.active_operation is not null then raise exception using errcode='55P03',message='workspace_busy'; end if;
 -- An interrupted successful save can be acknowledged without creating another revision.
 if g.current_revision=p_expected+1 and exists(select 1 from public.quiz_revisions where generation_id=p_id and revision=g.current_revision and draft_json=p_draft)
 then return jsonb_build_object('revision',g.current_revision); end if;
 if g.current_revision is distinct from p_expected then raise exception using errcode='40001',message='workspace_conflict'; end if;
 if exists(select 1 from public.quiz_revisions where generation_id=p_id and revision=g.current_revision and draft_json=p_draft)
 then return jsonb_build_object('revision',g.current_revision); end if;
 n := scorm_private.write_revision(p_id,p_draft,p_quality,p_ready,p_origin);
 return jsonb_build_object('revision',n);
end $$;
create function public.workspace_claim_operation(p_id uuid,p_operation uuid,p_kind text,p_hash text,p_expected integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.generations; e public.generation_events;
begin
 g := scorm_private.owned_generation(p_id);
 select * into e from public.generation_events where id=p_operation;
 if found then
  if e.generation_id is distinct from p_id or e.user_id is distinct from auth.uid() or e.event_type is distinct from p_kind or e.request_hash is distinct from p_hash
   then raise exception using errcode='40001',message='workspace_conflict'; end if;
  return to_jsonb(e)||jsonb_build_object('claimed',false);
 end if;
 if p_kind not in ('GENERATE','REGENERATE','PACKAGE') or (p_kind in ('REGENERATE','PACKAGE') and g.current_revision=0)
 then raise exception using errcode='22023',message='invalid_operation'; end if;
 if g.active_operation is not null then raise exception using errcode='55P03',message='workspace_busy'; end if;
 if g.current_revision is distinct from p_expected then raise exception using errcode='40001',message='workspace_conflict'; end if;
 insert into public.generation_events(id,generation_id,user_id,event_type,request_hash,base_revision)
  values(p_operation,p_id,auth.uid(),p_kind,p_hash,p_expected) returning * into e;
 update public.generations set active_operation=p_operation,status=case when p_kind='PACKAGE' then status else 'GENERATING' end,updated_at=now() where id=p_id;
 return to_jsonb(e)||jsonb_build_object('claimed',true);
end $$;
create function public.workspace_finish_generation(p_id uuid,p_operation uuid,p_draft jsonb,p_quality jsonb,p_ready boolean,p_origin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.generations; e public.generation_events; n integer;
begin
 g := scorm_private.owned_generation(p_id);
 select * into e from public.generation_events where id=p_operation and generation_id=p_id and user_id=auth.uid() for update;
 if not found then raise exception using errcode='42501',message='workspace_not_found'; end if;
 if e.status='COMPLETED' then
  if e.result_revision<>g.current_revision then raise exception using errcode='40001',message='workspace_conflict'; end if;
  return jsonb_build_object('revision',e.result_revision);
 end if;
 if e.status<>'RUNNING' or e.event_type not in ('GENERATE','REGENERATE') or g.active_operation is distinct from p_operation or g.current_revision<>e.base_revision
 then raise exception using errcode='40001',message='workspace_conflict'; end if;
 n := scorm_private.write_revision(p_id,p_draft,p_quality,p_ready,p_origin);
 update public.generation_events set status='COMPLETED',result_revision=n,finished_at=now() where id=p_operation;
 update public.generations set active_operation=null where id=p_id;
 return jsonb_build_object('revision',n);
end $$;
create function public.workspace_fail_operation(p_id uuid,p_operation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.generations;
begin
 g := scorm_private.owned_generation(p_id);
 if g.active_operation is distinct from p_operation then return; end if;
 update public.generation_events set status='FAILED',error_code='operation_failed',finished_at=now()
  where id=p_operation and generation_id=p_id and user_id=auth.uid() and status='RUNNING';
 update public.scorm_packages set status='FAILED' where operation_id=p_operation and status='UPLOADING';
 update public.generations set active_operation=null,status='FAILED',error_code='operation_failed',updated_at=now() where id=p_id;
end $$;
create function public.workspace_release_operation(p_id uuid,p_operation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.generations;
begin
 g := scorm_private.owned_generation(p_id);
 if not exists(select 1 from public.generation_events where id=p_operation and generation_id=p_id and user_id=auth.uid() and status='RUNNING' and created_at < now()-interval '15 minutes')
 then raise exception using errcode='55P03',message='workspace_busy'; end if;
 perform public.workspace_fail_operation(p_id,p_operation);
end $$;
create function public.workspace_reserve_package(p_id uuid,p_operation uuid,p_package uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.generations; p public.scorm_packages;
begin
 g := scorm_private.owned_generation(p_id);
 if g.active_operation is distinct from p_operation or not exists(select 1 from public.generation_events where id=p_operation and generation_id=p_id and user_id=auth.uid() and event_type='PACKAGE' and status='RUNNING' and base_revision=g.current_revision)
 then raise exception using errcode='40001',message='workspace_conflict'; end if;
 insert into public.scorm_packages(id,generation_id,user_id,revision,operation_id,storage_path)
  values(p_package,p_id,auth.uid(),g.current_revision,p_operation,auth.uid()::text||'/'||p_id::text||'/r'||g.current_revision::text||'/'||p_package::text||'/package.zip')
  on conflict(operation_id) do nothing;
 select * into p from public.scorm_packages where operation_id=p_operation and user_id=auth.uid();
 return to_jsonb(p);
end $$;
create function public.workspace_finish_package(p_id uuid,p_operation uuid,p_package uuid,p_size integer,p_sha text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.generations; p public.scorm_packages;
begin
 g := scorm_private.owned_generation(p_id);
 select * into p from public.scorm_packages where id=p_package and generation_id=p_id and user_id=auth.uid() for update;
 if not found then raise exception using errcode='42501',message='workspace_not_found'; end if;
 if p.status='READY' and g.current_package_id=p.id and g.current_revision=p.revision then return to_jsonb(p); end if;
 if g.active_operation is distinct from p_operation or p.operation_id<>p_operation or p.revision<>g.current_revision or p.status<>'UPLOADING'
 then raise exception using errcode='40001',message='workspace_conflict'; end if;
 update public.scorm_packages set status='READY',file_size=p_size,file_sha256=p_sha where id=p.id returning * into p;
 update public.generation_events set status='COMPLETED',result_revision=g.current_revision,finished_at=now() where id=p_operation and user_id=auth.uid();
 update public.generations set active_operation=null,current_package_id=p.id,status='SCORM_GENERATED',error_code=null,updated_at=now() where id=p_id;
 return to_jsonb(p);
end $$;
create function public.workspace_begin_delete(p_id uuid,p_document boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.generations; d public.documents; objects jsonb;
begin
 if p_document then
  select * into d from public.documents where id=p_id and user_id=auth.uid() for update;
  if not found then raise exception using errcode='42501',message='workspace_not_found'; end if;
  if exists(select 1 from public.generations where document_id=p_id) then raise exception using errcode='55P03',message='document_in_use'; end if;
  update public.documents set deleting_at=coalesce(deleting_at,now()) where id=p_id;
  return jsonb_build_object('pdf',d.storage_path,'packages','[]'::jsonb);
 end if;
 select * into g from public.generations where id=p_id and user_id=auth.uid() for update;
 if not found then raise exception using errcode='42501',message='workspace_not_found'; end if;
 if g.active_operation is not null then raise exception using errcode='55P03',message='workspace_busy'; end if;
 update public.generations set deleting_at=coalesce(deleting_at,now()),current_package_id=null where id=p_id;
 select coalesce(jsonb_agg(storage_path),'[]'::jsonb) into objects from public.scorm_packages where generation_id=p_id and user_id=auth.uid();
 return jsonb_build_object('packages',objects,'documentId',g.document_id);
end $$;
create function public.workspace_finish_delete(p_id uuid,p_document boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if p_document then
  if exists(select 1 from public.documents d join storage.objects o on o.bucket_id='scorm-pdfs' and o.name=d.storage_path where d.id=p_id and d.user_id=auth.uid())
  then raise exception using errcode='55P03',message='files_remaining'; end if;
  delete from public.documents where id=p_id and user_id=auth.uid() and deleting_at is not null;
 else
  if exists(select 1 from public.scorm_packages p join storage.objects o on o.bucket_id='scorm-packages' and o.name=p.storage_path where p.generation_id=p_id and p.user_id=auth.uid())
  then raise exception using errcode='55P03',message='files_remaining'; end if;
  delete from public.generations where id=p_id and user_id=auth.uid() and deleting_at is not null;
 end if;
end $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='scorm_private' or (n.nspname='public' and p.proname like 'workspace\_%' escape '\') loop
  execute format('revoke all on function %s from public, anon, authenticated',f.signature);
  if f.nspname='public' then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end $$;
commit;
