/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {denied,fileDenied,teacherEdits,checkWorkspaceLive}=require('../scripts/test-workspace-live.cjs');
const {quiz}=require('./content-fixture.cjs');
const {isAdministrativeQuestion,validateQuiz}=require('../src/lib/content/quality.ts');
const {supabaseWorkspacePort}=require('../src/lib/workspace/supabase-port.server.ts');
test('remote workspace probe rejects server/schema errors as evidence of permission denial',()=>{
 assert(denied({status:403,error:{code:'42501'}}));
 for(const v of [{status:500,error:{code:'42501'}},{status:404,error:{code:'PGRST205'}},{status:200,data:[]}])assert.equal(denied(v),false);
 assert(fileDenied({data:null,error:{statusCode:'403'}}));assert(fileDenied({data:null,error:{status:403,statusCode:'42501'}}));assert.equal(fileDenied({data:null,error:{status:503}}),false);assert.equal(fileDenied({data:new Blob(),error:null}),false);
});
test('acceptance edit markers preserve source data and do not introduce administrative assessment text',()=>{
 const source=structuredClone(quiz),edited=teacherEdits(source);assert.deepEqual(source,quiz);
 assert(!isAdministrativeQuestion(edited.questions[0].stem));assert.equal(validateQuiz(edited).blockingCount,validateQuiz(source).blockingCount);
 assert.deepEqual(edited.questions[0].sourceFragmentIds,source.questions[0].sourceFragmentIds);assert.equal(edited.questions[0].correctOptionId,source.questions[0].correctOptionId);
});
test('workspace live probe is opt-in and does not load credentials or write remotely by default',()=>{
 const r=spawnSync(process.execPath,['scripts/test-workspace-live.cjs'],{encoding:'utf8'});assert.equal(r.status,2);assert.equal(JSON.parse(r.stdout).status,'NOT_EXECUTED');assert.equal(r.stderr,'');
});
test('workspace live probe rejects administrative keys and identical accounts before network access',async()=>{
 const url='https://xufqqqufvlmbkjiszpki.supabase.co';await assert.rejects(checkWorkspaceLive({url,key:'sb_secret_forbidden'},{}));
 const user={email:'same@example.test',password:'test-only'};await assert.rejects(checkWorkspaceLive({url,key:'sb_publishable_fixture'},{a:user,b:user}));
});
test('interrupted Storage upload uses HTTP status and acknowledges only identical immutable bytes',async()=>{
 const bytes=new Uint8Array([1,2,3]);let reads=0;
 const make=(error,stored)=>supabaseWorkspacePort({storage:{from:()=>({upload:async()=>({error}),download:async()=>{reads++;return {data:new Blob([stored]),error:null};}})}});
 await make({status:409,statusCode:'23505'},bytes).upload('scorm-pdfs','owned/path',bytes,'application/pdf');assert.equal(reads,1);
 await assert.rejects(make({status:409,statusCode:'23505'},new Uint8Array([9])).upload('scorm-pdfs','owned/path',bytes,'application/pdf'));
 const before=reads;await assert.rejects(make({status:403,statusCode:'42501',code:'42501'},bytes).upload('scorm-pdfs','foreign/path',bytes,'application/pdf'));assert.equal(reads,before);
});
