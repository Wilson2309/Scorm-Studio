/* eslint-disable @typescript-eslint/no-require-imports */
const {nativeFetch}=require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createServerClient}=require('@supabase/ssr'),{pdfBytes}=require('./pdf-fixture.cjs'),{extracted}=require('./content-fixture.cjs');
const {dehydrateQuiz}=require('../src/lib/workspace/contracts.ts');
const {unzipSync,strFromU8}=require('fflate');
test('HTTP persistent workspace: PDF, quiz, edited revision, authenticated ZIP and account isolation',{skip:!process.env.SCORM_TEST_URL},async()=>{
 const base=process.env.SCORM_TEST_URL,ownerCookie=process.env.SCORM_TEST_AUTH_COOKIE;let jar=[];
 const client=createServerClient(process.env.SCORM_TEST_SUPABASE_URL,'sb_publishable_local_protocol_fixture',{cookies:{getAll:()=>jar,setAll:c=>jar=c},auth:{autoRefreshToken:false}});
 await client.auth.signInWithPassword({email:'teacher-b@scorm.test',password:'Local-test-password-123!'});
 const otherCookie=jar.map(c=>c.name+'='+c.value).join('; ');
 const request=(path,init={},cookie=ownerCookie)=>{const headers=new Headers(init.headers);headers.set('Cookie',cookie);headers.set('Origin',base);return nativeFetch(base+path,{...init,headers});};
 const command=(id,body,cookie)=>request('/api/workspace/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},cookie);
 const id=randomUUID(),doc=randomUUID(),form=new FormData();form.set('documentId',doc);form.set('generationId',id);form.set('file',new File([pdfBytes(extracted.text,11*1024*1024)],'private-large.pdf',{type:'application/pdf'}));
 const upload=await request('/api/workspace/documents',{method:'POST',body:form});const prepared=await upload.json();assert.equal(upload.status,200,JSON.stringify(prepared));assert.equal(prepared.snapshot.generation.status,'PREPARED');
 try{
  const op=randomUUID(),body={action:'generate',operationId:op,expectedRevision:0,config:{title:'Actividad persistida',count:3,scored:true}};
  const generated=await command(id,body),data=await generated.json();assert.equal(generated.status,200,JSON.stringify(data));assert.equal(data.snapshot.generation.current_revision,1);
  const replay=await command(id,body);assert.equal(replay.status,200);assert.equal((await replay.json()).snapshot.generation.current_revision,1);
  const quiz=data.snapshot.quiz;quiz.questions[0].stem+=' Revisión docente A.';quiz.questions[1].stem+=' Revisión docente B.';
  const save=await command(id,{action:'save',expectedRevision:1,quiz:dehydrateQuiz(quiz).quiz,origin:'ai'});assert.equal(save.status,200);assert.equal((await save.json()).revision,2);
  const recovered=await request('/api/workspace/'+id);assert.equal((await recovered.json()).snapshot.quiz.questions[0].stem,quiz.questions[0].stem);
  assert.equal((await command(id,{action:'save',expectedRevision:1,quiz:{...dehydrateQuiz(quiz).quiz,title:'Conflicto'},origin:'ai'})).status,409);
  assert.equal((await request('/api/workspace/'+id,{},otherCookie)).status,404);
  assert.equal((await request('/api/workspace/documents/'+doc,{},otherCookie)).status,404);
  assert.equal((await command(id,{action:'save',expectedRevision:2,quiz:dehydrateQuiz(quiz).quiz,origin:'ai'},otherCookie)).status,404);
  assert.equal((await command(id,{action:'save',expectedRevision:2,quiz:dehydrateQuiz(quiz).quiz,origin:'ai',user_id:'22222222-2222-4222-8222-222222222222'})).status,422);
  const packed=await command(id,{action:'package',expectedRevision:2,operationId:randomUUID()}),packageResult=await packed.json();assert.equal(packed.status,200,JSON.stringify(packageResult));assert.equal(packageResult.package.revision,2);
  const downloaded=await request('/api/workspace/'+id+'/download');assert.equal(downloaded.status,200);const zip=unzipSync(new Uint8Array(await downloaded.arrayBuffer()));assert.match(strFromU8(zip['index.html']),/Revisión docente A/);
  assert.deepEqual(Object.keys(zip).sort(),['imsmanifest.xml','index.html','runtime.js','styles.css']);
  assert.equal((await request('/api/workspace/'+id+'/download',{},otherCookie)).status,404);
  const preview=await request('/api/workspace/'+id+'/download?preview=1');assert.equal(preview.status,200);assert.match(await preview.text(),/Revisión docente B/);
  quiz.questions[0].stem+=' Cambio posterior al ZIP.';assert.equal((await command(id,{action:'save',expectedRevision:2,quiz:dehydrateQuiz(quiz).quiz,origin:'ai'})).status,200);
  assert.equal((await request('/api/workspace/'+id+'/download')).status,409);
  assert.equal((await request('/api/workspace/'+id,{method:'DELETE'},otherCookie)).status,404);
 }finally{const removed=await request('/api/workspace/'+id,{method:'DELETE'});assert.equal(removed.status,200);}
});
test('new workspace endpoints reject missing/expired sessions before reading files or processing',{skip:!process.env.SCORM_TEST_URL},async()=>{
 const id=randomUUID(),base=process.env.SCORM_TEST_URL;
 for(const [path,method] of [['/api/workspace','GET'],['/api/workspace/documents','POST'],['/api/workspace/'+id,'POST'],['/api/workspace/'+id+'/download','GET']]){
  const response=await nativeFetch(base+path,{method,headers:{Origin:base,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:'{}'}:{})});assert.equal(response.status,401);assert.match(response.headers.get('cache-control'),/no-store/);
 }
});
