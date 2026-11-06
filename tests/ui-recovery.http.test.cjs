/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {syntheticPDF}=require('./admin-resource-fixture.cjs');
test('HTTP capacity rejection preserves valid prepared PDF and never claims an expensive generation operation',{skip:!process.env.SCORM_TEST_URL},async()=>{
 const base=process.env.SCORM_TEST_URL,id=randomUUID(),doc=randomUUID(),form=new FormData();form.set('documentId',doc);form.set('generationId',id);form.set('file',syntheticPDF());
 let prepared=false;
 try{const upload=await fetch(base+'/api/workspace/documents',{method:'POST',body:form});assert.equal(upload.status,200);prepared=true;
  const response=await fetch(base+'/api/workspace/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'generate',operationId:randomUUID(),expectedRevision:0,config:{title:'Demasiadas preguntas para este material',count:20,scored:true}})});assert.equal(response.status,422);const result=await response.json();assert.equal(result.code,'insufficient_assessment_content');assert(result.available<20);assert.match(result.error,/preguntas fundamentadas/);
  const snapshot=(await(await fetch(base+'/api/workspace/'+id)).json()).snapshot;assert.equal(snapshot.generation.status,'PREPARED');assert.equal(snapshot.generation.active_operation,null);assert.equal(snapshot.generation.current_revision,0);
 }finally{if(prepared){await fetch(base+'/api/workspace/'+id,{method:'DELETE'});await fetch(base+'/api/workspace/documents/'+doc,{method:'DELETE'});}}
});
