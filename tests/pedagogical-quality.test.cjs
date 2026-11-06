/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {quiz,analysis,document}=require('./content-fixture.cjs');
const {QuizQualityValidator,validateQuiz,generationState,syncBlueprint}=require('../src/lib/content/quality.ts');
const {createBlueprint,describeSlot,summarizeBlueprint,reviseTeacherQuestion}=require('../src/lib/content/blueprint.ts');
const {regenerate,buildEducationalQuiz}=require('../src/lib/content/pipeline.server.ts');
const {cognitiveSignals}=require('../src/lib/content/quality-heuristics.ts');
const clone=()=>structuredClone(quiz),has=(result,code,severity)=>result.issues.some(i=>i.code===code&&(!severity||i.severity===severity));
const align=q=>{q.blueprint=summarizeBlueprint(q.questions.map((item,i)=>describeSlot(q.analysis,{conceptId:item.concept,objectiveId:item.learningObjective,cognitiveLevel:item.cognitiveLevel,difficulty:item.difficulty},item.id,i,item.sourceFragmentIds)),q.blueprint.coverageMode);return q;};

test('quiz validator exposes dimensions, PASS/WARNING/BLOCKING and a heuristic score',()=>{
  const result=new QuizQualityValidator().evaluate(quiz);assert.equal(result.valid,true);assert.equal(result.scoreMeaning,'engineering-heuristic');assert.ok(result.score>=0&&result.score<=100);assert.equal(result.dimensions.grounding.status,'PASS');assert.equal(result.questions.length,3);assert.ok(result.issues.every(i=>['WARNING','BLOCKING'].includes(i.severity)));
  const malformed=validateQuiz({questions:[]});assert.equal(malformed.status,'BLOCKING');assert.equal(malformed.dimensions.cognition.evaluated,false);assert.equal(malformed.dimensions.cognition.score,null);
});
test('duplicate concept plus source blocks even when stems differ and labels differ',()=>{
  const q=clone();Object.assign(q.questions[2],{concept:q.questions[0].concept,learningObjective:q.questions[0].learningObjective,sourceFragmentIds:q.questions[0].sourceFragmentIds,sourceReferences:q.questions[0].sourceReferences});align(q);
  const result=validateQuiz(q);assert.ok(has(result,'duplicate_concept_source','BLOCKING'));assert.equal(generationState(q).enabled,false);assert.equal(result.questions[0].status,'BLOCKING');
});
test('paraphrased questions with the same evidence, task and answer cannot evade duplication through different concept IDs',()=>{
  const q=clone();q.questions[1].stem='De que manera contribuye la energia solar a que una planta obtenga nutrientes?';q.questions[1].options[0].text=q.questions[0].options[0].text;q.questions[1].sourceFragmentIds=q.questions[0].sourceFragmentIds;q.questions[1].sourceReferences=q.questions[0].sourceReferences;align(q);
  assert.ok(has(validateQuiz(q),'semantic_duplicate','BLOCKING'));
});
test('explicit depth permits concept repetition only with different sources, levels and perspectives',()=>{
  const q=clone();q.blueprint.coverageMode='depth';q.analysis.keyConcepts[0].text='Procesos biologicos y diversidad';q.analysis.keyConcepts[0].sourceFragmentIds.push(q.questions[2].sourceFragmentIds[0]);q.analysis.keyConcepts[0].sourceReferences.push(q.questions[2].sourceReferences[0]);q.questions[2].concept=q.questions[0].concept;align(q);
  assert.equal(validateQuiz(q).valid,true);assert.ok(has(validateQuiz(q),'concept_repetition','WARNING'));
  q.blueprint.coverageMode='breadth';assert.ok(has(validateQuiz(q),'concept_repetition','BLOCKING'));
  q.analysis.keyConcepts=q.analysis.keyConcepts.slice(0,2);assert.equal(validateQuiz(q).valid,true);
});
test('recognition mislabeled analysis is a warning that does not prevent export',()=>{
  const q=clone();q.questions[2].stem='Que es la biodiversidad en un ecosistema?';
  const result=validateQuiz(q);assert.ok(has(result,'cognitive_alignment','WARNING'));assert.equal(result.valid,true);assert.equal(generationState(q).enabled,true);assert.equal(result.questions[2].inferredCognitiveLevel,'remember');
});
test('concrete application and causal analysis signals differ from recognition',()=>{
  assert.equal(cognitiveSignals('Una tienda necesita reducir errores de busqueda. Que tecnica deberia utilizar?').inferred,'application');
  assert.equal(cognitiveSignals('Dos ecosistemas muestran distinta estabilidad tras perder especies. Que relacion explica la diferencia y que consecuencia cabe inferir?').inferred,'analysis');
  assert.equal(cognitiveSignals('Which definition corresponds to biodiversity?').inferred,'remember');
  assert.equal(cognitiveSignals('Un negocio electronico observa que se abandonan carritos antes del pago. Que accion puede implementar para mitigar este problema?').inferred,'application');
  assert.equal(cognitiveSignals('Un negocio electronico amplia su catalogo de productos. Que estructura permite localizar rapidamente productos sin sobrecarga?').inferred,'application');
});
test('unrelated, arbitrary and unequal distractors produce review warnings',()=>{
  const q=clone();q.questions[0].options[1].text='Pintar las paredes del edificio cada seis meses para celebrar las ventas.';
  const result=validateQuiz(q);assert.ok(has(result,'distractor_domain','WARNING'));assert.equal(result.valid,true);
});
test('unsupported thresholds and disregard for learner needs are review cues, not automatic blockers',()=>{
  const q=clone();q.questions[0].options[1].text='El diseno debe priorizar colores sin importar el contenido.';q.questions[0].options[2].text='La busqueda permite palabras de tres letras o menos.';
  const result=validateQuiz(q);assert.ok(has(result,'implausible_distractor','WARNING'));assert.equal(result.valid,true);
});
test('near-equivalent options warn while duplicate options and answer leaks block',()=>{
  const q=clone();q.questions[0].options[1].text=q.questions[0].options[0].text+' normalmente';
  assert.ok(has(validateQuiz(q),'equivalent_options','WARNING'));assert.ok(has(validateQuiz(q),'answer_leak','BLOCKING'));
  q.questions[0].options[1].text=q.questions[0].options[0].text;assert.ok(has(validateQuiz(q),'duplicate_options','BLOCKING'));
});
test('source overconcentration warns without forcing different pages',()=>{
  const q=clone();const source=q.sources[0];
  q.questions=q.questions.map(item=>({...item,sourceFragmentIds:[source.id],sourceReferences:[{fragmentId:source.id,page:source.page,quote:source.text}]}));
  // Keep other relevant sources in the plan but allow the selected passage.
  q.blueprint.slots=q.blueprint.slots.map(s=>({...s,allowedSourceFragmentIds:[...new Set([...s.allowedSourceFragmentIds,source.id])]}));
  const result=validateQuiz(q);assert.ok(has(result,'source_concentration','WARNING'));assert.equal(result.valid,true);
  assert.ok(!validateQuiz(quiz).issues.some(i=>i.code==='source_concentration'));
});
test('blueprint controls concept, levels, difficulty and allowed sources; sync cannot launder a model response',()=>{
  const q=clone(),before=structuredClone(q.blueprint.slots[0]);q.questions[0].concept=q.questions[1].concept;q.questions[0].cognitiveLevel='remember';
  const synced=syncBlueprint(q);assert.deepEqual(synced.blueprint.slots[0],before);assert.ok(has(validateQuiz(synced),'blueprint_slot','BLOCKING'));
  const changed=reviseTeacherQuestion(quiz,{...quiz.questions[0],cognitiveLevel:'remember'});assert.equal(changed.blueprint.slots[0].cognitiveLevel,'remember');
});
test('a real source outside the assigned slot is still blocking and reused canonical options retain an optional improvement',()=>{
  const q=clone();q.questions[0].sourceFragmentIds=q.questions[1].sourceFragmentIds;q.questions[0].sourceReferences=q.questions[1].sourceReferences;
  assert.ok(has(validateQuiz(q),'blueprint_slot','BLOCKING'));
  const another=clone();another.questions[1].options[1].text=another.questions[0].options[1].text;assert.ok(has(validateQuiz(another),'option_reuse','INFO'));
});
test('five distinct grounded concepts are assigned when available; repetition reserves different evidence',()=>{
  const expanded=structuredClone(analysis);for(let i=4;i<=5;i++)expanded.keyConcepts.push({...expanded.keyConcepts[0],id:`c${i}`,text:`Concepto distinto ${i}`});
  const plan=createBlueprint(expanded,5);assert.equal(new Set(plan.slots.map(s=>s.conceptId)).size,5);assert.ok(plan.slots.every(s=>s.allowedSourceFragmentIds.length));
  expanded.keyConcepts=expanded.keyConcepts.slice(0,2);expanded.keyConcepts[0].sourceFragmentIds.push(document.fragments[2].id);
  const repeated=createBlueprint(expanded,3);assert.notDeepEqual(repeated.slots[0].allowedSourceFragmentIds,repeated.slots[2].allowedSourceFragmentIds);assert.notEqual(repeated.slots[0].cognitiveLevel,repeated.slots[2].cognitiveLevel);
});
test('only explicit single-question regeneration calls the model and preserves its immutable slot',async()=>{
  const slot=quiz.blueprint.slots[0];let calls=0;
  const provider={analyzeDocument(){throw new Error('No analysis allowed');},generateQuiz(){throw new Error('No batch generation allowed');},async regenerateQuestion(input){calls++;assert.equal(input.blueprint.slots.length,1);assert.deepEqual(input.blueprint.slots[0],slot);assert.ok(input.sources.every(s=>slot.allowedSourceFragmentIds.includes(s.id)));assert.ok(input.sources.length<document.fragments.length);assert.equal(input.existingQuestions.length,1);return quiz.questions[0];}};
  const existing=[{id:'q2',concept:'c2',conceptLabel:'Respiracion',stem:quiz.questions[1].stem,cognitiveLevel:'application',sourceFragmentIds:quiz.questions[1].sourceFragmentIds}];
  const originalRegenerate=provider.regenerateQuestion;
  provider.regenerateQuestion=async input=>{assert.deepEqual(input.blueprint,summarizeBlueprint([slot]));return originalRegenerate(input);};
  const result=await regenerate(document,analysis,slot,'q1',quiz.questions.map(q=>q.stem),provider,existing);assert.equal(result.question.id,'q1');assert.equal(calls,1);
  provider.regenerateQuestion=async()=>({...quiz.questions[0],concept:'c2'});await assert.rejects(regenerate(document,analysis,slot,'q1',[],provider),/cambi/);
});
test('an impossible repeated concept/source plan is rejected before any regeneration inference',async()=>{
  let calls=0;const provider={async regenerateQuestion(){calls++;return quiz.questions[0];}};
  const repeated=[{id:'other',concept:quiz.questions[0].concept,conceptLabel:'Repeated',stem:'Existing question',cognitiveLevel:'application',sourceFragmentIds:quiz.questions[0].sourceFragmentIds}];
  await assert.rejects(regenerate(document,analysis,quiz.blueprint.slots[0],'q1',[],provider,repeated),/plan ya repite/);assert.equal(calls,0);
});
test('generation surfaces a wrong assigned concept as blocking without another inference',async()=>{
  let calls=0;const questions=structuredClone(quiz.questions);questions[0].concept='c2';
  const provider={async generateQuiz(){calls++;return questions;}};
  const result=await buildEducationalQuiz(document,analysis,{title:quiz.title,count:3,scored:true},provider);assert.ok(has(validateQuiz(result),'blueprint_slot','BLOCKING'));assert.equal(calls,1);
});
test('warnings export successfully, while structural/grounding failures remain blocked',()=>{
  const {packageSCORM}=require('../src/lib/scorm/package.ts');assert.equal(validateQuiz(quiz).status,'WARNING');assert.ok(packageSCORM(quiz).length>0);
  const q=clone();q.questions[0].correctOptionId='z';assert.equal(generationState(q).enabled,false);assert.throws(()=>packageSCORM(q));
});
