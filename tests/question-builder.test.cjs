/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {quiz,analysis,document}=require('./content-fixture.cjs');
const {buildConceptPool,buildConstructionGuides,COGNITIVE_TEMPLATES}=require('../src/lib/content/question-builder.ts');
const {compilePedagogicalQuiz}=require('../src/lib/content/pedagogical-compiler.ts');
const {cognitiveDecisions}=require('../src/lib/content/cognitive-normalization.ts');
const {cognitiveSignals}=require('../src/lib/content/quality-heuristics.ts');
const {optionQualityHints}=require('../src/lib/content/option-quality.ts');
const {describeSlot,summarizeBlueprint}=require('../src/lib/content/blueprint.ts');
const {buildEducationalQuiz}=require('../src/lib/content/pipeline.server.ts');
const clone=()=>structuredClone(quiz);
const plan=q=>{q.blueprint=summarizeBlueprint(q.questions.map((item,i)=>describeSlot(q.analysis,{conceptId:item.concept,objectiveId:item.learningObjective,cognitiveLevel:item.cognitiveLevel,difficulty:item.difficulty},item.id,i,item.sourceFragmentIds)));return q;};
const has=(r,code)=>r.quality.issues.some(i=>i.code===code);

test('concept pool is deterministic, source-owned and excludes administrative and wrong-document terms',()=>{
  const sources=structuredClone(document.fragments);sources[0].text+='\nMétodo Solar (Prueba Celular): interpreta energía y nutrientes.';
  sources.push({...sources[0],id:'p1-f999',contentType:'administrative',text:'Universidad Ejemplo: Sede Centro'});
  sources.push({...sources[0],id:'p1-f998',documentId:'f'.repeat(64),text:'Método Extranjero: no pertenece'});
  const pool=buildConceptPool(analysis,sources);assert.deepEqual(pool,buildConceptPool(analysis,sources));assert.ok(pool.some(p=>p.category==='method'));assert.ok(pool.every(p=>p.sourceFragmentIds.length));assert.ok(!pool.some(p=>/Universidad|Extranjero/.test(p.label)));
});
test('distractor guides use a conceptual neighborhood rather than a random pool',()=>{
  const slot=quiz.blueprint.slots[0],pool=[{id:'near',label:'Nutrientes y energía solar',category:'process',sourceFragmentIds:slot.allowedSourceFragmentIds},{id:'far',label:'Arquitectura de pagos financieros',category:'process',sourceFragmentIds:[document.fragments[1].id]}];
  const sources=document.fragments.map((s,i)=>({...s,sectionHeading:i===0?'Plantas':'Otro ámbito'}));
  const [guide]=buildConstructionGuides([slot],pool,sources);assert.deepEqual(guide.alternatives.map(a=>a.id),['near']);assert.equal(guide.style,'distinction');assert.equal(buildConstructionGuides([slot],[pool[1]],sources)[0].alternatives.length,0);
});
test('templates require construction features, not just a verb',()=>{
  assert.match(COGNITIVE_TEMPLATES.analysis,/dos factores|varios factores/);assert.match(COGNITIVE_TEMPLATES.application,/problema concreto/);
  assert.equal(cognitiveSignals('Qué es Card Sorting?').inferred,'remember');
  assert.equal(cognitiveSignals('Una tienda necesita reducir errores de búsqueda. Qué técnica debería utilizar?').inferred,'application');
  assert.equal(cognitiveSignals('Una tienda observa fallos porque las categorías reflejan departamentos internos, pero los clientes buscan por uso. Qué causa explica la diferencia y qué consecuencia cabe inferir?').inferred,'analysis');
});
test('direct recognition cannot become accepted ANALYZE through compiler metadata',()=>{
  const q=clone();q.questions[2].stem='¿Qué opción define la biodiversidad de un ecosistema?';
  const r=compilePedagogicalQuiz(q);assert.equal(r.quiz.questions[2].actualCognitiveLevel,'remember');assert.equal(r.quiz.questions[2].requestedCognitiveLevel,'analysis');assert.ok(has(r,'cognitive_alignment'));assert.equal(r.quality.status,'WARNING');
});
test('ANALYZE and APPLY scenarios remain unchanged when the actual task matches',()=>{
  const q=clone();q.questions[2].stem='Dos ecosistemas muestran distinta estabilidad tras perder especies. ¿Qué relación explica la diferencia y qué consecuencia cabe inferir?';
  const r=compilePedagogicalQuiz(q);assert.equal(r.quiz.questions[2].actualCognitiveLevel,'analysis');assert.equal(r.quiz.questions[1].actualCognitiveLevel,'application');assert.ok(!has(r,'cognitive_normalized'));
});
test('safe single-step cognitive downgrade records requested and actual without revising slots',()=>{
  const q=clone();q.questions[0].cognitiveLevel='analysis';q.questions[0].stem='Una planta necesita obtener nutrientes usando energía solar. ¿Qué proceso debería utilizar?';
  q.questions[2].stem='Dos ecosistemas muestran distinta estabilidad tras perder especies. ¿Qué relación explica la diferencia y qué consecuencia cabe inferir?';plan(q);
  const r=compilePedagogicalQuiz(q);assert.equal(r.quiz.questions[0].cognitiveLevel,'application');assert.equal(r.quiz.questions[0].requestedCognitiveLevel,'analysis');assert.equal(r.quiz.questions[0].actualCognitiveLevel,'application');assert.equal(r.quiz.blueprint.slots[0].cognitiveLevel,'analysis');assert.ok(has(r,'cognitive_normalized'));assert.equal(r.quality.blockingCount,0);assert.deepEqual(compilePedagogicalQuiz(r.quiz),r);
});
test('downgrade conflict preserves requested distribution and requests explicit regeneration',()=>{
  const q=clone();q.questions[2].stem='Un ecosistema necesita conservar su estabilidad. ¿Qué estrategia debería utilizar para mantener la diversidad?';
  const r=compilePedagogicalQuiz(q);assert.equal(r.quiz.questions[2].cognitiveLevel,'analysis');assert.equal(r.quiz.questions[2].actualCognitiveLevel,'application');assert.ok(has(r,'cognitive_distribution_conflict'));assert.equal(r.quality.blockingCount,0);
});
test('APPLY may become UNDERSTAND only with a positive interpretation signature and remaining coverage',()=>{
  const q=clone();q.questions[0].cognitiveLevel='application';q.questions[0].stem='¿Cómo contribuye la energía solar a la obtención de nutrientes en una planta?';q.questions[1].stem='Una célula necesita obtener energía para sostener sus funciones. ¿Qué proceso debería utilizar?';plan(q);
  const r=compilePedagogicalQuiz(q);assert.equal(r.quiz.questions[0].cognitiveLevel,'comprehension');assert.equal(r.quiz.questions[0].requestedCognitiveLevel,'application');assert.equal(cognitiveDecisions(r.quiz)[0].downgraded,true);
});
test('obvious distractors, option wording advantage and length imbalance warn in teacher language',()=>{
  const q=clone();q.questions[0].options.slice(1).forEach((o,i)=>o.text=['Siempre ignorar todo.','Eliminar todos los datos.','Nunca realizar el proceso.'][i]);
  q.questions[0].options[0].text=document.fragments[0].text;
  const r=compilePedagogicalQuiz(q);assert.ok(has(r,'obvious_distractors'));assert.ok(has(r,'verbatim_answer_cue'));assert.ok(has(r,'option_lengths'));assert.ok(r.quality.issues.some(i=>/demasiado fáciles/.test(i.message)));assert.equal(r.quality.blockingCount,0);
});
test('similar options identify the letters and questionable correctness stays visible',()=>{
  const q=clone();q.questions[0].options[1].text='Conservar nutrientes y aprovechar energía solar para sostener funciones vegetales.';q.questions[0].options[2].text='Aprovechar energía solar y conservar nutrientes para sostener funciones vegetales normalmente.';
  const hints=optionQualityHints(q.questions[0],document.fragments[0].text,analysis.summary);assert.ok(hints.some(i=>/B y C/.test(i.message)));assert.ok(hints.every(i=>!/threshold|schema|heuristic/i.test(i.message)));
});
test('compiler never normalizes malformed answers or unknown grounding, and forged records are blocking',()=>{
  const q=clone();q.questions[0].correctOptionId='z';const r=compilePedagogicalQuiz(q);assert.equal(r.quality.status,'BLOCKING');assert.equal(r.quiz.questions[0].actualCognitiveLevel,undefined);
  const bad=clone();bad.questions[0].sourceFragmentIds=['p99-f999'];assert.equal(compilePedagogicalQuiz(bad).quality.status,'BLOCKING');
  const forged=clone();forged.questions[0].requestedCognitiveLevel='analysis';forged.questions[0].actualCognitiveLevel='remember';assert.ok(has(compilePedagogicalQuiz(forged),'cognitive_record'));
});
test('a marked answer contradicting a near-verbatim source-backed explanation blocks without auto-correcting',()=>{
  const q=clone();q.questions[0].options[0].text=document.fragments[0].text;q.questions[0].options[1].text='Pintar las paredes del edificio con colores brillantes.';q.questions[0].correctOptionId='b';q.questions[0].explanation=document.fragments[0].text;
  const r=compilePedagogicalQuiz(q);assert.ok(has(r,'answer_explanation_conflict'));assert.equal(r.quality.status,'BLOCKING');assert.equal(r.quiz.questions[0].correctOptionId,'b');
  q.questions[0].explanation='La alternativa A no es correcta porque omite una condición del caso.';assert.ok(!has(compilePedagogicalQuiz(q),'answer_explanation_conflict'));
});
test('a strategy combination in a short scenario is application, not analysis',()=>{
  const q=clone();q.questions[2].stem='Un negocio observa que se abandona la página antes de comprar. ¿Qué combinación de elementos puede ayudar a aumentar la conversión?';
  const d=cognitiveDecisions(q)[2];assert.equal(d.actual,'application');assert.equal(d.conflict,true);
});
test('normal generation supplies construction guides in the existing single model call',async()=>{
  let calls=0;const provider={async generateQuiz(input){calls++;assert.equal(input.constructionGuides.length,3);assert.ok(input.constructionGuides.every(g=>g.template&&g.questionId));return structuredClone(quiz.questions);}};
  const r=await buildEducationalQuiz(document,analysis,{title:quiz.title,count:3,scored:true},provider);assert.equal(calls,1);assert.ok(r.questions.every(q=>q.requestedCognitiveLevel&&q.actualCognitiveLevel));
});
