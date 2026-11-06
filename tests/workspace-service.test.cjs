/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {workspaceDB}=require('./workspace-db.cjs'),{pdfBytes}=require('./pdf-fixture.cjs'),{extracted}=require('./content-fixture.cjs');
const {WorkspaceService,PendingDraftError}=require('../src/lib/workspace/service.server.ts');
const {WorkspaceError}=require('../src/lib/workspace/errors.ts');
const {sealPrepared,openPrepared,sha256}=require('../src/lib/workspace/seal.server.ts');
const {dehydrateQuiz}=require('../src/lib/workspace/contracts.ts');
const {assembleLeanQuestions}=require('../src/lib/content/lean-question-compiler.ts');
process.env.WORKSPACE_SIGNING_KEY='ab'.repeat(32);
const json=value=>JSON.parse(JSON.stringify(value));
function portFor(w,owner,files){return {
 async read(table,filters,limit=1){const names=Object.keys(filters);return json((await w.as(owner,`select * from public.${table} where ${names.map((k,i)=>k+'=$'+(i+1)).join(' and ')} limit ${limit}`,Object.values(filters))).rows);},
 async rpc(name,args){try{return json(await w.rpc(owner,name,args));}catch(e){if(['40001','PT409'].includes(e.code))throw new WorkspaceError(409,'revision_conflict','Conflict');if(e.code==='55P03')throw new WorkspaceError(409,'operation_busy','Busy');throw e;}},
 async upload(bucket,path,bytes){try{await w.as(owner,'insert into storage.objects(bucket_id,name) values($1,$2)',[bucket,path]);}catch(e){if(e.code!=='23505'||sha256(files.get(bucket+'/'+path)||new Uint8Array())!==sha256(bytes))throw e;}files.set(bucket+'/'+path,bytes);},
 async download(bucket,path){const allowed=await w.as(owner,'select id from storage.objects where bucket_id=$1 and name=$2',[bucket,path]);if(!allowed.rows.length||!files.has(bucket+'/'+path))throw new WorkspaceError(404,'not_found','Missing');return files.get(bucket+'/'+path);},
 async remove(bucket,paths){for(const path of paths){const rows=await w.as(owner,'delete from storage.objects where bucket_id=$1 and name=$2 returning id',[bucket,path]);if(rows.rows.length)files.delete(bucket+'/'+path);}}
};}
const providerFor=calls=>({
 async analyzeDocument(){throw new Error('Analysis inference is forbidden');},
 async generateQuiz(input){calls.quiz++;return assembleLeanQuestions({questions:input.leanContext.slots.map(s=>({slotId:s.slot.slotId,stem:`¿Cómo se interpreta la función descrita en esta evidencia: ${s.canonicalEvidence.slice(0,100)}?`,explanation:`La fuente vincula ${s.correctAnswer.text} con la función descrita en la situación.`}))},input);},
 async regenerateQuestion(input){calls.regenerate++;return (await this.generateQuiz(input))[0];}
});
test('persistent workspace: real SQL, canonical preparation, revisions, recovery, ZIP and failure compensation',async t=>{
 const w=await workspaceDB();t.after(()=>w.close());const files=new Map(),port=portFor(w,w.a,files),calls={quiz:0,regenerate:0};
 const service=new WorkspaceService(port,w.a,()=>providerFor(calls));
 const file=()=>new File([pdfBytes(extracted.text)],'biologia.pdf',{type:'application/pdf'});
 const doc=randomUUID(),gen=randomUUID();let snapshot;
 await t.test('real PDF is stored privately and deterministic preparation is sealed without inference',async()=>{
  snapshot=(await service.prepare(file(),doc,gen)).snapshot;assert.equal(snapshot.generation.status,'PREPARED');assert.equal(files.size,1);assert.equal(calls.quiz,0);
  const again=await service.prepare(file(),doc,gen);assert.equal(again.extracted,null);assert.equal(files.size,1);
  assert.deepEqual(await portFor(w,w.b,files).read('documents',{user_id:w.b}),[]);
 });
 await t.test('seal survives JSONB property ordering, rejects another owner/document and tampering',async()=>{
  const sealed=sealPrepared(w.a,doc,'c'.repeat(64),snapshot.prepared);
  const reordered=JSON.parse(JSON.stringify(sealed),(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).reverse()):v);
  assert.equal(openPrepared(w.a,doc,'c'.repeat(64),reordered).document.documentId,snapshot.prepared.document.documentId);
  assert.throws(()=>openPrepared(w.b,doc,'c'.repeat(64),sealed));assert.throws(()=>openPrepared(w.a,randomUUID(),'c'.repeat(64),sealed));
  const forged=structuredClone(sealed);forged.payload.analysis.title='Invented';assert.throws(()=>openPrepared(w.a,doc,'c'.repeat(64),forged));
 });
 await t.test('one quiz inference persists a snapshot, replay/navigation/restoration do not infer',async()=>{
  const op=randomUUID();snapshot=await service.generate(gen,op,0,{title:'Biología persistente',count:3,scored:true});assert.equal(calls.quiz,1);assert.equal(snapshot.generation.current_revision,1);
  assert.equal((await service.generate(gen,op,0,{title:'Biología persistente',count:3,scored:true})).generation.current_revision,1);
  const restored=new WorkspaceService(portFor(w,w.a,files),w.a,()=>{throw new Error('Unexpected inference');});
  assert.deepEqual((await restored.snapshot(gen)).quiz,snapshot.quiz);assert.equal(calls.quiz,1);
 });
 await t.test('edits and incomplete manual questions survive; stale tabs cannot overwrite and snapshots are not duplicated',async()=>{
  const edited=structuredClone(snapshot.quiz);edited.questions[0].stem+=' Revisión docente.';edited.questions[1].explanation+=' Explicación revisada.';
  const saved=await service.save(gen,1,dehydrateQuiz(edited).quiz,'ai');assert.equal(saved.revision,2);
  const restored=await service.snapshot(gen);assert.equal(restored.quiz.questions[0].stem,edited.questions[0].stem);assert.equal(restored.quiz.questions[1].explanation,edited.questions[1].explanation);
  await assert.rejects(service.save(gen,1,{...dehydrateQuiz(edited).quiz,title:'Pestaña antigua'},'ai'),e=>e.code==='revision_conflict');
  const stored=await port.read('quiz_revisions',{generation_id:gen,revision:2});assert.equal(stored[0].draft_json.quiz.analysis,undefined);assert.equal(stored[0].draft_json.quiz.sources,undefined);
  snapshot=restored;
 });
 await t.test('package and download invoke zero AI; revision edit invalidates current package and cross-owner files stay private',async()=>{
  const before=calls.quiz;const p=await service.buildPackage(gen,randomUUID(),2);assert.equal(p.revision,2);
  const zip=await service.downloadPackage(gen);assert.ok(zip.bytes.length>100);assert.equal(calls.quiz,before);
  const other=new WorkspaceService(portFor(w,w.b,files),w.b,()=>{throw new Error('Unexpected');});
  await assert.rejects(other.snapshot(gen));await assert.rejects(other.downloadPDF(doc));await assert.rejects(other.downloadPackage(gen));
  const edited=structuredClone(snapshot.quiz);edited.questions[0].stem+=' Segunda edición.';await service.save(gen,2,edited,'ai');
  await assert.rejects(service.downloadPackage(gen),e=>e.code==='package_obsolete');assert.equal(calls.quiz,before);
 });
 await t.test('failed uploads leave a tracked intent, and an explicit retry finishes without overwriting files',async()=>{
  const d=randomUUID(),g=randomUUID();let failed=true;const flaky={...port,async upload(...args){if(failed){failed=false;throw new WorkspaceError(503,'upload_failed','Offline');}return port.upload(...args);}};
  const s=new WorkspaceService(flaky,w.a,()=>{throw new Error('Unexpected');});await assert.rejects(s.prepare(file(),d,g));
  assert.equal((await port.read('documents',{id:d}))[0].status,'UPLOADED');await s.prepare(file(),d,g);await s.remove(g);
 });
 await t.test('uploaded file plus SQL finalization failure can be retried idempotently; no anonymous/orphan public object',async()=>{
  const d=randomUUID(),g=randomUUID();let failed=true;const flaky={...port,async rpc(name,args){if(name==='workspace_prepare_document'&&failed){failed=false;throw new WorkspaceError(503,'offline','Offline');}return port.rpc(name,args);}};
  const s=new WorkspaceService(flaky,w.a,()=>{throw new Error('Unexpected');});await assert.rejects(s.prepare(file(),d,g));
  assert.ok(files.has('scorm-pdfs/'+w.a+'/'+d+'/original.pdf'));assert.ok((await s.pendingDocuments()).some(row=>row.id===d));
  await new WorkspaceService(port,w.a,()=>{throw new Error('No inference');}).resumeDocument(d,g);await s.remove(g);
 });
 await t.test('AI result survives failed persistence and is saved without a second inference',async()=>{
  const d=randomUUID(),g=randomUUID();await service.prepare(file(),d,g);let failed=true;const flaky={...port,async rpc(name,args){if(name==='workspace_finish_generation'&&failed){failed=false;throw new WorkspaceError(503,'offline','Offline');}return port.rpc(name,args);}};
  const s=new WorkspaceService(flaky,w.a,()=>providerFor(calls)),op=randomUUID(),before=calls.quiz;let error;
  try{await s.generate(g,op,0,{title:'Recuperar borrador',count:3,scored:true});}catch(e){error=e;}
  assert.ok(error instanceof PendingDraftError);assert.equal(calls.quiz,before+1);
  await s.save(g,0,error.recovery.quiz,'ai',op);assert.ok((await s.snapshot(g)).quiz);assert.equal(calls.quiz,before+1);await s.remove(g);
 });
 await t.test('explicit single-question regeneration uses saved sources and preserves other questions',async()=>{
  const before=await service.snapshot(gen),count=calls.regenerate;
  const next=await service.regenerate(gen,randomUUID(),before.generation.current_revision,before.quiz.questions[0].id);
  assert.equal(calls.regenerate,count+1);assert.deepEqual(next.quiz.questions.slice(1),before.quiz.questions.slice(1));assert.equal(next.quiz.questions[0].concept,before.quiz.questions[0].concept);
 });
 await t.test('failed ZIP upload/finalization stays unavailable and is retried without AI',async()=>{
  const before=await service.snapshot(gen),count=calls.quiz;let fail=true;
  const uploadFailure={...port,async upload(...args){if(args[0]==='scorm-packages'&&fail){fail=false;throw new WorkspaceError(503,'offline','Offline');}return port.upload(...args);}};
  await assert.rejects(new WorkspaceService(uploadFailure,w.a,()=>{throw new Error('No inference');}).buildPackage(gen,randomUUID(),before.generation.current_revision));
  await assert.rejects(service.downloadPackage(gen),e=>e.code==='package_obsolete');
  const sqlFailure={...port,async rpc(name,args){if(name==='workspace_finish_package'&&!fail){fail=true;throw new WorkspaceError(503,'offline','Offline');}return port.rpc(name,args);}};
  await assert.rejects(new WorkspaceService(sqlFailure,w.a,()=>{throw new Error('No inference');}).buildPackage(gen,randomUUID(),before.generation.current_revision));
  await service.buildPackage(gen,randomUUID(),before.generation.current_revision);assert.ok((await service.downloadPackage(gen)).bytes.length);assert.equal(calls.quiz,count);
 });
 await t.test('stored invalid draft remains editable and never becomes downloadable',async()=>{
  const current=await service.snapshot(gen),q=structuredClone(current.quiz);q.questions[0].stem='';q.questions[0].options[0].text='';await service.save(gen,current.generation.current_revision,q,'ai');
  assert.equal((await service.snapshot(gen)).quiz.questions[0].stem,'');await assert.rejects(service.buildPackage(gen,randomUUID(),current.generation.current_revision+1),e=>e.code==='quiz_blocked');
 });
 await t.test('delete is owner scoped and removes files before metadata, preserving retriable deletion on partial failure',async()=>{
  const other=new WorkspaceService(portFor(w,w.b,files),w.b,()=>{throw new Error('Unexpected');});await assert.rejects(other.remove(gen));
  let failed=true;const flaky={...port,async remove(...args){if(failed){failed=false;throw new WorkspaceError(503,'offline','Offline');}return port.remove(...args);}};
  await assert.rejects(new WorkspaceService(flaky,w.a,()=>{throw new Error('Unexpected');}).remove(gen));
  assert.ok((await port.read('generations',{id:gen}))[0].deleting_at);await service.remove(gen);assert.equal((await port.read('generations',{id:gen})).length,0);assert.equal(files.size,0);
 });
});
module.exports={portFor,providerFor};
