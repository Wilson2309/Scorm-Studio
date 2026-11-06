/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{readFileSync}=require('node:fs');
const {createServerClient}=require('@supabase/ssr'),{nativeFetch}=require('./register.cjs');
const {syntheticPDF,syntheticQuiz}=require('./admin-resource-fixture.cjs');
const {dehydrateQuiz}=require('../src/lib/workspace/contracts.ts');
const {validateActivityArtifact}=require('../src/lib/activities/registry.ts');
const {workspaceDB}=require('./workspace-db.cjs');
test('roulette migration leaves existing owner policies and helper execution privileges unchanged',async()=>{
 const w=await workspaceDB({multiActivity:false});try{const policies=await w.db.query('select * from pg_policies order by tablename,policyname'),grants=await w.db.query("select grantee,privilege_type from information_schema.routine_privileges where routine_name='write_revision' order by grantee,privilege_type");await w.db.exec(readFileSync('supabase/migrations/20261105060949_multi_activity_roulette.sql','utf8'));assert.deepEqual((await w.db.query('select * from pg_policies order by tablename,policyname')).rows,policies.rows);assert.deepEqual((await w.db.query("select grantee,privilege_type from information_schema.routine_privileges where routine_name='write_revision' order by grantee,privilege_type")).rows,grants.rows);}finally{await w.close();}
});
test('HTTP roulette reuses canonical PDF, persists revisions, detects conflicts, invalidates ZIP and enforces isolation without AI',{skip:!process.env.SCORM_TEST_URL},async()=>{
 const base=process.env.SCORM_TEST_URL,cookie=process.env.SCORM_TEST_AUTH_COOKIE,source=randomUUID(),doc=randomUUID(),id=randomUUID();let jar=[];
 const other=createServerClient(process.env.SCORM_TEST_SUPABASE_URL,'sb_publishable_local_protocol_fixture',{cookies:{getAll:()=>jar,setAll:v=>jar=v},auth:{persistSession:false,autoRefreshToken:false}});await other.auth.signInWithPassword({email:'teacher-b@scorm.test',password:'Local-test-password-123!'});
 const request=(path,init={},cookies=cookie)=>nativeFetch(base+path,{...init,headers:{Cookie:cookies,Origin:base,...init.headers}}),command=(g,body,cookies)=>request('/api/workspace/'+g,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},cookies);
 try{
  const form=new FormData();form.set('file',syntheticPDF());form.set('documentId',doc);form.set('generationId',source);const prepared=await(await request('/api/workspace/documents',{method:'POST',body:form})).json(),quiz=syntheticQuiz(prepared.snapshot.prepared,'roulette-http');assert.equal((await command(source,{action:'save',expectedRevision:0,quiz:dehydrateQuiz(quiz).quiz,origin:'manual'})).status,200);
  const create=()=>command(source,{action:'roulette',expectedRevision:1,generationId:id});let r=await create();assert.equal(r.status,200);let snapshot=(await r.json()).snapshot;assert.equal(snapshot.document.id,doc);assert.equal(snapshot.generation.activity_type,'ROULETTE');assert.equal(snapshot.generation.current_revision,1);assert.equal(snapshot.activity.sourceGenerationId,source);assert.equal((await create()).status,200);
  snapshot.quiz.title='Ruleta revisada y persistida';snapshot.activity.settings.attempts=2;const save={action:'saveRoulette',expectedRevision:1,quiz:dehydrateQuiz(snapshot.quiz).quiz,activity:snapshot.activity};r=await command(id,save);assert.equal(r.status,200);assert.equal((await r.json()).revision,2);assert.equal((await command(id,{...save,quiz:{...save.quiz,title:'Otra pestaña'}})).status,409);
  r=await command(id,{action:'package',expectedRevision:2,operationId:randomUUID()});assert.equal(r.status,200);snapshot=(await(await request('/api/workspace/'+id)).json()).snapshot;assert.equal(snapshot.quiz.title,'Ruleta revisada y persistida');assert.equal(snapshot.activity.settings.attempts,2);
  const zip=await request('/api/workspace/'+id+'/download');assert.equal(zip.status,200);validateActivityArtifact(new Uint8Array(await zip.arrayBuffer()),snapshot.quiz,snapshot.activity);
  const foreign=jar.map(c=>c.name+'='+c.value).join('; ');assert.equal((await request('/api/workspace/'+id,{},foreign)).status,404);assert.equal((await request('/api/workspace/'+id+'/download',{},foreign)).status,404);assert.equal((await command(id,{...save,expectedRevision:2},foreign)).status,404);
  assert.equal((await command(id,{...save,expectedRevision:2,activity:{...save.activity,sourceGenerationId:randomUUID()}})).status,422);
  assert.equal((await command(id,{...save,expectedRevision:2,quiz:{...save.quiz,title:'Cambio después de exportar'}})).status,200);assert.equal((await request('/api/workspace/'+id+'/download')).status,409);
  const original=(await(await request('/api/workspace/'+source)).json()).snapshot;assert.equal(original.generation.activity_type,'QUIZ');assert.equal(original.generation.current_revision,1);assert.equal(original.quiz.title,quiz.title);
 }finally{for(const g of [id,source])await request('/api/workspace/'+g,{method:'DELETE'});await other.auth.signOut({scope:'local'});}
});
