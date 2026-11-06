-- Correct business conflicts only. Pending SEPARATE authorization: not part of the
-- two migrations already authorized/applied. Preserve the deployed SQL history.
-- PostgREST 14 retries SQLSTATE 40001; PT409 returns a terminal HTTP 409 instead.
begin;
do $migration$
declare
 signature text; function_oid oid; definition text; occurrences integer; total integer := 0;
begin
 foreach signature in array array[
  'public.workspace_create_document(uuid,text,integer,text)',
  'public.workspace_create_generation(uuid,uuid,text)',
  'public.workspace_save_draft(uuid,integer,jsonb,jsonb,boolean,text)',
  'public.workspace_claim_operation(uuid,uuid,text,text,integer)',
  'public.workspace_finish_generation(uuid,uuid,jsonb,jsonb,boolean,text)',
  'public.workspace_reserve_package(uuid,uuid,uuid)',
  'public.workspace_finish_package(uuid,uuid,uuid,integer,text)'
 ] loop
  function_oid := to_regprocedure(signature);
  if function_oid is null then raise exception 'workspace_conflict_function_missing: %', signature; end if;
  definition := pg_get_functiondef(function_oid);
  occurrences := (length(definition)-length(replace(definition,$old$errcode='40001'$old$,'')))/length($old$errcode='40001'$old$);
  if occurrences not in (1,2) then raise exception 'workspace_conflict_function_changed: %', signature; end if;
  -- pg_get_functiondef preserves signature, body, SECURITY DEFINER and search_path.
  -- CREATE OR REPLACE preserves existing ownership and EXECUTE grants.
  execute replace(definition,$old$errcode='40001'$old$,$new$errcode='PT409'$new$);
  total := total + occurrences;
 end loop;
 if total <> 9 then raise exception 'workspace_conflict_unexpected_change_count'; end if;
end
$migration$;
commit;
