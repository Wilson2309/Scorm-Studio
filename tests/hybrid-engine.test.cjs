/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {extracted,quiz}=require('./content-fixture.cjs');
const {analyzeDocumentDeterministically,rankAcademicFragments,detectSourceRelations,selectQuestionTargets}=require('../src/lib/content/deterministic-analysis.server.ts');
const {buildHybridPlan,relatedCandidates,createManualQuiz}=require('../src/lib/content/hybrid-plan.ts');
const {buildCompactHybridContext}=require('../src/lib/content/hybrid-context.ts');
const {generateHybridQuiz,regenerateHybridQuestion}=require('../src/lib/content/hybrid-pipeline.server.ts');
const {validateQuiz}=require('../src/lib/content/quality.ts');
const {resolveSourceIds}=require('../src/lib/content/grounding.ts');
const {OllamaContentIntelligenceProvider,OLLAMA_DEFAULTS}=require('../src/lib/content/ollama-provider.server.ts');
const {OpenAICompatibleProvider}=require('../src/lib/content/provider.server.ts');
const {DocumentSession}=require('../src/lib/content/document-session.ts');
const prepared=analyzeDocumentDeterministically(extracted),plan=buildHybridPlan(prepared,3),input=buildCompactHybridContext(prepared,plan);
function questions(input){const drafts=input.blueprint.slots.map(s=>{const source=input.sources.find(f=>s.allowedSourceFragmentIds.includes(f.id));const index=/fotosíntesis/i.test(source.text)?0:/mitocondria/i.test(source.text)?1:2;return {...quiz.questions[index],id:s.questionId,slotId:s.slotId,questionFamily:s.questionFamily,concept:s.conceptId,learningObjective:s.objectiveId,cognitiveLevel:s.cognitiveLevel,difficulty:s.difficulty,documentId:prepared.document.documentId,sourceFragmentIds:s.allowedSourceFragmentIds,sourceReferences:resolveSourceIds(s.allowedSourceFragmentIds,input.sources,prepared.document.documentId)};});return input.leanContext?require('../src/lib/content/lean-question-compiler.ts').assembleLeanQuestions({questions:drafts.map(q=>({slotId:q.slotId,stem:q.stem,explanation:q.explanation.slice(0,240)}))},input):drafts;}
const wire=q=>({slotId:q.slotId,concept:q.concept,questionFamily:q.questionFamily,cognitiveLevel:q.cognitiveLevel,stem:q.stem,options:q.options,correctOptionId:q.correctOptionId,explanation:q.explanation,sourceFragmentIds:q.sourceFragmentIds});
const config={...OLLAMA_DEFAULTS,provider:'ollama',model:'qwen3:4b-instruct',fallbackModel:'qwen2.5:3b',timeoutMs:1000,numCtx:8192};

