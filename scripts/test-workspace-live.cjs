/* eslint-disable @typescript-eslint/no-require-imports */
// Explicit opt-in. Passwords only on stdin. All writes use real TEACHER sessions.
require('../tests/register.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createServerClient}=require('@supabase/ssr');
const {projectRef}=require('./supabase-project-ref.cjs');
const {WorkspaceService}=require('../src/lib/workspace/service.server.ts');
const {supabaseWorkspacePort}=require('../src/lib/workspace/supabase-port.server.ts');
const {WorkspaceError}=require('../src/lib/workspace/errors.ts');
const {dehydrateQuiz}=require('../src/lib/workspace/contracts.ts');
const {validateQuiz}=require('../src/lib/content/quality.ts');
const {sha256}=require('../src/lib/workspace/seal.server.ts');
const {unzipSync,strFromU8}=require('fflate');
const reportPath='artifacts/phase-03.2/live-results.json';
const privatePDF='./.cache/private/authorized-input.pdf';
function denied(result){return !!result.error&&[401,403].includes(result.status)&&result.error.code==='42501';}
function fileDenied(result){const status=Number(result.error?.status??result.error?.statusCode);return !result.data&&!!result.error&&[400,401,403,404].includes(status);}
function teacherEdits(seed){const q=structuredClone(seed);q.questions[0].stem+=' Versión revisada.';q.questions[1].explanation+=' Evidencia revisada.';return q;}
function clientFor(config,cookies=[]){
 const jar=[...cookies];
 const client=createServerClient(config.url,config.key,{cookies:{getAll:()=>jar,setAll:updates=>{for(const c of updates){const i=jar.findIndex(v=>v.name===c.name);if(i>=0)jar.splice(i,1);if(c.value)jar.push(c);}}},auth:{autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(60000)})}});
 return {client,jar};
}
async function checkWorkspaceLive(config,credentials){
 assert.equal(projectRef(config.url),'xufqqqufvlmbkjiszpki');
 assert(config.key&&!config.key.startsWith('sb_secret_'));
 if(config.key.split('.').length===3)assert.equal(JSON.parse(Buffer.from(config.key.split('.')[1],'base64url')).role,'anon');
 assert(credentials.a?.email&&credentials.a.password&&credentials.b?.email&&credentials.b.password);
 assert.notEqual(credentials.a.email.trim().toLowerCase(),credentials.b.email.trim().toLowerCase());
 const seed=JSON.parse(fs.readFileSync('artifacts/phase-02.5.1/final-acceptance/edited-quiz.json','utf8'));
 assert(validateQuiz(seed).valid,'saved_draft_not_exportable');assert.equal(seed.questions.length,5);
 assert(validateQuiz(teacherEdits(seed)).valid,'test_edits_not_exportable');
 const bytes=fs.readFileSync(process.env.SCORM_ACCEPTANCE_PDF||privatePDF);
 const file=()=>new File([new Uint8Array(bytes)],'phase-03-2-acceptance.pdf',{type:'application/pdf'});
 const results=[],accounts=[],resources=[],rpcErrors=[];let providerCalls=0;
 const forbiddenProvider=()=>{providerCalls++;throw new Error('unexpected_inference');};
 const record=(name,pass,detail={})=>{results.push({test:name,status:pass?'PASS':'FAIL',...detail});return pass;};
 const check=async(name,run,detail={})=>{try{await run();return record(name,true,detail);}catch(e){const code=typeof e.code==='string'&&/^[a-zA-Z0-9_]{1,50}$/.test(e.code)?e.code:'controlled_assertion_or_transport_error';record(name,false,{code,...detail});throw e;}};
 const attach=a=>{
  const instrumented={from:a.client.from.bind(a.client),storage:a.client.storage,rpc:async(name,args)=>{
   const result=await a.client.rpc(name,args);if(result.error)rpcErrors.push({operation:name,httpStatus:result.status,code:/^[a-zA-Z0-9_]{1,40}$/.test(result.error.code||'')?result.error.code:'controlled_transport_error'});return result;
  }};
  a.port=supabaseWorkspacePort(instrumented);a.service=new WorkspaceService(a.port,a.id,forbiddenProvider);
 };
 try{
  for(const label of ['a','b']){
   const account={...clientFor(config),label};accounts.push(account);
   await check(`${label.toUpperCase()}: dedicated confirmed TEACHER login`,async()=>{
    const login=await account.client.auth.signInWithPassword(credentials[label]);assert.ifError(login.error);assert(login.data.user?.email_confirmed_at);account.id=login.data.user.id;
    const p=await account.client.from('profiles').select('id,role').eq('id',account.id).single();assert.ifError(p.error);assert.equal(p.data.id,account.id);assert.equal(p.data.role,'TEACHER');attach(account);
   });
  }
  const [a,b]=accounts;assert.notEqual(a.id,b.id);
  for(const owner of accounts){
   const doc=randomUUID(),gen=randomUUID();owner.doc=doc;owner.gen=gen;resources.push({owner,doc,gen});
   await check(`${owner.label.toUpperCase()}: real PDF upload, preparation and authenticated recovery`,async()=>{
    const initial=(await owner.service.prepare(file(),doc,gen)).snapshot;assert.equal(initial.generation.status,'PREPARED');assert.equal(initial.prepared.document.documentId,seed.analysis.documentId);
    assert.equal(sha256((await owner.service.downloadPDF(doc)).bytes),sha256(bytes));
    assert.equal((await owner.service.prepare(file(),doc,gen)).extracted,null);
   });
   await check(`${owner.label.toUpperCase()}: saved five-question draft and two persisted teacher edits`,async()=>{
    const initial=structuredClone(seed);initial.title='Aceptación 03.2 '+owner.label.toUpperCase();await owner.service.save(gen,0,dehydrateQuiz(initial).quiz,'ai');
    const q=teacherEdits(initial);assert(validateQuiz(q).valid);
    const saved=await owner.service.save(gen,1,dehydrateQuiz(q).quiz,'ai');assert.equal(saved.revision,2);owner.edited=q;
   });
   await check(`${owner.label.toUpperCase()}: logout/login and recovery from a fresh SDK session`,async()=>{
    assert.ifError((await owner.client.auth.signOut({scope:'local'})).error);const fresh=clientFor(config);owner.client=fresh.client;owner.jar=fresh.jar;
    const login=await owner.client.auth.signInWithPassword(credentials[owner.label]);assert.ifError(login.error);assert.equal(login.data.user?.id,owner.id);attach(owner);
    const restored=await owner.service.snapshot(gen);assert.equal(restored.quiz.questions[0].stem,owner.edited.questions[0].stem);assert.equal(restored.quiz.questions[1].explanation,owner.edited.questions[1].explanation);
    owner.snapshot=restored;
   });
  }
  const tables=['documents','generations','quiz_revisions','quiz_drafts','generation_events','scorm_packages'];
  for(const [owner,other] of [[a,b],[b,a]]){
   await check(`${owner.label.toUpperCase()}: all six tables hide foreign rows and reject direct ownership writes`,async()=>{
    for(const table of tables){
     const select=await owner.client.from(table).select('*').eq('user_id',other.id);assert.ifError(select.error);assert.deepEqual(select.data,[]);
     assert(denied(await owner.client.from(table).insert({user_id:other.id})));
     assert(denied(await owner.client.from(table).update({user_id:owner.id}).eq('user_id',other.id)));
     assert(denied(await owner.client.from(table).delete().eq('user_id',other.id)));
    }
    await assert.rejects(owner.service.snapshot(other.gen),e=>e.status===404);
    const direct=await owner.client.rpc('workspace_save_draft',{p_id:other.gen,p_expected:2,p_draft:dehydrateQuiz(seed),p_quality:{},p_ready:true,p_origin:'manual'});assert(denied(direct));
   });
   await check(`${owner.label.toUpperCase()}: foreign PDF download/delete and invented upload path denied`,async()=>{
    const foreignPath=`${other.id}/${other.doc}/original.pdf`;
    assert(fileDenied(await owner.client.storage.from('scorm-pdfs').download(foreignPath)));
    const remove=await owner.client.storage.from('scorm-pdfs').remove([foreignPath]);if(remove.error)assert(fileDenied({data:null,error:remove.error}));
    assert.equal(sha256((await other.service.downloadPDF(other.doc)).bytes),sha256(bytes));
    const invented=`${owner.id}/${other.doc}/original.pdf`,write=await owner.client.storage.from('scorm-pdfs').upload(invented,bytes,{contentType:'application/pdf',upsert:false});assert(fileDenied({...write,data:write.data}));
   });
  }
  const concurrentDiagnostic={};
  await check('Real concurrent saves: exactly one revision wins and the stale writer receives conflict',async()=>{
   const q1=structuredClone(a.edited),q2=structuredClone(a.edited);q1.title+=' pestaña uno';q2.title+=' pestaña dos';
   const changes=await Promise.allSettled([a.service.save(a.gen,2,dehydrateQuiz(q1).quiz,'ai'),a.service.save(a.gen,2,dehydrateQuiz(q2).quiz,'ai')]);
   concurrentDiagnostic.outcomes=changes.map(c=>c.status==='fulfilled'?{status:'saved',revision:c.value.revision}:{status:'rejected',code:c.reason instanceof WorkspaceError?c.reason.code:'controlled_error',applicationStatus:c.reason instanceof WorkspaceError?c.reason.status:null});
   assert.equal(changes.filter(v=>v.status==='fulfilled').length,1);assert.equal(changes.filter(v=>v.status==='rejected'&&v.reason.code==='revision_conflict').length,1);assert.equal((await a.service.snapshot(a.gen)).generation.current_revision,3);
  },concurrentDiagnostic);
  await check('Real duplicate-operation claims: only one claim, no automatic inference',async()=>{
   const snapshot=await a.service.snapshot(a.gen),op=randomUUID(),args={p_id:a.gen,p_operation:op,p_kind:'GENERATE',p_hash:'a'.repeat(64),p_expected:snapshot.generation.current_revision};
   const responses=await Promise.all([a.port.rpc('workspace_claim_operation',args),a.port.rpc('workspace_claim_operation',args)]);assert.deepEqual(responses.map(r=>r.claimed).sort(),[false,true]);
   await a.port.rpc('workspace_fail_operation',{p_id:a.gen,p_operation:op});
  });
  for(const [owner,other] of [[a,b],[b,a]]){
   await check(`${owner.label.toUpperCase()}: real private SCORM upload/download, final edited data and foreign ZIP denial`,async()=>{
    const snapshot=await owner.service.snapshot(owner.gen),p=await owner.service.buildPackage(owner.gen,randomUUID(),snapshot.generation.current_revision),artifact=await owner.service.downloadPackage(owner.gen);
    const files=unzipSync(artifact.bytes);assert.deepEqual(Object.keys(files).sort(),['imsmanifest.xml','index.html','runtime.js','styles.css']);assert(strFromU8(files['index.html']).includes('Versión revisada.'));
    assert.equal(p.revision,snapshot.generation.current_revision);assert(fileDenied(await other.client.storage.from('scorm-packages').download(p.storage_path)));owner.package=p;
   });
  }
  const anon=clientFor(config).client;
  await check('Anonymous real PostgREST and private PDF/ZIP downloads denied',async()=>{
   for(const table of tables)assert(denied(await anon.from(table).select('*')));
   assert(fileDenied(await anon.storage.from('scorm-pdfs').download(`${a.id}/${a.doc}/original.pdf`)));
   assert(fileDenied(await anon.storage.from('scorm-packages').download(a.package.storage_path)));
  });
  await check('Teacher edit invalidates current ZIP and prevents application download of the old revision',async()=>{
   const snapshot=await a.service.snapshot(a.gen),q=structuredClone(snapshot.quiz);q.questions[0].stem+=' Cambio posterior al paquete.';
   await a.service.save(a.gen,snapshot.generation.current_revision,dehydrateQuiz(q).quiz,'ai');
   const updated=await a.service.snapshot(a.gen);assert.equal(updated.package,null);assert.equal(updated.generation.current_package_id,null);await assert.rejects(a.service.downloadPackage(a.gen),e=>e.code==='package_obsolete');
   const row=await a.client.from('scorm_packages').select('status').eq('id',a.package.id).single();assert.ifError(row.error);assert.equal(row.data.status,'OBSOLETE');
  });
  await check('Interrupted PDF finalization: real stored bytes resume with no second local file upload',async()=>{
   const doc=randomUUID(),gen=randomUUID();resources.push({owner:a,doc,gen});let inject=true;
   const faulty={...a.port,rpc(name,args){if(name==='workspace_prepare_document'&&inject){inject=false;throw new WorkspaceError(503,'injected_transport_failure','Acceptance fault injection');}return a.port.rpc(name,args);}};
   await assert.rejects(new WorkspaceService(faulty,a.id,forbiddenProvider).prepare(file(),doc,gen),e=>e.code==='injected_transport_failure');
   assert((await a.service.pendingDocuments()).some(d=>d.id===doc));await a.service.resumeDocument(doc,gen);assert.equal((await a.service.snapshot(gen)).generation.status,'PREPARED');
  },{faultInjection:true,backend:'REAL_SUPABASE'});
  await check('ZIP finalization failure: real Storage object compensated, FAILED metadata, explicit retry works',async()=>{
   const snapshot=await a.service.snapshot(a.gen),op=randomUUID();let inject=true;
   const faulty={...a.port,rpc(name,args){if(name==='workspace_finish_package'&&inject){inject=false;throw new WorkspaceError(503,'injected_transport_failure','Acceptance fault injection');}return a.port.rpc(name,args);}};
   await assert.rejects(new WorkspaceService(faulty,a.id,forbiddenProvider).buildPackage(a.gen,op,snapshot.generation.current_revision),e=>e.code==='injected_transport_failure');
   const row=await a.client.from('scorm_packages').select('status,storage_path').eq('operation_id',op).single();assert.ifError(row.error);assert.equal(row.data.status,'FAILED');assert(fileDenied(await a.client.storage.from('scorm-packages').download(row.data.storage_path)));
   await assert.rejects(a.service.downloadPackage(a.gen),e=>e.code==='package_obsolete');await a.service.buildPackage(a.gen,randomUUID(),snapshot.generation.current_revision);
  },{faultInjection:true,backend:'REAL_SUPABASE'});
  await check('Recover, validate, package and download execute zero Ollama/provider calls',async()=>assert.equal(providerCalls,0));
 }catch{/* Per-check errors are sanitized above. No raw server responses or credentials are printed. */}
 finally{
  for(const resource of resources.reverse()){
   const {owner,gen,doc}=resource;
   try{
    const rows=await owner.client.from('generations').select('id').eq('id',gen);assert.ifError(rows.error);
    if(rows.data.length)await owner.service.remove(gen);
    const docs=await owner.client.from('documents').select('id').eq('id',doc);assert.ifError(docs.error);if(docs.data.length)await owner.service.remove(doc,true);
    record('Owned temporary workspace cleanup',true);
   }catch{record('Owned temporary workspace cleanup',false,{code:'cleanup_requires_retry',resourceId:gen,documentId:doc});}
  }
  for(const account of accounts){try{const out=await account.client.auth.signOut({scope:'local'});record('Dedicated test-session logout',!out.error);}catch{record('Dedicated test-session logout',false);}}
 }
 const complete=results.some(r=>r.test==='Recover, validate, package and download execute zero Ollama/provider calls'&&r.status==='PASS');
 return {transport:'REAL_SUPABASE_AUTH_POSTGREST_STORAGE',project:'xufqqqufvlmbkjiszpki',requiresMigration:'20261104000400',generatedAt:new Date().toISOString(),status:complete&&results.every(r=>r.status==='PASS')?'PASS':'FAIL',results,rpcErrors,
  educationalInferenceCalls:providerCalls,seed:'SAVED_REAL_PHASE_02_5_1_TEACHER_EDITED_QUIZ',faultInjection:'Explicit transport interruption against real rows/Storage; not an observed cloud outage',browserUI:'NOT_EXECUTED_BY_THIS_SCRIPT',moodle:'NOT_VERIFIED'};
}
async function main(){
 if(!process.argv.includes('--run-live')){console.log(JSON.stringify({status:'NOT_EXECUTED',reason:'Use the private PowerShell launcher with -Workspace.'}));process.exitCode=2;return;}
 require('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}});
 let input='',credentials,report;
 try{
  for await(const chunk of process.stdin){input+=chunk;if(input.length>8192)throw new Error('invalid_private_input');}
  credentials=JSON.parse(input);input='';report=await checkWorkspaceLive({url:process.env.NEXT_PUBLIC_SUPABASE_URL,key:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY},credentials);
 }catch{report={transport:'REAL_SUPABASE_AUTH_POSTGREST_STORAGE',status:'FAIL',error:'controlled_live_check_error',details:'Check two confirmed TEACHER accounts, local saved regression files and server configuration. No credentials were logged.'};}
 finally{input='';if(credentials){credentials.a=null;credentials.b=null;}}
 fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exitCode=1;
}
if(require.main===module)main().catch(()=>{console.log(JSON.stringify({status:'FAIL',error:'controlled_live_check_error'}));process.exitCode=1;});
module.exports={checkWorkspaceLive,denied,fileDenied,teacherEdits};
