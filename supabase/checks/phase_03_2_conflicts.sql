-- Read-only: no resource contents, tokens, prompts or query text returned.
with functions as (
 select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in (
  'workspace_create_document','workspace_create_generation','workspace_save_draft',
  'workspace_claim_operation','workspace_finish_generation','workspace_reserve_package','workspace_finish_package'
 )
), counts as (
 select count(*) as functions,
  sum((length(prosrc)-length(replace(prosrc,$old$errcode='40001'$old$,'')))/length($old$errcode='40001'$old$)) as legacy_conflicts,
  sum((length(prosrc)-length(replace(prosrc,$new$errcode='PT409'$new$,'')))/length($new$errcode='PT409'$new$)) as terminal_conflicts from functions
)
select jsonb_build_object(
 'conflict_fix_applied', functions=7 and legacy_conflicts=0 and terminal_conflicts=9,
 'functions',functions,'legacy_conflicts',legacy_conflicts,'terminal_conflicts',terminal_conflicts,
 'active_workspace_save_backends',(select count(*) from pg_stat_activity where usename='authenticator' and state='active' and query like '%workspace_save_draft%')
) as conflict_check from counts;
