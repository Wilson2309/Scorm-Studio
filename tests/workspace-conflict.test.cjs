/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),{readFileSync}=require('node:fs'),{randomUUID}=require('node:crypto');
const {workspaceDB}=require('./workspace-db.cjs');
const {workspaceFailure}=require('../src/lib/workspace/errors.ts');
test('versioned conflict correction changes nine business SQLSTATEs and preserves all function privileges/definitions',async t=>{
 const w=await workspaceDB({conflictFix:false});t.after(()=>w.close());
 const query="select p.oid,p.prosrc,p.prosecdef,p.proconfig,p.proacl::text,p.proowner from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'workspace\\_%' escape '\\' order by p.oid";
 const before=(await w.db.query(query)).rows;
 await w.db.exec(readFileSync('supabase/migrations/20261104000400_workspace_conflict_http.sql','utf8'));
 const after=(await w.db.query(query)).rows;assert.equal(after.length,12);let changed=0;
 for(let i=0;i<before.length;i++){const old=before[i],next=after[i];if(old.prosrc!==next.prosrc)changed++;assert.deepEqual(next,{...old,prosrc:old.prosrc.replaceAll("errcode='40001'","errcode='PT409'")});}
 assert.equal(changed,7);
 const catalog=(await w.db.query(readFileSync('supabase/checks/phase_03_2_conflicts.sql','utf8'))).rows[0].conflict_check;
 assert.equal(catalog.conflict_fix_applied,true);assert.equal(catalog.legacy_conflicts,0);assert.equal(catalog.terminal_conflicts,9);
 const doc=randomUUID(),gen=randomUUID();await w.rpc(w.a,'workspace_create_document',{p_id:doc,p_filename:'test.pdf',p_size:500,p_sha:'a'.repeat(64)});
 await w.rpc(w.a,'workspace_prepare_document',{p_id:doc,p_pages:1,p_prepared:{version:1}});await w.rpc(w.a,'workspace_create_generation',{p_id:gen,p_document:doc,p_title:'Conflict test'});
 const args={p_id:gen,p_expected:0,p_draft:{version:1,quiz:{title:'Original draft',questions:[]}},p_quality:{},p_ready:false,p_origin:'manual'};
 await w.rpc(w.a,'workspace_save_draft',args);
 await assert.rejects(w.rpc(w.a,'workspace_save_draft',{...args,p_draft:{version:1,quiz:{title:'Stale draft',questions:[]}}}),e=>e.code==='PT409');
 assert.equal((await w.as(w.a,'select current_revision from public.generations where id=$1',[gen])).rows[0].current_revision,1);
});
test('terminal HTTP conflict maps to the existing teacher-facing revision conflict without retry',()=>{
 assert.throws(()=>workspaceFailure({code:'PT409'}),e=>e.status===409&&e.code==='revision_conflict');
});
