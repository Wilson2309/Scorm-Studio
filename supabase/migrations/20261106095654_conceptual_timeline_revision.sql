-- Pending explicit remote authorization. Only accept the existing conceptual draft mode.
-- Ownership, SECURITY DEFINER/search_path, ACL, revision and ZIP invalidation remain unchanged.
begin;
create or replace function scorm_private.write_revision(p_id uuid,p_draft jsonb,p_quality jsonb,p_ready boolean,p_origin text) returns integer
language plpgsql security definer set search_path='' as $$
declare g public.generations; n integer; count_questions integer; kind text;
begin
 g:=scorm_private.owned_generation(p_id);
 if jsonb_typeof(p_draft) is distinct from 'object' or p_origin is null or p_origin not in ('ai','manual') then raise exception using errcode='22023',message='invalid_draft'; end if;
 if p_draft->>'version'='1' and jsonb_typeof(p_draft->'quiz'->'questions')='array' then kind:='QUIZ';
 elsif p_draft->>'version'='2' and jsonb_typeof(p_draft->'quiz'->'questions')='array' and p_draft->'activity'->>'type'='ROULETTE' and p_draft->'activity'->>'schemaVersion'='1' and p_draft->'activity'->>'id'=p_id::text and jsonb_typeof(p_draft->'activity'->'segments')='array' then kind:='ROULETTE';
 elsif p_draft->>'version'='3' and p_draft->'activity'->>'type'='TIMELINE' and p_draft->'activity'->>'schemaVersion'='1' and p_draft->'activity'->>'id'=p_id::text and jsonb_typeof(p_draft->'activity'->'events')='array' and p_draft->'activity'->>'mode' in ('CHRONOLOGICAL_TIMELINE','PROCESS_TIMELINE','CONCEPTUAL_TIMELINE') then kind:='TIMELINE';
 elsif p_draft->>'version'='4' and p_draft->'activity'->>'type'='SIMULATION' and p_draft->'activity'->>'schemaVersion'='1' and p_draft->'activity'->>'id'=p_id::text and jsonb_typeof(p_draft->'activity'->'scenes')='array' then kind:='SIMULATION';
 else raise exception using errcode='22023',message='invalid_draft'; end if;
 if g.current_revision>0 and g.activity_type<>kind then raise exception using errcode='22023',message='invalid_activity_type'; end if;
 if kind='ROULETTE' and g.current_revision=0 and not exists(select 1 from public.generations s join public.quiz_revisions r on r.generation_id=s.id and r.user_id=s.user_id where s.id::text=p_draft->'activity'->>'sourceGenerationId' and s.user_id=auth.uid() and s.document_id=g.document_id and r.revision::text=p_draft->'activity'->>'sourceRevision') then raise exception using errcode='42501',message='workspace_not_found'; end if;
 if kind='ROULETTE' and g.current_revision>0 and exists(select 1 from public.quiz_revisions r where r.generation_id=p_id and r.revision=g.current_revision and ((r.draft_json->'activity'->>'sourceGenerationId') is distinct from (p_draft->'activity'->>'sourceGenerationId') or (r.draft_json->'activity'->>'sourceRevision') is distinct from (p_draft->'activity'->>'sourceRevision'))) then raise exception using errcode='22023',message='invalid_activity_source'; end if;
 if kind='SIMULATION' then count_questions:=jsonb_array_length(p_draft->'activity'->'scenes');
 elsif kind='TIMELINE' then count_questions:=jsonb_array_length(p_draft->'activity'->'events');
 else count_questions:=jsonb_array_length(p_draft->'quiz'->'questions'); end if;
 if kind='ROULETTE' then count_questions:=jsonb_array_length(p_draft->'activity'->'segments'); if count_questions<3 then raise exception using errcode='22023',message='invalid_draft'; end if; end if;
 if count_questions>20 then raise exception using errcode='22023',message='invalid_draft'; end if;
 n:=g.current_revision+1;
 insert into public.quiz_revisions(generation_id,user_id,revision,draft_json,origin) values(p_id,auth.uid(),n,p_draft,p_origin);
 insert into public.quiz_drafts(generation_id,user_id,revision) values(p_id,auth.uid(),n) on conflict(generation_id) do update set revision=excluded.revision,updated_at=now();
 update public.scorm_packages set status='OBSOLETE' where generation_id=p_id and user_id=auth.uid() and status='READY';
 update public.generations set current_revision=n,current_package_id=null,activity_type=kind,quality_summary=p_quality,
 question_count=count_questions,title=left(case when kind in ('TIMELINE','SIMULATION') then case when char_length(btrim(p_draft->'activity'->>'title'))>=3 then p_draft->'activity'->>'title' else case when kind='SIMULATION' then 'Simulación sin título' else 'Línea de tiempo sin título' end end else p_draft->'quiz'->>'title' end,100),generation_mode=case when p_origin='manual' then 'manual' else 'hybrid' end,
 status=case when p_ready then 'READY' else 'NEEDS_REVIEW' end,error_code=null,updated_at=now() where id=p_id;
 return n;
end $$;
revoke all on function scorm_private.write_revision(uuid,jsonb,jsonb,boolean,text) from public,anon,authenticated;
commit;
