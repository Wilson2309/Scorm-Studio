/* eslint-disable @typescript-eslint/no-require-imports */
// Uses ordinary ADMIN/TEACHER sessions, existing HTTP persistence and private Storage.
require('../tests/register.cjs');
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),fs=require('node:fs');
const {createServerClient}=require('@supabase/ssr');
const {createClient}=require('@supabase/supabase-js');
const {publicSupabaseConfig,applicationURL}=require('../src/lib/supabase/config.ts');
const {projectRef}=require('./supabase-project-ref.cjs');
const {syntheticPDF,syntheticQuiz}=require('../tests/admin-resource-fixture.cjs');
const {dehydrateQuiz}=require('../src/lib/workspace/contracts.ts');
const {validateQuiz}=require('../src/lib/content/quality.ts');
const {validateSCORMArtifact}=require('../src/lib/content/scorm-artifact.ts');
const {adminActivity}=require('../src/lib/admin/contracts.ts');
const {sha256}=require('../src/lib/workspace/seal.server.ts');
const {fileDenied}=require('./test-workspace-live.cjs');
const reportPath='artifacts/phase-03.4/teacher-resource-results.json';
const tables=['documents','generations','quiz_revisions','scorm_packages'];

async function runResourceProbe({admin,teacher,request,record,resources,anonymous,storageURL}){
 const doc=randomUUID(),gen=randomUUID(),marker=randomUUID(),paths=[];
 Object.assign(resources,{documentId:doc,generationId:gen,ownerId:teacher.id,marker,packagePaths:paths,pdfPath:`${teacher.id}/${doc}/original.pdf`});
 const check=async(test,fn)=>{try{await fn();record(test,true);}catch(error){record(test,false);throw error;}};
 const command=(body,actor=teacher)=>request('/api/workspace/'+gen,actor,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const filter=(table,q)=>q.eq(table==='documents'?'id':table==='generations'?'id':'generation_id',table==='documents'?doc:gen);
 let quiz,pack,ownsIntent=false;
 try{
  await check('Temporary UUIDs do not refer to existing resources',async()=>{for(const table of ['documents','generations']){const r=await filter(table,teacher.client.from(table).select('id'));assert.ifError(r.error);assert.equal(r.data.length,0);}});
  ownsIntent=true;
  const file=syntheticPDF(),pdf=new Uint8Array(await file.arrayBuffer());
  await check('TEACHER uploads and prepares synthetic PDF via existing HTTP persistence',async()=>{
   const form=new FormData();form.set('documentId',doc);form.set('generationId',gen);form.set('file',file);
   const r=await request('/api/workspace/documents',teacher,{method:'POST',body:form});assert.equal(r.status,200);
   const snapshot=(await r.json()).snapshot;assert.equal(snapshot.generation.status,'PREPARED');assert.equal(snapshot.generation.user_id,teacher.id);
   quiz=syntheticQuiz(snapshot.prepared,marker);assert.equal(validateQuiz(quiz).valid,true);
  });
  await check('TEACHER saves manual synthetic draft and revision without inference',async()=>{const r=await command({action:'save',expectedRevision:0,quiz:dehydrateQuiz(quiz).quiz,origin:'manual'});assert.equal(r.status,200);assert.equal((await r.json()).revision,1);});
  await check('TEACHER generates and stores valid revision-bound SCORM ZIP without inference',async()=>{const r=await command({action:'package',expectedRevision:1,operationId:randomUUID()});assert.equal(r.status,200);pack=(await r.json()).package;paths.push(pack.storage_path);assert.equal(pack.revision,1);assert(pack.storage_path.startsWith(`${teacher.id}/${gen}/r1/`));});
  for(const table of [...tables,'quiz_drafts'])await check('ADMIN cannot read TEACHER '+table,async()=>{
   const own=await filter(table,teacher.client.from(table).select('*'));assert.ifError(own.error);assert(own.data.length>0);assert(own.data.every(r=>r.user_id===teacher.id));
   const hidden=await filter(table,admin.client.from(table).select('*'));assert.ifError(hidden.error);assert.deepEqual(hidden.data,[]);
  });
  await check('ADMIN sees allowed activity metadata without private content',async()=>{
   const r=await request('/api/admin/activities?owner='+teacher.id+'&q='+encodeURIComponent(quiz.title),admin);assert.equal(r.status,200);
   const value=await r.json();assert.equal(value.items.length,1);const item=adminActivity.strict().parse(value.items[0]);assert.equal(item.id,gen);assert.equal(item.ownerId,teacher.id);assert.equal(item.questions,3);assert.equal(item.revision,1);assert.equal(item.packageState,'CURRENT');
   assert(!JSON.stringify(value).includes(quiz.description));assert(!JSON.stringify(value).includes(quiz.questions[0].stem));
  });
  await check('ADMIN sees allowed TEACHER account detail and activity count',async()=>{const r=await request('/api/admin/people/'+teacher.id,admin);assert.equal(r.status,200);const data=(await r.json()).person;assert.equal(data.id,teacher.id);assert.equal(data.role,'TEACHER');assert(data.activities>=1);});
  for(const [name,path] of [['PDF','/api/workspace/documents/'+doc],['draft and questions','/api/workspace/'+gen],['ZIP','/api/workspace/'+gen+'/download'],['preview','/api/workspace/'+gen+'/download?preview=1']])await check('ADMIN direct endpoint cannot read TEACHER '+name,async()=>{const r=await request(path,admin);assert.equal(r.status,404);});
  await check('ADMIN cannot overwrite TEACHER draft through direct HTTP or RPC',async()=>{
   const body={action:'save',expectedRevision:1,quiz:dehydrateQuiz(quiz).quiz,origin:'manual'};assert.equal((await command(body,admin)).status,404);
   const r=await admin.client.rpc('workspace_save_draft',{p_id:gen,p_expected:1,p_draft:dehydrateQuiz(quiz),p_quality:{},p_ready:true,p_origin:'manual'});assert.equal(r.error?.code,'42501');
  });
  for(const [bucket,path,bytes] of [['scorm-pdfs',resources.pdfPath,pdf],['scorm-packages',pack.storage_path,null]]){
   await check('TEACHER keeps direct Storage access '+bucket,async()=>{const own=await teacher.client.storage.from(bucket).download(path);assert.ifError(own.error);const data=new Uint8Array(await own.data.arrayBuffer());if(bytes)assert.equal(sha256(data),sha256(bytes));else validateSCORMArtifact(data,quiz);});
   await check('ADMIN direct Storage download and signing denied '+bucket,async()=>{assert(fileDenied(await admin.client.storage.from(bucket).download(path)));const signed=await admin.client.storage.from(bucket).createSignedUrl(path,60);assert(!signed.data?.signedUrl&&signed.error);assert(fileDenied({data:null,error:signed.error}));});
   await check('Anonymous direct Storage download denied '+bucket,async()=>{assert(fileDenied(await anonymous.storage.from(bucket).download(path)));});
   await check('Public URL cannot bypass private bucket '+bucket,async()=>{const r=await fetch(storageURL+'/storage/v1/object/public/'+bucket+'/'+path,{signal:AbortSignal.timeout(20000)});assert([400,401,403,404].includes(r.status));});
  }
  await check('TEACHER recovers exact draft and valid ZIP through private endpoints',async()=>{
   const r=await request('/api/workspace/'+gen,teacher);assert.equal(r.status,200);const snapshot=(await r.json()).snapshot;assert.equal(snapshot.generation.current_revision,1);assert.deepEqual(snapshot.quiz.questions,quiz.questions);
   const zip=await request('/api/workspace/'+gen+'/download',teacher);assert.equal(zip.status,200);validateSCORMArtifact(new Uint8Array(await zip.arrayBuffer()),quiz);
   const original=await request('/api/workspace/documents/'+doc,teacher);assert.equal(original.status,200);assert.equal(sha256(new Uint8Array(await original.arrayBuffer())),sha256(pdf));
  });
 }finally{
  if(ownsIntent)await check('Delete only this run temporary resources using owner HTTP authorization',async()=>{
   const g=await teacher.client.from('generations').select('id,document_id,user_id').eq('id',gen);assert.ifError(g.error);
   if(g.data.length){assert.equal(g.data[0].document_id,doc);assert.equal(g.data[0].user_id,teacher.id);assert.equal((await request('/api/workspace/'+gen,teacher,{method:'DELETE'})).status,200);}
   const d=await teacher.client.from('documents').select('id,user_id').eq('id',doc);assert.ifError(d.error);if(d.data.length){assert.equal(d.data[0].user_id,teacher.id);assert.equal((await request('/api/workspace/documents/'+doc,teacher,{method:'DELETE'})).status,200);}
   for(const table of [...tables,'quiz_drafts','generation_events']){const r=await filter(table,teacher.client.from(table).select('*'));assert.ifError(r.error);assert.equal(r.data.length,0);}
  });
 }
}

async function main(){
 if(!process.argv.includes('--run-live')){console.log(JSON.stringify({status:'NOT_EXECUTED',reason:'Run scripts/test-admin-live.ps1 -TeacherResources privately.'}));process.exitCode=2;return;}
 require('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}});
 const config=publicSupabaseConfig(),base=applicationURL();assert(config&&base&&projectRef(config.url)==='xufqqqufvlmbkjiszpki');
 const report={scope:'REAL_SUPABASE_ADMIN_TEACHER_SYNTHETIC_RESOURCE_ISOLATION',status:'RUNNING',generatedAt:new Date().toISOString(),checks:[],resources:{},educationalRequests:0,rolesModified:0,migrationsApplied:0,cleanup:'NOT_EXECUTED',moodle:'NOT_VERIFIED'},clients=[];
 const record=(test,pass)=>{report.checks.push({test,status:pass?'PASS':'FAIL'});fs.mkdirSync('artifacts/phase-03.4',{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2));};
 let input='',credentials;
 try{
  for await(const chunk of process.stdin){input+=chunk;if(input.length>8192)throw Error('invalid_private_input');}credentials=JSON.parse(input.replace(/^\uFEFF/,''));input='';
  const session=async(label,role)=>{let jar=[];const client=createServerClient(config.url,config.publishableKey,{cookies:{getAll:()=>jar,setAll:updates=>{for(const v of updates){jar=jar.filter(c=>c.name!==v.name);if(v.value)jar.push(v);}}},auth:{autoRefreshToken:false,persistSession:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(60000)})}});clients.push(client);
   const r=await client.auth.signInWithPassword(credentials[label]);assert.ifError(r.error);assert(r.data.user?.email_confirmed_at);const p=await client.from('profiles').select('id,role').single();assert.ifError(p.error);assert.equal(p.data.role,role);record(role+' real confirmed login and verified profile',true);return {client,id:r.data.user.id,cookie:()=>jar.map(c=>c.name+'='+c.value).join('; ')};};
  const admin=await session('admin','ADMIN'),teacher=await session('teacher','TEACHER');assert.equal(admin.id,'22924639-38df-4f2a-9f92-82a63389fe0d');assert.notEqual(admin.id,teacher.id);
  const request=(path,actor,init={})=>{if(typeof init.body==='string'&&['generate','regenerate'].includes(JSON.parse(init.body).action)){report.educationalRequests++;throw Error('educational_inference_forbidden');}return fetch(base+path,{...init,headers:{...(actor?{Cookie:actor.cookie()}:{}),Origin:base,...init.headers},signal:AbortSignal.timeout(60000),redirect:'manual'});};
  const anonymous=createClient(config.url,config.publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
  await runResourceProbe({admin,teacher,request,record,resources:report.resources,anonymous,storageURL:config.url});
  report.cleanup='OWNER_HTTP_DELETION_PASS_OPERATOR_ORPHAN_CHECK_PENDING';report.status='PASS';
 }catch{report.status='FAIL';report.error='controlled_resource_acceptance_failure';if(report.checks.some(c=>c.test.startsWith('Delete only')&&c.status==='FAIL'))report.cleanup='RETRY_REQUIRED';}
 finally{input='';if(credentials){credentials.admin=null;credentials.teacher=null;}for(const c of clients){try{const r=await c.auth.signOut({scope:'local'});record('Dedicated test-session logout',!r.error);if(r.error)report.status='FAIL';}catch{record('Dedicated test-session logout',false);report.status='FAIL';}}fs.mkdirSync('artifacts/phase-03.4',{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(report.status!=='PASS')process.exitCode=1;}
}
if(require.main===module)main().catch(()=>{console.log(JSON.stringify({status:'FAIL',error:'controlled_private_configuration_error'}));process.exitCode=1;});
module.exports={runResourceProbe};
