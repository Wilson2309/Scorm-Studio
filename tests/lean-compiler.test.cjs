/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {analyzeDocumentDeterministically}=require('../src/lib/content/deterministic-analysis.server.ts');
const {buildHybridPlan}=require('../src/lib/content/hybrid-plan.ts');
const {buildLeanHybridContext,leanPromptData,leanOutputSchema,assembleLeanQuestions,precompileSlots,selectDistractors,replaceInvalidDistractors}=require('../src/lib/content/lean-question-compiler.ts');
const {generateHybridQuiz,regenerateHybridQuestion}=require('../src/lib/content/hybrid-pipeline.server.ts');
const {OllamaContentIntelligenceProvider,OLLAMA_DEFAULTS,ollamaConfig}=require('../src/lib/content/ollama-provider.server.ts');
const {extracted}=require('./content-fixture.cjs');
const prepared=analyzeDocumentDeterministically(extracted),plan=buildHybridPlan(prepared,3),input=buildLeanHybridContext(prepared,plan);
const wording=value=>({questions:value.leanContext.slots.map(s=>({slotId:s.slot.slotId,stem:`¿Cómo se interpreta la función descrita en esta evidencia: ${s.canonicalEvidence.slice(0,100)}?`,explanation:`La fuente vincula ${s.correctAnswer.text} con la función descrita en la situación.`}))});
const config={...OLLAMA_DEFAULTS,provider:'ollama',model:'qwen3:4b-instruct',fallbackModel:'qwen2.5:3b',numCtx:8192};
const native=(respond,logs=[])=>new OllamaContentIntelligenceProvider(config,async(url,init)=>Response.json({model:config.model,message:{content:JSON.stringify(respond(JSON.parse(init.body)))},done:true,done_reason:'stop'}),undefined,e=>logs.push(e));

