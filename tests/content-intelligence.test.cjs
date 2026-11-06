/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {unzipSync,strFromU8}=require('fflate');
const {document,analysis,quiz,extracted,wire}=require('./content-fixture.cjs');
const {normalizeDocument,chunkDocument}=require('../src/lib/content/normalize.ts');
const {analysisSchema,studioQuizSchema}=require('../src/lib/content/schema.ts');
const {validateQuiz,generationState,syncBlueprint,assertAnalysisGrounded}=require('../src/lib/content/quality.ts');
const {OpenAICompatibleProvider}=require('../src/lib/content/provider.server.ts');
const {analyzeContent,buildEducationalQuiz,regenerate}=require('../src/lib/content/pipeline.server.ts');
const {packageSCORM}=require('../src/lib/scorm/package.ts');
const {renderQuiz}=require('../src/lib/scorm/template.ts');
const clone=()=>structuredClone(quiz);
const codes=q=>validateQuiz(q).issues.map(i=>i.code);
test('administrative exclusion retains page/fragment and preserves educational duration',()=>{
  assert.equal(document.excluded.length,3);assert.ok(document.excluded.some(f=>/UNIVERSIDAD/.test(f.original)));
  assert.ok(document.fragments.every(f=>f.page===1&&f.id&&f.original));
  const text=extracted.text+'\nLa duración del potencial de acción depende de los procesos fisiológicos de despolarización y repolarización.';
  const result=normalizeDocument({...extracted,text,pageTexts:[{page:1,text}]});
  assert.ok(result.fragments.some(f=>/potencial de acción/.test(f.text)));
});
test('repeated page furniture is removed by position and repetition, not by a keyword alone',()=>{
  const pageTexts=[1,2,3].map(page=>({page,text:`Cabecera del curso\n${extracted.text.split('\n').slice(3).map(s=>`${s} Unidad ${page}.`).join('\n')}\n${page}`}));
  const result=normalizeDocument({...extracted,pages:3,pageTexts,text:pageTexts.map(p=>p.text).join('\n')});
  assert.equal(result.excluded.filter(f=>/Cabecera/.test(f.original)).length,3);
  assert.ok(result.fragments.some(f=>f.page===3));
  assert.ok(chunkDocument(result,200).every(chunk=>chunk.length>0));
  assert.throws(()=>normalizeDocument({...extracted,pages:3,pageTexts:undefined}),/referencias de página/);
});
test('analysis must be structured and all references must exist with matching quotes',()=>{
  assert.ok(analysisSchema.safeParse(analysis).success);assert.throws(()=>analysisSchema.parse({title:'Title'}));
  assert.throws(()=>analysisSchema.parse({...analysis,unexpected:'not accepted'}));
  const wrong=structuredClone(analysis);wrong.keyConcepts[0].sourceReferences[0].page=99;
  assert.throws(()=>assertAnalysisGrounded(wrong,document.fragments),/sin respaldo/);
});
test('reject duplicate questions/options, invalid answer, unsupported citations and administrative questions',()=>{
  assert.equal(validateQuiz(quiz).blockingCount,0);assert.equal(validateQuiz(quiz).valid,true);
  let q=clone();q.questions[1].stem=q.questions[0].stem;assert.ok(codes(q).includes('duplicate_question'));
  q=clone();q.questions[0].options[1].text=q.questions[0].options[0].text;assert.ok(codes(q).includes('duplicate_options'));
  q=clone();q.questions[0].correctOptionId='z';assert.ok(codes(q).includes('schema'));
  q=clone();q.questions[0].sourceReferences[0].quote='Una afirmación que no aparece en el PDF.';assert.ok(codes(q).includes('unsupported_reference'));
  q=clone();q.questions[0].stem='¿Cuál es el nombre de la universidad que presenta el documento?';assert.ok(codes(q).includes('administrative'));
  q=clone();q.questions[0].stem='Completa según el documento: ______ SINTÉTICA DE PRUEBA.';assert.ok(codes(q).includes('cloze'));
  q=clone();q.questions[0].sourceReferences[0].quote=q.questions[0].sourceReferences[0].quote.replace('transforma','no transforma');assert.ok(codes(q).includes('unsupported_reference'));
});
test('generation CTA depends on validity and busy state, not a generic review checkbox',()=>{
  assert.equal(generationState(quiz).enabled,true);assert.equal(generationState(quiz,true).enabled,false);
  const q=clone();q.questions[0].sourceReferences=[];
  assert.equal(generationState(q).enabled,false);assert.match(generationState(q).reason,/fuente|evidencia/);
  assert.equal(generationState(syncBlueprint({...quiz,questions:quiz.questions.slice(0,2)})).enabled,false);
});
test('strict provider validates malformed JSON, retries once, and never accepts malformed content',async()=>{
  let calls=0;
  const transport=async(_url,request)=>{calls++;const body=JSON.parse(request.body);assert.equal(body.response_format.json_schema.strict,true);assert.ok(!request.body.includes('super-secret-key'));return Response.json({choices:[{finish_reason:'stop',message:{content:calls===1?'```json broken':JSON.stringify(wire(analysis))}}]});};
  const provider=new OpenAICompatibleProvider({apiKey:'super-secret-key',baseURL:'https://example.invalid/v1',model:'test-model',mode:'strict'},transport);
  assert.deepEqual(await provider.analyzeDocument({fragments:document.fragments}),analysis);assert.equal(calls,2);
  const bad=new OpenAICompatibleProvider({apiKey:'key',baseURL:'https://example.invalid/v1',model:'test',mode:'strict'},async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'{"unexpected":true}'}}]}));
  await assert.rejects(bad.analyzeDocument({fragments:document.fragments}),/contrato estructurado/);
});
test('educational pipeline uses typed analysis, blueprint and content-only provider',async()=>{
  let blueprintSeen=false;
  const provider={analyzeDocument:async()=>analysis,generateQuiz:async input=>{blueprintSeen=!!input.blueprint.slots.length;return quiz.questions;},regenerateQuestion:async()=>quiz.questions[0]};
  const result=await analyzeContent(extracted,provider);assert.equal(result.processing.chunks,1);
  const generated=await buildEducationalQuiz(result.document,result.analysis,{title:quiz.title,count:3,scored:true},provider);
  assert.equal(blueprintSeen,true);assert.ok(studioQuizSchema.safeParse(generated).success);assert.equal(validateQuiz(generated).valid,true);
  const updated=await regenerate(document,analysis,quiz.blueprint.slots[0],'q1',['old stem'],provider);assert.equal(updated.question.id,'q1');
  const files=unzipSync(packageSCORM(generated));assert.deepEqual(Object.keys(files).sort(),['imsmanifest.xml','index.html','runtime.js','styles.css']);
  assert.match(strFromU8(files['runtime.js']),/LMSInitialize/);assert.match(strFromU8(files['index.html']),/Confirmar respuesta/);assert.match(strFromU8(files['styles.css']),/prefers-reduced-motion/);
  const invalid=clone();invalid.questions[0].sourceReferences[0].page=99;assert.throws(()=>packageSCORM(invalid),/referencia/);
});
test('learner payload escapes hostile strings and excludes full analysis/source catalog',()=>{
  const html=renderQuiz({...quiz,title:'Biología </script><script>alert(1)</script>'},true);
  assert.ok(!html.includes('<script>alert(1)</script>'));assert.match(html,/\\u003c\/script>/);
  const payload=JSON.parse(html.match(/<script id="quiz-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(payload.analysis,undefined);assert.equal(payload.sources,undefined);assert.equal(payload.questions[0].conceptLabel,'Fotosíntesis');
});
test('long documents use bounded chunks and pairwise grounded synthesis',async()=>{
  const longText=Array.from({length:120},(_,i)=>`Tema ${i}. `+document.fragments[i%3].text.repeat(4)).join('\n');
  const input={name:'unidad-larga.pdf',pages:1,text:longText,pageTexts:[{page:1,text:longText}],warnings:[]};
  let local=0,synthesis=0;
  const provider={analyzeDocument:async ({fragments,chunkAnalyses})=>{
    if(chunkAnalyses){synthesis++;assert.ok(chunkAnalyses.length<=2);}else{local++;assert.ok(fragments.reduce((n,f)=>n+f.text.length,0)<=20000);}
    const ref={fragmentId:fragments[0].id,page:fragments[0].page,quote:fragments[0].text.slice(0,200)};
    const map=item=>({...item,sourceFragmentIds:[ref.fragmentId],sourceReferences:[ref]});
    return {...analysis,documentId:fragments[0].documentId,sourceFragmentIds:[ref.fragmentId],learningObjectives:analysis.learningObjectives.map(map),keyConcepts:analysis.keyConcepts.map(map),sections:analysis.sections.map(map),importantFacts:analysis.importantFacts.map(map),relationships:analysis.relationships.map(map),sourceReferences:[ref]};
  }};
  const result=await analyzeContent(input,provider);assert.ok(local>1);assert.equal(synthesis,local-1);assertAnalysisGrounded(result.analysis,result.document.fragments);
});
test('HTTP export enforces v2 quality and configured provider state', {skip:!process.env.SCORM_TEST_URL},async()=>{
  const base=process.env.SCORM_TEST_URL;
  const response=await fetch(base+'/api/scorm',{method:'POST',body:JSON.stringify(quiz)});assert.equal(response.status,200,await response.clone().text());assert.ok(unzipSync(new Uint8Array(await response.arrayBuffer()))['imsmanifest.xml']);
  const invalid=clone();invalid.questions[0].sourceReferences[0].page=99;assert.equal((await fetch(base+'/api/scorm',{method:'POST',body:JSON.stringify(invalid)})).status,422);
  const config=await(await fetch(base+'/api/intelligence')).json();assert.equal(typeof config.configured,'boolean');assert.equal(config.apiKey,undefined);
  assert.equal((await fetch(base+'/api/intelligence',{method:'POST',body:'{bad'})).status,422);
});
test('HTTP real PDF -> mock AI analysis -> blueprint -> pedagogical quiz -> SCORM', {skip:!process.env.SCORM_MOCK_AI},async()=>{
  const {pdfBytes}=require('./pdf-fixture.cjs');
  const base=process.env.SCORM_TEST_URL,form=new FormData();form.set('file',new File([pdfBytes(extracted.text)],'biologia.pdf',{type:'application/pdf'}));
  const extraction=await fetch(base+'/api/extract',{method:'POST',body:form});assert.equal(extraction.status,200);
  const real=await extraction.json();
  const understood=await fetch(base+'/api/intelligence',{method:'POST',body:JSON.stringify({action:'analyze',extracted:real})});assert.equal(understood.status,200,await understood.clone().text());
  const context=await understood.json();assert.equal(context.document.excluded.length,3);
  const generated=await fetch(base+'/api/intelligence',{method:'POST',body:JSON.stringify({action:'generate',document:context.document,analysis:context.analysis,config:{title:'Evaluación biológica',count:3,scored:true}})});assert.equal(generated.status,200,await generated.clone().text());
  const result=await generated.json();assert.equal(result.quality.valid,true,JSON.stringify(result.quality));
  const output=await fetch(base+'/api/scorm',{method:'POST',body:JSON.stringify(result.quiz)});assert.equal(output.status,200);
  assert.ok(unzipSync(new Uint8Array(await output.arrayBuffer()))['runtime.js']);
  const regenerated=await fetch(base+'/api/intelligence',{method:'POST',body:JSON.stringify({action:'regenerate',document:context.document,analysis:context.analysis,slot:result.quiz.blueprint.slots[0],questionId:'q1',avoidStems:result.quiz.questions.map(q=>q.stem)})});assert.equal(regenerated.status,200);assert.equal((await regenerated.json()).question.id,'q1');
});
