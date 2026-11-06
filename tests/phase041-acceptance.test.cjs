/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),{readFileSync}=require('node:fs');
const {analyzeDocumentDeterministically}=require('../src/lib/content/deterministic-analysis.server.ts');
const {buildHybridPlan}=require('../src/lib/content/hybrid-plan.ts');
const {canPrecompileTarget,precompileSlots}=require('../src/lib/content/lean-question-compiler.ts');
const {extracted}=require('./content-fixture.cjs');
const {cognitiveSignals}=require('../src/lib/content/quality-heuristics.ts');
const {optionQualityHints}=require('../src/lib/content/option-quality.ts');
const {quiz}=require('./content-fixture.cjs');
test('logistics application scenarios are recognized without reclassifying direct recall or suppressing answer contradictions',()=>{
 assert.equal(cognitiveSignals('Un almacén necesita reducir esperas en la recepción. ¿Qué medida debería aplicar?').inferred,'application');
 assert.equal(cognitiveSignals('¿Qué es un almacén?').inferred,'remember');
 const q=structuredClone(quiz.questions[0]),wrong=q.options.find(o=>o.id!==q.correctOptionId);q.explanation='La respuesta correcta es '+wrong.text;
 assert(optionQualityHints(q,'',q.options.map(o=>o.text).join(' ')).some(i=>i.code==='answer_explanation_conflict'&&i.blocking));
});
test('automatic preparation replaces an unsupported target before inference, retaining canonical answers and unique concepts',()=>{
 const prepared=analyzeDocumentDeterministically(extracted),bad={...prepared.candidates[0],id:'unsupported',name:'A concept that does not occur in any source'};
 prepared.candidates.unshift(bad);prepared.analysis.keyConcepts.unshift({...prepared.analysis.keyConcepts[0],id:bad.id,text:bad.name});
 assert.equal(canPrecompileTarget(bad,prepared),false);const plan=buildHybridPlan(prepared,3);assert(!plan.selectedConceptIds.includes(bad.id));assert.equal(new Set(plan.selectedConceptIds).size,3);assert.equal(precompileSlots(prepared,plan).length,3);
});
test('insufficient alternatives produce an actionable pre-inference error while manual source-backed drafting remains available',async()=>{
 const prepared=analyzeDocumentDeterministically(extracted);for(const c of prepared.candidates)c.section=c.id;
 for(const c of prepared.candidates)c.sourceFragmentIds=[prepared.document.fragments[0].id];
 // Explicitly keep a single supported concept: never invent padding alternatives.
 prepared.candidates=prepared.candidates.slice(0,1);
 assert.throws(()=>buildHybridPlan(prepared,3),/Reduce la cantidad|conceptos/);
 let calls=0;const {generateHybridQuiz}=require('../src/lib/content/hybrid-pipeline.server.ts');
 await assert.rejects(()=>generateHybridQuiz(prepared,{title:'Contenido insuficiente',count:3,scored:true},{generateQuiz:async()=>{calls++;throw Error('must_not_call');}}),/Reduce la cantidad|conceptos/);assert.equal(calls,0);
 const normal=analyzeDocumentDeterministically(extracted);assert.equal(buildHybridPlan(normal,3,'breadth','manual').blueprint.slots.length,3);
});
test('question-count input retains empty text and Step 4 keeps manual writing behind explicit disclosure',()=>{
 const source=readFileSync('src/features/generator/generator-wizard.tsx','utf8');
 assert(source.includes('value={countInput} onChange={e=>setCountInput(e.target.value)}'));assert(!source.includes('setCount(Number(e.target.value))'));
 assert(source.includes('id="question-count-help"'));assert(source.includes('<details className="manual-writing">'));assert(!source.includes('<details className="blueprint-details" open>'));
 assert(source.includes('<PipelineProgress'));const shared=readFileSync('src/components/ui/pipeline-progress.tsx','utf8');assert(shared.includes('aria-current={step.status==="running"?"step":undefined}'));assert(shared.includes('step.status==="complete"?Check'));
});
test('live roulette acceptance is opt-in, stdin-only, inference-blocked and owner-scoped',()=>{
 const source=readFileSync('tests/roulette-live.mjs','utf8'),launcher=readFileSync('scripts/test-roulette-live.ps1','utf8');
 assert(source.includes("process.argv.includes('--run-live')"));assert(source.includes('for await(const chunk of process.stdin)'));assert(source.includes('Inference forbidden in acceptance'));assert(!source.includes('service_role'));
 assert(source.includes("action:'saveRoulette'"));assert(source.includes('RETRY_REQUIRED'));assert(launcher.includes('-AsSecureString'));assert(launcher.includes('ZeroFreeBSTR'));
});