test('precompiled answer is canonical, fixed before inference, and has learning/cognitive/source assignments',()=>{
 const slots=precompileSlots(prepared,plan);assert.deepEqual(slots,precompileSlots(prepared,plan));
 for(const s of slots){assert.ok(s.slot.targetLearningObjective&&s.slot.questionFamily&&s.slot.difficulty);assert.ok(s.allowedCognitiveLevels.includes(s.requestedCognitiveLevel));assert.equal(s.correctAnswer.id,s.slot.conceptId);assert.ok(s.correctAnswer.sourceFragmentIds.every(id=>prepared.document.fragments.some(f=>f.id===id&&f.normalizedText.includes(s.correctAnswer.text))));}
});
test('model cannot supply options, sources, answer identity or metadata in lean output',()=>{
 for(const field of ['correctOptionId','options','concept','sourceFragmentIds','difficulty','cognitiveLevel','blueprint']){
  const value=wording(input);value.questions[0][field]='invented';assert.equal(leanOutputSchema(3).safeParse(value).success,false,field);
 }
});
test('distractor selection is deterministic, unique, sourced and excludes answer aliases and administration',()=>{
 const target=prepared.candidates[0],pool=selectDistractors(target,prepared);assert.deepEqual(pool,selectDistractors(target,prepared));assert.ok(pool.length>=3);assert.equal(new Set(pool.map(d=>d.text)).size,pool.length);assert.ok(!pool.some(d=>d.text.includes(target.name)||/UNIVERSIDAD/.test(d.text)));assert.ok(pool.every(d=>d.sourceFragmentIds.every(id=>prepared.document.fragments.some(f=>f.id===id&&f.contentType==='academic'))));
});
test('literal parenthetical synonyms in the canonical source cannot become distractors',()=>{
 const p=structuredClone(prepared),target=p.candidates[0],f=p.document.fragments.find(f=>target.sourceFragmentIds.includes(f.id));
 f.normalizedText=f.normalizedText.replace(target.name,`${target.name} (Estructuras energéticas)`);p.candidates.push({...target,id:'alias',name:'Estructuras energéticas'});
 assert.ok(!selectDistractors(target,p).some(c=>c.id==='alias'));
});
test('insufficient domain candidates and invented canonical answers stop before any inference',async()=>{
 const invalid=structuredClone(prepared);invalid.candidates=invalid.candidates.slice(0,1);invalid.document.fragments=invalid.document.fragments.filter(f=>invalid.candidates[0].sourceFragmentIds.includes(f.id));assert.throws(()=>precompileSlots(invalid,{...plan,blueprint:{...plan.blueprint,slots:[plan.blueprint.slots[0]]}}),/alternativas/);
 const forged=structuredClone(prepared);forged.candidates[0].name='Concepto inventado';forged.analysis.keyConcepts.find(c=>c.id===forged.candidates[0].id).text='Concepto inventado';let calls=0;await assert.rejects(generateHybridQuiz(forged,{title:'No inventions',count:3,scored:true},{async generateQuiz(){calls++;return [];}}));assert.equal(calls,0);
});
test('local distractor replacement uses a reserve, with zero provider calls',()=>{
 const s=structuredClone(input.leanContext.slots[0]);s.reserves=[{id:'reserve',text:'Otro proceso cercano',sourceFragmentIds:s.correctAnswer.sourceFragmentIds}];const result=replaceInvalidDistractors(s,`El caso menciona ${s.distractors[0].text}. ¿Qué corresponde?`);assert.equal(result[0].id,'reserve');assert.equal(s.distractors[0].id,input.leanContext.slots[0].distractors[0].id);
});
test('local shuffling retains the correct identity and avoids a constant correct-position pattern',()=>{
 const output=assembleLeanQuestions(wording(input),input,()=>.41);assert.equal(new Set(output.map(q=>q.correctOptionId)).size,3);
 output.forEach((q,i)=>{assert.equal(q.options.find(o=>o.id===q.correctOptionId).text,input.leanContext.slots[i].correctAnswer.text);assert.equal(new Set(q.options.map(o=>o.text)).size,4);assert.deepEqual(q.sourceFragmentIds,plan.blueprint.slots[i].allowedSourceFragmentIds);});
 assert.notDeepEqual(assembleLeanQuestions(wording(input),input,()=>.99).map(q=>q.correctOptionId),assembleLeanQuestions(wording(input),input,()=>0).map(q=>q.correctOptionId));
});
test('strict merge rejects missing/unknown/duplicate slots and partial or oversized wording',()=>{
 for(const edit of [v=>v.questions[0].slotId='q1',v=>v.questions.pop(),v=>v.questions[1].slotId=v.questions[0].slotId,v=>v.questions[0].stem='a'.repeat(421),v=>v.questions[0].explanation='a'.repeat(241)]){const value=wording(input);edit(value);assert.throws(()=>assembleLeanQuestions(value,input));}
 const reordered=wording(input);reordered.questions.reverse();assert.deepEqual(assembleLeanQuestions(reordered,input).map(q=>q.id),plan.blueprint.slots.map(s=>s.questionId));
});
test('compact context excludes full analysis, catalogue and PDF while retaining selected evidence once',()=>{
 const data=leanPromptData(input),serialized=JSON.stringify(data);assert.equal(data.evidence.length,3);assert.equal(data.slots.length,3);assert.ok(!serialized.includes('sourceReferences'));assert.ok(!serialized.includes('UNIVERSIDAD'));assert.ok(!serialized.includes('importanceScore'));assert.ok(!serialized.includes('correctOptionId'));assert.ok(!serialized.includes(extracted.text));
});
test('native lean operation uses dedicated context, proportional output budget, conservative temperature and one request',async()=>{
 let calls=0;const logs=[];const p=native(body=>{calls++;assert.equal(body.options.num_ctx,4096);assert.equal(body.options.num_predict,540);assert.equal(body.options.temperature,.1);assert.equal(body.keep_alive,'10m');assert.deepEqual(Object.keys(body.format.$defs.__schema0.properties).sort(),['explanation','slotId','stem']);return wording(input);},logs);await p.generateQuiz(input);assert.equal(calls,1);assert.equal(logs[0].requestedContext,4096);assert.equal(logs[0].outputBudget,540);assert.equal(config.numCtx,8192);
});
test('lean context settings are configurable without changing global context',()=>{
 const names=['AI_PROVIDER','AI_BASE_URL','AI_MODEL','OLLAMA_NUM_CTX','OLLAMA_LEAN_NUM_CTX','AI_LEAN_MAX_TOKENS'];const old=Object.fromEntries(names.map(n=>[n,process.env[n]]));try{Object.assign(process.env,{AI_PROVIDER:'ollama',AI_BASE_URL:'http://127.0.0.1:11435',AI_MODEL:'qwen3:4b-instruct',OLLAMA_NUM_CTX:'8192',OLLAMA_LEAN_NUM_CTX:'4096',AI_LEAN_MAX_TOKENS:'800'});const c=ollamaConfig();assert.equal(c.numCtx,8192);assert.equal(c.leanNumCtx,4096);assert.equal(c.leanTokens,800);}finally{for(const n of names){if(old[n]===undefined)delete process.env[n];else process.env[n]=old[n];}}
});
test('five slots have a 900-token ceiling; longer evidence retains the larger global context',async()=>{
 const five=structuredClone(input);five.leanContext.slots=Array.from({length:5},(_,i)=>({...input.leanContext.slots[i%3],slot:{...input.leanContext.slots[i%3].slot,slotId:`slot-${i+1}`,questionId:`q${i+1}`}}));
 await native(body=>{assert.equal(body.options.num_predict,900);assert.equal(body.options.num_ctx,4096);return wording(five);}).generateQuiz(five);
 const larger=structuredClone(input);larger.leanContext.slots[0].canonicalEvidence='Evidencia académica suficientemente extensa. '.repeat(170);
 await native(body=>{assert.equal(body.options.num_ctx,8192);return wording(larger);}).generateQuiz(larger);
});
test('normal flow owns answer identity and uses one inference, no analysis/repair/fallback',async()=>{
 let calls=0;const p=native(()=>{calls++;return wording(input);});p.analyzeDocument=()=>{throw new Error('Forbidden');};const quiz=await generateHybridQuiz(prepared,{title:'Lean quiz',count:3,scored:true},p);assert.equal(calls,1);assert.equal(quiz.questions.length,3);
 await assert.rejects(generateHybridQuiz(prepared,{title:'Forged answer',count:3,scored:true},{async generateQuiz(value){const q=assembleLeanQuestions(wording(value),value);q[0].correctOptionId=q[0].options.find(o=>o.id!==q[0].correctOptionId).id;return q;}}),/respuestas preparadas/);
});
test('malformed JSON and truncated output never trigger a second lean inference',async()=>{
 for(const content of ['{',JSON.stringify({questions:[{slotId:'slot-1',stem:'Incomplete'}]})]){let calls=0;const p=new OllamaContentIntelligenceProvider(config,async()=>{calls++;return Response.json({model:config.model,message:{content},done:true,done_reason:'length'});},undefined,()=>{});await assert.rejects(p.generateQuiz(input));assert.equal(calls,1);}
});
test('explicit regeneration is one compact writing call and preserves the deterministic assignment',async()=>{
 let calls=0;const slot=plan.blueprint.slots[0];const p={async regenerateQuestion(value){calls++;assert.equal(value.leanContext.slots.length,1);assert.equal(value.sources.length,1);return assembleLeanQuestions(wording(value),value)[0];}};const result=await regenerateHybridQuestion(prepared,slot,[],p);assert.equal(calls,1);assert.equal(result.question.concept,slot.conceptId);assert.equal(result.question.options.find(o=>o.id===result.question.correctOptionId).text,input.leanContext.slots[0].correctAnswer.text);
});
test('short canonical options still block an explicit contradictory answer declaration',()=>{
 const q=assembleLeanQuestions(wording(input),input)[0],wrong=q.options.find(o=>o.id!==q.correctOptionId);q.explanation=`La respuesta correcta es ${wrong.text}, porque corresponde al proceso descrito.`;
 const hints=require('../src/lib/content/option-quality.ts').optionQualityHints(q,input.leanContext.slots[0].canonicalEvidence,'Biología');assert.ok(hints.some(h=>h.code==='answer_explanation_conflict'&&h.blocking));
 q.explanation=`La respuesta no es ${wrong.text}; hay que contrastar su función con la fuente.`;assert.ok(!require('../src/lib/content/option-quality.ts').optionQualityHints(q,'','').some(h=>h.code==='answer_explanation_conflict'));
});
