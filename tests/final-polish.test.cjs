/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,insufficient,extracted,id}=require('./timeline-fixture.cjs');
const {normalizeDocument}=require('../src/lib/content/normalize.ts');
const {prepareTimeline,timelineProposal}=require('../src/lib/activities/timeline-detection.ts');
const {prepareSimulation}=require('../src/lib/activities/simulation-detection.ts');
const {validateTimeline}=require('../src/lib/activities/timeline-quality.ts');
const {validateSimulation,simulationModel}=require('../src/lib/activities/simulation-quality.ts');
const {prepareDocumentForActivities}=require('../src/lib/activities/document-preparation.server.ts');
const {timelineAdapter}=require('../src/lib/activities/timeline-adapter.ts');
const {simulationAdapter}=require('../src/lib/activities/simulation-adapter.ts');
const {createSimulationEngine}=require('../src/lib/activities/simulation-engine.ts');
const {academicDraftIdeas}=require('../src/lib/activities/draft-suitability.ts');
const weak=()=>normalizeDocument(extracted(insufficient));

test('nonideal PDF produces grounded thematic timeline, conceptual exploration stays unscored; never fabricates dates or source order',()=>{
 const d=weak(),s=prepareTimeline(d.fragments,d.documentId,id,'Recorrido temático','CHRONOLOGICAL_TIMELINE');
 assert(academicDraftIdeas(d.fragments).every(i=>i.text!=='CARACTERISTICAS DEL SISTEMA'));
 assert.equal(s.mode,'CONCEPTUAL_TIMELINE');assert.equal(s.assessment.mode,'EXPLORATORY');assert.equal(s.assessment.orderBasis,'none');
 assert(s.events.length>=2);assert(s.events.every(e=>e.date===null&&e.ordinal===null&&e.sourceFragmentIds.every(id=>d.fragments.some(f=>f.id===id))));
 const q=validateTimeline(s,d.fragments,d.documentId);assert(q.valid);assert(q.issues.some(i=>i.code==='document_suitability'&&i.severity==='INFO'));
 timelineAdapter.validate(timelineAdapter.package(s,d.fragments),s,d.fragments);
 s.assessment.mode='ORDERING';assert(!validateTimeline(s,d.fragments).valid);
});
test('documented chronology/process remains unchanged; requesting unsupported mode uses actual evidenced mode with advisory',()=>{
 const {document:d,spec:s}=fixture();assert.equal(s.preparation,undefined);assert.equal(validateTimeline(s,d.fragments).status,'PASS');
 const proposed=timelineProposal(d.fragments,'PROCESS_TIMELINE');assert.equal(proposed.candidate.mode,'CHRONOLOGICAL_TIMELINE');assert.equal(proposed.preparation.level,'partial');
});
test('nonideal simulation branches into grounded reflection, no invented consequences, correctness or grades',()=>{
 const d=weak(),s=prepareSimulation(d.fragments,d.documentId,id,'Decisiones exploratorias'),q=validateSimulation(s,d.fragments,d.documentId);
 assert(q.valid);assert(q.issues.some(i=>i.code==='document_suitability'&&i.severity==='INFO'));assert.equal(s.configuration.scored,false);
 assert.equal(s.learningMode,'CONCEPT_EXPLORATION');assert(s.scenes.filter(s=>s.kind==='DECISION').every(s=>s.choices.every(c=>c.points===0)));
 const e=createSimulationEngine(simulationModel(s),'weak-test'),state=e.initial();e.start(state);e.choose(state,0);e.next(state);const restored=e.restore(e.serialize(state));assert(restored);let steps=0;
 while(!e.inspect(restored).terminal&&steps++<40){if(restored.feedback)e.next(restored);else {const current=s.scenes[e.inspect(restored).current];e.choose(restored,current.id==='explore-topics'?current.choices.length-1:0);}}assert(e.inspect(restored).terminal);assert.equal(e.inspect(restored).score,null);
 simulationAdapter.validate(simulationAdapter.package(s,d.fragments),s,d.fragments);
 s.scenes[0].sourceFragmentIds=['p99-f001'];assert(!validateSimulation(s,d.fragments).valid);
});
test('empty/administrative inputs still fail; one meaningful source makes two distinct grounded learning stops',()=>{
 assert.throws(()=>prepareTimeline([], 'a'.repeat(64),id,'Vacío'));assert.throws(()=>prepareSimulation([], 'a'.repeat(64),id,'Vacío'));
 const d=weak(),one=[{...d.fragments[0],text:'La arquitectura organiza componentes para distribuir responsabilidades y facilitar el mantenimiento.'}];
 const s=prepareTimeline(one,d.documentId,id,'Una idea');assert.equal(s.events.length,2);assert(validateTimeline(s,one).valid);
 assert.equal(timelineProposal(one.map(f=>({...f,contentType:'administrative'}))).candidate,null);
});
test('thin academic content reaches activity selection deterministically; real extraction errors are not recast as suitability warnings',()=>{
 const d=prepareDocumentForActivities(extracted('La arquitectura organiza componentes para distribuir responsabilidades.\nEl mantenimiento facilita la revisión de los elementos existentes.'));
 assert.equal(d.method,'deterministic');assert(d.document.fragments.length);assert(d.candidates.length);
 assert.throws(()=>prepareDocumentForActivities({...extracted(),pages:2,pageTexts:undefined}),/referencias de página/);
});
