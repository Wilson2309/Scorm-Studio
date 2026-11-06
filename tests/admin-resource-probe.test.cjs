/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {createServerClient}=require('@supabase/ssr'),{createClient}=require('@supabase/supabase-js');
const {syntheticPDF,syntheticQuiz}=require('./admin-resource-fixture.cjs');
const {extractPDF}=require('../src/lib/pdf/extract.ts');
const {analyzeDocumentDeterministically}=require('../src/lib/content/deterministic-analysis.server.ts');
const {validateQuiz}=require('../src/lib/content/quality.ts');
const {packageSCORM}=require('../src/lib/scorm/package.ts');
const {validateSCORMArtifact}=require('../src/lib/content/scorm-artifact.ts');
const {runResourceProbe}=require('../scripts/test-admin-resources-live.cjs');
const {nativeFetch}=require('./register.cjs');

test('synthetic ADMIN isolation material uses real PDF extraction and a valid manually assembled SCORM without a provider',async()=>{
 const file=syntheticPDF(),extracted=await extractPDF(file),prepared=analyzeDocumentDeterministically(extracted),quiz=syntheticQuiz(prepared,'local-fixture');
 assert.equal(extracted.pages,1);assert.equal(quiz.questions.length,3);assert.equal(validateQuiz(quiz).valid,true);validateSCORMArtifact(packageSCORM(quiz),quiz);
 assert(!extracted.text.includes('UNIVERSIDAD'));assert(quiz.description.includes('local-fixture'));
});

test('ADMIN resource probe is opt-in and never requests credentials or writes by default',()=>{
 const r=spawnSync(process.execPath,['scripts/test-admin-resources-live.cjs'],{encoding:'utf8'});assert.equal(r.status,2);assert.equal(JSON.parse(r.stdout).status,'NOT_EXECUTED');assert.equal(r.stderr,'');
});

test('HTTP ADMIN metadata does not grant private TEACHER PDF/draft/revision/ZIP access and temporary resources are cleaned',{skip:!process.env.SCORM_TEST_URL},async()=>{
 const base=process.env.SCORM_TEST_URL,url=process.env.SCORM_TEST_SUPABASE_URL,key='sb_publishable_local_protocol_fixture',clients=[];
 const session=async(email)=>{let jar=[];const client=createServerClient(url,key,{cookies:{getAll:()=>jar,setAll:v=>jar=v},auth:{autoRefreshToken:false,persistSession:false}});clients.push(client);const r=await client.auth.signInWithPassword({email,password:'Local-test-password-123!'});assert.ifError(r.error);return {client,id:r.data.user.id,cookie:()=>jar.map(c=>c.name+'='+c.value).join('; ')};};
 const checks=[],resources={},anonymous=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const admin=await session('admin@scorm.test'),teacher=await session('teacher-b@scorm.test');
  const request=(path,actor,init={})=>nativeFetch(base+path,{...init,headers:{Cookie:actor.cookie(),Origin:base,...init.headers}});
  await runResourceProbe({admin,teacher,request,resources,anonymous,storageURL:url,record:(test,pass)=>checks.push({test,pass})});
  assert(checks.length>=25);assert(checks.every(c=>c.pass),JSON.stringify(checks));
 }finally{for(const c of clients)await c.auth.signOut({scope:'local'});}
});
