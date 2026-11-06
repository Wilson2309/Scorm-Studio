/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {quiz}=require('./content-fixture.cjs');
const {compilePedagogicalQuiz}=require('../src/lib/content/pedagogical-compiler.ts');
const {generationState}=require('../src/lib/content/quality.ts');
const {reviseTeacherQuestion}=require('../src/lib/content/blueprint.ts');
const {reviewSummary,ReviewRevision}=require('../src/lib/content/review-state.ts');
const {validateSCORMArtifact}=require('../src/lib/content/scorm-artifact.ts');
const {packageSCORM}=require('../src/lib/scorm/package.ts');
const {unzipSync,zipSync,strToU8}=require('fflate');

test('draft lifecycle distinguishes review, blocking, readiness and current generated artifact',()=>{
 assert.equal(reviewSummary(quiz,false,false).lifecycle,'AI_DRAFT');assert.equal(reviewSummary(quiz).lifecycle,'READY');assert.equal(reviewSummary(quiz,true).lifecycle,'SCORM_GENERATED');
 const q=structuredClone(quiz);q.questions[0].correctOptionId='z';assert.equal(reviewSummary(q,true).lifecycle,'NEEDS_REVIEW');assert.equal(generationState(q).enabled,false);assert.match(generationState(q).reason,/Resuelve .*bloqueo/);
 assert.equal(generationState(quiz).enabled,true);assert.match(generationState(quiz).reason,/recomendaciones.*continuar/);
});
test('manual answer correction clears contradiction immediately with all validators and no model',()=>{
 const q=structuredClone(quiz);q.questions[0].options[0].text=q.sources[0].text;q.questions[0].options[1].text='Pintar las paredes del edificio con colores brillantes.';q.questions[0].correctOptionId='b';q.questions[0].explanation=q.sources[0].text;
 assert.equal(generationState(q).enabled,false);
 const fixed=compilePedagogicalQuiz(reviseTeacherQuestion(q,{...q.questions[0],correctOptionId:'a'}));assert.equal(fixed.quality.blockingCount,0);assert.equal(generationState(fixed.quiz).enabled,true);
 const invalid=compilePedagogicalQuiz(reviseTeacherQuestion(fixed.quiz,{...fixed.quiz.questions[0],stem:''}));assert.equal(invalid.quality.status,'BLOCKING');assert.equal(generationState(invalid.quiz).enabled,false);
});
test('ZIP and exact preview contain final edited and regenerated question data',()=>{
 const q=structuredClone(quiz);q.questions[0].stem='¿Cómo contribuye la energía solar a la producción de nutrientes que permiten sostener una planta?';
 q.questions[1].stem='Una célula necesita obtener energía para sostener sus funciones. ¿Qué proceso debería utilizar?';q.questions[1].explanation='La regeneración conserva el proceso de respiración celular descrito en la fuente para sostener las funciones de la célula.';
 const bytes=packageSCORM(q),artifact=validateSCORMArtifact(bytes,q);assert.equal(artifact.size,bytes.length);assert.deepEqual(artifact.paths.sort(),['imsmanifest.xml','index.html','runtime.js','styles.css'].sort());
 assert.match(artifact.html,/<span id="concept" class="concept" hidden>/,'The question header must not disclose the analysis claim before answering');
 const payload=JSON.parse(artifact.html.match(/id="quiz-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);assert.equal(payload.questions[0].stem,q.questions[0].stem);assert.equal(payload.questions[1].explanation,q.questions[1].explanation);
 assert.throws(()=>validateSCORMArtifact(bytes,quiz),/No se pudo validar/);
});
test('missing, corrupt, stale and altered ZIPs cannot become downloadable artifacts',()=>{
 const bytes=packageSCORM(quiz),files=unzipSync(bytes);delete files['runtime.js'];assert.throws(()=>validateSCORMArtifact(zipSync(files),quiz),/No se pudo validar/);
 assert.throws(()=>validateSCORMArtifact(new Uint8Array([1,2,3]),quiz),/No se pudo validar/);
 const modified=unzipSync(bytes);modified['imsmanifest.xml']=strToU8('<manifest><schemaversion>2004</schemaversion></manifest>');assert.throws(()=>validateSCORMArtifact(zipSync(modified),quiz));
 const badRuntime=unzipSync(bytes);badRuntime['runtime.js']=strToU8('throw new Error()');assert.throws(()=>validateSCORMArtifact(zipSync(badRuntime),quiz));
});
test('editing and explicit regeneration invalidate in-flight and previously generated revisions',()=>{
 const revisions=new ReviewRevision(),snapshot=revisions.capture();assert.equal(revisions.isCurrent(snapshot),true);revisions.invalidate();assert.equal(revisions.isCurrent(snapshot),false);
 const afterEdit=revisions.capture();revisions.invalidate();assert.equal(revisions.isCurrent(afterEdit),false);assert.equal(revisions.isCurrent(revisions.capture()),true);
});
