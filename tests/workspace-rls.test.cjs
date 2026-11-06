/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {workspaceDB}=require('./workspace-db.cjs');
test('workspace migrations: actual PostgreSQL, owner RPCs, RLS, CAS and private Storage',async t=>{
 const w=await workspaceDB();t.after(()=>w.close());
 await t.test('deployment catalog verification passes against the actual migrated PostgreSQL schema',async()=>{
  const sql=require('node:fs').readFileSync('supabase/checks/phase_03_2_verify.sql','utf8');
  const catalog=(await w.db.query(sql)).rows[0].workspace_catalog;
  assert.equal(catalog.catalog_pass,true,JSON.stringify(catalog.checks));assert.equal(catalog.checks.length,11);
 });
 const doc=randomUUID(),gen=randomUUID(),hash='a'.repeat(64);
 await t.test('owner creates a document idempotently; direct ownership writes and anonymous calls fail',async()=>{
  const args={p_id:doc,p_filename:'source.pdf',p_size:500,p_sha:hash};
  const d=await w.rpc(w.a,'workspace_create_document',args);assert.equal(d.user_id,w.a);
  assert.equal((await w.rpc(w.a,'workspace_create_document',args)).id,doc);
  assert.equal((await w.as(w.b,'select * from public.documents')).rows.length,0);
  await assert.rejects(w.as(w.a,'update public.documents set user_id=$1 where id=$2',[w.b,doc]),e=>e.code==='42501');
  await assert.rejects(w.as(w.b,'insert into public.documents(id,user_id,filename,file_size,file_sha256,storage_path) values($1,$2,$3,500,$4,$5)',[randomUUID(),w.a,'x.pdf',hash,'fake']),e=>e.code==='42501');
  await assert.rejects(w.rpc(null,'workspace_create_document',args),e=>e.code==='42501');
  await assert.rejects(w.rpc(w.b,'workspace_create_document',args),e=>e.code==='42501');
 });
 await t.test('private PDF paths need an owned resource; no upsert and no cross-user read/delete',async()=>{
  const path=w.a+'/'+doc+'/original.pdf';
  await w.as(w.a,'insert into storage.objects(bucket_id,name) values($1,$2)',['scorm-pdfs',path]);
  await assert.rejects(w.as(w.b,'insert into storage.objects(bucket_id,name) values($1,$2)',['scorm-pdfs',w.b+'/'+doc+'/original.pdf']),e=>e.code==='42501');
  assert.equal((await w.as(w.b,'select * from storage.objects')).rows.length,0);
  assert.equal((await w.as(w.b,'delete from storage.objects where name=$1 returning id',[path])).rows.length,0);
  assert.equal((await w.as(w.a,'update storage.objects set name=$1 where name=$2 returning id',[path+'x',path])).rows.length,0);
  await assert.rejects(w.as(w.a,'insert into storage.objects(bucket_id,name) values($1,$2) on conflict(bucket_id,name) do update set name=excluded.name',['scorm-pdfs',path]),e=>e.code==='42501');
  const buckets=await w.as(null,'select public,file_size_limit from storage.buckets');assert.ok(buckets.rows.every(b=>b.public===false));
 });
 await t.test('preparation and generations cannot reference another owner',async()=>{
  await w.rpc(w.a,'workspace_prepare_document',{p_id:doc,p_pages:1,p_prepared:{version:1}});
  await w.rpc(w.a,'workspace_create_generation',{p_id:gen,p_document:doc,p_title:'Owned quiz'});
  await assert.rejects(w.rpc(w.b,'workspace_prepare_document',{p_id:doc,p_pages:1,p_prepared:{}}),e=>e.code==='42501');
  await assert.rejects(w.rpc(w.b,'workspace_create_generation',{p_id:randomUUID(),p_document:doc,p_title:'Cross user'}),e=>e.code==='42501');
 });
 const draft={version:1,quiz:{title:'Owned quiz',questions:[]}};
 await t.test('revision snapshots are immutable, CAS rejects stale tabs, interrupted identical saves are idempotent',async()=>{
  const args={p_id:gen,p_expected:0,p_draft:draft,p_quality:{},p_ready:false,p_origin:'manual'};
  assert.equal((await w.rpc(w.a,'workspace_save_draft',args)).revision,1);
  assert.equal((await w.rpc(w.a,'workspace_save_draft',args)).revision,1);
  await assert.rejects(w.rpc(w.a,'workspace_save_draft',{...args,p_draft:{...draft,quiz:{...draft.quiz,title:'Conflicting'}}}),e=>e.code==='PT409');
  await assert.rejects(w.rpc(w.a,'workspace_save_draft',{...args,p_expected:null}),e=>e.code==='PT409');
  assert.equal((await w.as(w.b,'select * from public.quiz_revisions')).rows.length,0);
  await assert.rejects(w.as(w.b,'delete from public.quiz_revisions'),e=>e.code==='42501');
 });
 await t.test('one operation wins double submission; failed keys never start another inference',async()=>{
  const op=randomUUID(),args={p_id:gen,p_operation:op,p_kind:'GENERATE',p_hash:hash,p_expected:1};
  assert.equal((await w.rpc(w.a,'workspace_claim_operation',args)).claimed,true);
  assert.equal((await w.rpc(w.a,'workspace_claim_operation',args)).claimed,false);
  await assert.rejects(w.rpc(w.a,'workspace_claim_operation',{...args,p_operation:randomUUID()}),e=>e.code==='55P03');
  await assert.rejects(w.rpc(w.b,'workspace_fail_operation',{p_id:gen,p_operation:op}),e=>e.code==='42501');
  await w.rpc(w.a,'workspace_fail_operation',{p_id:gen,p_operation:op});
  assert.equal((await w.rpc(w.a,'workspace_claim_operation',args)).status,'FAILED');
 });
 await t.test('package records are tied to a revision; edits invalidate the current ZIP atomically',async()=>{
  const op=randomUUID(),pkg=randomUUID();
  await w.rpc(w.a,'workspace_claim_operation',{p_id:gen,p_operation:op,p_kind:'PACKAGE',p_hash:hash,p_expected:1});
  const p=await w.rpc(w.a,'workspace_reserve_package',{p_id:gen,p_operation:op,p_package:pkg});
  await w.as(w.a,'insert into storage.objects(bucket_id,name) values($1,$2)',['scorm-packages',p.storage_path]);
  await w.rpc(w.a,'workspace_finish_package',{p_id:gen,p_operation:op,p_package:pkg,p_size:1234,p_sha:hash});
  assert.equal((await w.as(w.b,'select * from public.scorm_packages')).rows.length,0);
  assert.equal((await w.as(w.b,'select * from storage.objects')).rows.length,0);
  await w.rpc(w.a,'workspace_save_draft',{p_id:gen,p_expected:1,p_draft:{...draft,quiz:{...draft.quiz,title:'Edited quiz'}},p_quality:{},p_ready:false,p_origin:'manual'});
  assert.equal((await w.as(w.a,'select current_package_id from public.generations where id=$1',[gen])).rows[0].current_package_id,null);
  assert.equal((await w.as(w.a,'select status from public.scorm_packages where id=$1',[pkg])).rows[0].status,'OBSOLETE');
 });
 await t.test('all six private tables reject direct writes, anonymous reads and foreign mutation attempts',async()=>{
  for(const table of ['documents','generations','quiz_drafts','quiz_revisions','scorm_packages','generation_events']){
   assert.equal((await w.as(w.b,'select * from public.'+table)).rows.length,0);
   await assert.rejects(w.as(null,'select * from public.'+table),e=>e.code==='42501');
   await assert.rejects(w.as(w.a,'delete from public.'+table),e=>e.code==='42501');
   await assert.rejects(w.as(w.a,'insert into public.'+table+' default values'),e=>e.code==='42501');
   await assert.rejects(w.as(w.a,'update public.'+table+' set user_id=$1',[w.b]),e=>e.code==='42501');
  }
 });
});