test('deterministic importance is repeatable and penalizes administrative and diagram content',()=>{
 assert.deepEqual(rankAcademicFragments(prepared.document),rankAcademicFragments(prepared.document));assert.ok(prepared.ranking.filter(r=>prepared.document.excluded.some(f=>f.id===r.fragmentId)).every(r=>r.score===0));assert.ok(prepared.ranking.some(r=>r.score>0&&r.signals.tfidf>0));
});
test('candidate extraction retains source identity, definitions, pages and excludes institution metadata',()=>{
 assert.equal(prepared.candidates.length,3);assert.ok(prepared.candidates.some(c=>/fotosíntesis/i.test(c.name)));assert.ok(prepared.candidates.every(c=>c.sourceFragmentIds.length&&c.pages.length&&c.type&&Number.isFinite(c.importanceScore)));assert.ok(!JSON.stringify(prepared.candidates).includes('UNIVERSIDAD'));
});
test('literal relation detection does not invent facts or use administrative fragments',()=>{
 const doc=structuredClone(prepared.document);doc.fragments[0].text=doc.fragments[0].normalizedText='La fotosíntesis reduce el consumo de reservas. La respiración depende de nutrientes.';
 const relations=detectSourceRelations(doc);assert.equal(relations[0].predicate,'reduces');assert.equal(relations[1].predicate,'depends_on');assert.ok(relations.every(r=>doc.fragments.some(f=>r.sourceFragmentIds.includes(f.id)&&f.normalizedText.includes(r.text))));
});
test('target and blueprint selection are distinct, sourced and avoid forced analysis',()=>{
 const targets=selectQuestionTargets(prepared.candidates,3);assert.equal(new Set(targets.map(t=>t.id)).size,3);assert.equal(new Set(targets.flatMap(t=>t.sourceFragmentIds)).size,3);
 assert.deepEqual(buildHybridPlan(prepared,3),plan);assert.ok(plan.blueprint.slots.every(s=>s.slotId&&s.questionFamily&&s.allowedSourceFragmentIds.length));assert.ok(!plan.blueprint.slots.some(s=>s.cognitiveLevel==='analysis'));assert.throws(()=>buildHybridPlan(prepared,5),/no contiene suficiente información/);
});
test('related candidate selection requires neighborhood evidence rather than random concepts',()=>{
 const target=prepared.candidates[0],near={...prepared.candidates[1],section:target.section},far={...prepared.candidates[2],name:'Tributación de empresas exportadoras',section:'Finanzas',sourceFragmentIds:['p99-f001']};const selected=relatedCandidates(target,[target,near,far]);assert.ok(selected.some(c=>c.id===near.id));assert.ok(!selected.some(c=>c.id===far.id));
});
test('compact context uses unique academic passages and fixed slots, with no raw PDF/metadata/duplicate analysis',()=>{
 assert.equal(input.singleInference,true);assert.equal(new Set(input.sources.map(f=>f.id)).size,input.sources.length);assert.ok(input.sources.every(f=>f.contentType==='academic'));assert.equal(input.hybridContext.slots.length,3);assert.ok(!JSON.stringify(input.hybridContext).includes('sourceReferences'));assert.ok(!JSON.stringify(input).includes('UNIVERSIDAD'));
});
test('normal hybrid flow uses exactly one generation, zero analyze calls and reaches existing SCORM engine',async()=>{
 let calls=0;const provider={analyzeDocument(){throw new Error('Analysis inference forbidden');},async generateQuiz(value){calls++;assert.equal(value.singleInference,true);return questions(value);}};
 const q=await generateHybridQuiz(prepared,{title:'Biología híbrida',count:3,scored:true},provider);assert.equal(calls,1);assert.equal(validateQuiz(q).blockingCount,0);assert.ok(require('../src/lib/scorm/package.ts').packageSCORM(q).length>0);
});
test('wrong concept/family and unknown references cannot silently switch the assigned task',async()=>{
 const q=await generateHybridQuiz(prepared,{title:'Biología híbrida',count:3,scored:true},{async generateQuiz(value){const q=questions(value);q[0].questionFamily='definition';return q;}});assert.ok(validateQuiz(q).issues.some(i=>i.code==='blueprint_slot'&&i.severity==='BLOCKING'));
 const invalid=structuredClone(q);invalid.questions[0].sourceFragmentIds=['p99-f001'];assert.equal(validateQuiz(invalid).valid,false);
});
test('unknown prepared candidate evidence is rejected before any educational request',async()=>{
 const invalid=structuredClone(prepared);invalid.candidates[0].sourceFragmentIds=['p99-f999'];let calls=0;
 await assert.rejects(generateHybridQuiz(invalid,{title:'Invalid prepared source',count:3,scored:true},{async generateQuiz(){calls++;return [];}}));assert.equal(calls,0);
});
test('single-question regeneration preserves slot and sends only pertinent sources in one explicit call',async()=>{
 let calls=0;const provider={analyzeDocument(){throw new Error('No analysis');},async regenerateQuestion(value){calls++;assert.equal(value.blueprint.slots.length,1);assert.ok(value.sources.length<prepared.document.fragments.length);assert.equal(value.singleInference,true);return questions(value)[0];}};
 const result=await regenerateHybridQuestion(prepared,plan.blueprint.slots[0],[],provider);assert.equal(result.question.slotId,plan.blueprint.slots[0].slotId);assert.equal(calls,1);
});
test('session caches preparation, plan object and teacher-edited quiz across navigation; replacement invalidates',async()=>{
 const session=new DocumentSession();let preparations=0;await session.understand(async()=>{preparations++;return {document:prepared.document,analysis:prepared.analysis,prepared};});
 const first=session.getPlan(3);session.quiz=createManualQuiz(prepared,first,'Quiz manual',true);for(let i=0;i<5;i++){await session.understand(()=>{throw new Error('No rerun');});assert.equal(session.getPlan(3),first);assert.equal(session.quiz.title,'Quiz manual');}
 assert.equal(preparations,1);const replacement=new DocumentSession(session.id+1);assert.equal(replacement.understanding,null);assert.equal(replacement.quiz,null);
});
test('unavailable Ollama does not erase deterministic analysis, plan or manual editing path',async()=>{
 const session=new DocumentSession();await session.understand(async()=>({document:prepared.document,analysis:prepared.analysis,prepared}));const cached=session.getPlan(3);
 await assert.rejects(generateHybridQuiz(prepared,{title:'Quiz offline',count:3,scored:true},{async generateQuiz(){throw new Error('Offline');}}));assert.equal(session.getPlan(3),cached);assert.equal(session.understanding.prepared,prepared);assert.equal(validateQuiz(createManualQuiz(prepared,cached,'Quiz manual',true)).valid,false);
});
test('native Ollama invalid JSON/Zod, capacity and auth never cause automatic repair/fallback in hybrid mode',async()=>{
 for(const kind of ['json','schema','capacity','auth']){let calls=0;const provider=new OllamaContentIntelligenceProvider(config,async()=>{calls++;if(kind==='capacity'||kind==='auth')return new Response(JSON.stringify({error:'temporarily unavailable'}),{status:kind==='auth'?401:503});return Response.json({model:config.model,message:{content:kind==='json'?'{':'{}'},done:true,done_reason:'stop'});},undefined,()=>{});
 await assert.rejects(provider.generateQuiz(input));assert.equal(calls,1,kind);}
});
test('native Ollama accepts strict content-only hybrid output and keeps context/keep_alive unchanged',async()=>{
 let calls=0;const provider=new OllamaContentIntelligenceProvider(config,async(url,init)=>{calls++;const body=JSON.parse(init.body);assert.equal(body.options.num_ctx,8192);assert.equal(body.keep_alive,'10m');assert.ok(!body.messages[1].content.includes('sourceReferences'));return Response.json({model:config.model,message:{content:JSON.stringify({questions:questions(input).map(wire)})},done:true,done_reason:'stop'});},undefined,()=>{});const result=await provider.generateQuiz(input);assert.equal(result.length,3);assert.equal(calls,1);
});
test('OpenRouter hybrid capacity does not trigger a hidden second request',async()=>{
 let calls=0;const provider=new OpenAICompatibleProvider({provider:'openrouter',baseURL:'https://openrouter.ai/api/v1',apiKey:'fixture-only',model:'google/gemma-4-26b-a4b-it:free',mode:'json',fallbackModel:'google/gemma-4-31b-it:free'},async()=>{calls++;return Response.json({error:{code:429,message:'capacity'}},{status:429});},undefined,()=>{});await assert.rejects(provider.generateQuiz(input));assert.equal(calls,1);
});
test('HTTP hybrid prepare has no provider dependency and its result reaches Quiz Studio/SCORM contracts', {skip:!process.env.SCORM_TEST_URL},async()=>{
 const base=process.env.SCORM_TEST_URL,post=body=>fetch(base+'/api/intelligence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const response=await post({action:'prepare',extracted});assert.equal(response.status,200);const {prepared:p}=await response.json();assert.equal(p.method,'deterministic');
 const generated=await post({action:'generateHybrid',prepared:p,config:{title:'Hybrid HTTP',count:3,scored:true}});assert.equal(generated.status,200);const data=await generated.json();assert.equal(data.quiz.questions.length,3);assert.equal(data.quality.blockingCount,0);
 const zip=await fetch(base+'/api/scorm',{method:'POST',body:JSON.stringify(data.quiz)});assert.equal(zip.status,200);
});
