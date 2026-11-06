/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {document,analysis,quiz,extracted,wire}=require('./content-fixture.cjs');
const {normalizeDocument,chunkDocument}=require('../src/lib/content/normalize.ts');
const {assertAnalysisGrounded,validateQuiz,isAdministrativeQuestion}=require('../src/lib/content/quality.ts');
const {analysisOutputSchema,questionOutputSchema,resolveSourceIds,hydrateAnalysis}=require('../src/lib/content/grounding.ts');
const {OllamaContentIntelligenceProvider,ollamaConfig,OLLAMA_DEFAULTS}=require('../src/lib/content/ollama-provider.server.ts');
const {parseOllamaMetrics}=require('../src/lib/content/ollama-metrics.ts');
const {sourceReferenceSchema}=require('../src/lib/content/schema.ts');

test('canonical fragments have deterministic padded IDs, normalized text and document identity',()=>{
  const again=normalizeDocument(extracted);assert.deepEqual(again,document);
  for(const f of [...again.fragments,...again.excluded]){assert.match(f.id,/^p\d+-f\d{3,}$/);assert.equal(f.documentId,again.documentId);assert.ok(f.normalizedText);assert.ok(f.contentType);}
  assert.equal(new Set([...again.fragments,...again.excluded].map(f=>f.id)).size,again.fragments.length+again.excluded.length);
});

test('valid IDs resolve canonical page/text, while unknown IDs, empty lists and wrong pages fail',()=>{
  const source=document.fragments[0];const resolved=resolveSourceIds([source.id],document.fragments,document.documentId)[0];
  assert.deepEqual(resolved,{fragmentId:source.id,page:source.page,quote:source.text.slice(0,1200)});
  assert.throws(()=>resolveSourceIds(['p99-f999'],document.fragments,document.documentId));assert.throws(()=>resolveSourceIds([],document.fragments,document.documentId));
  assert.throws(()=>resolveSourceIds([source.id],[{...source,page:99}],document.documentId));
});

test('a short canonical source does not inherit the old minimum length for model-written quotes',()=>{
  const source={...document.fragments[0],text:'Inicio.',original:'Inicio.',normalizedText:'Inicio.'};
  const reference=resolveSourceIds([source.id],[source],document.documentId)[0];
  assert.equal(reference.quote,'Inicio.');assert.equal(sourceReferenceSchema.safeParse(reference).success,true);
});

test('same local fragment ID in a different document cannot reuse an analysis stamp',()=>{
  const text=extracted.text.replace('solar','luminosa');const other=normalizeDocument({...extracted,text,pageTexts:[{page:1,text}]});
  assert.notEqual(other.documentId,document.documentId);assert.equal(other.fragments[0].id,document.fragments[0].id);
  assert.throws(()=>assertAnalysisGrounded(analysis,other.fragments),/documento distinto/);
  const changed=structuredClone(quiz);changed.questions[0].documentId=other.documentId;assert.equal(validateQuiz(changed).valid,false);
});

test('paraphrases are accepted by ID grounding; fabricated quotation cannot become source truth',()=>{
  const output=wire(analysis);output.keyConcepts[0].text='Transformacion energetica que sostiene la nutricion vegetal.';
  const hydrated=hydrateAnalysis(analysisOutputSchema.parse(output),document.fragments);assertAnalysisGrounded(hydrated,document.fragments);
  hydrated.keyConcepts[0].sourceReferences[0].quote='Invented quotation unrelated to the actual source.';
  assert.doesNotThrow(()=>assertAnalysisGrounded(hydrated,document.fragments));
  const canonical=resolveSourceIds(hydrated.keyConcepts[0].sourceFragmentIds,document.fragments,document.documentId);
  assert.equal(canonical[0].quote,document.fragments[0].text);assert.equal(analysisOutputSchema.safeParse({...output,quote:'invented'}).success,false);
  assert.equal(questionOutputSchema.safeParse({...wire(quiz.questions[0]),page:98}).success,false);
});

test('administrative fragments are typed and unavailable for normal assessment',()=>{
  const admin=document.excluded.find(f=>f.contentType==='administrative');assert.ok(admin);
  assert.throws(()=>resolveSourceIds([admin.id],[...document.fragments,admin],document.documentId));
  const output=wire(analysis);output.importantFacts[0].sourceFragmentIds=['p3-f999'];assert.throws(()=>hydrateAnalysis(output,document.fragments));
});

test('multi-source claims preserve the existing four-reference contract without accepting unknown IDs',()=>{
  const output=wire(analysis);output.importantFacts[0].sourceFragmentIds=document.fragments.map(f=>f.id);
  assert.equal(analysisOutputSchema.safeParse(output).success,true);assert.doesNotThrow(()=>hydrateAnalysis(output,document.fragments));
  output.importantFacts[0].sourceFragmentIds[1]='p99-f999';assert.throws(()=>hydrateAnalysis(output,document.fragments));
});

test('normalization preserves sentences without whitespace and small units use one chunk',()=>{
  const text=Array.from({length:4},()=>document.fragments[0].text).join('');
  const normalized=normalizeDocument({name:'sentences.pdf',pages:1,text,pageTexts:[{page:1,text}],warnings:[]});
  assert.equal(normalized.fragments.map(f=>f.text).join(''),text);assert.equal(chunkDocument(normalized).length,1);
});

test('Ollama metrics use nanoseconds, survive zero/missing counters and never include content',()=>{
  const result=parseOllamaMetrics({total_duration:3e9,load_duration:1e8,prompt_eval_count:40,prompt_eval_duration:5e8,eval_count:20,eval_duration:2e9,prompt:'private',content:'private'});
  assert.equal(result.promptTokensPerSecond,80);assert.equal(result.generationTokensPerSecond,10);assert.equal(result.total_duration,3e9);
  assert.equal(JSON.stringify(result).includes('private'),false);assert.equal(parseOllamaMetrics({eval_count:20,eval_duration:0}).generationTokensPerSecond,null);assert.equal(parseOllamaMetrics({eval_duration:-1}).eval_duration,undefined);
});

test('native streamed final counters are retained and prompts contain one source catalog, not a schema copy',async()=>{
  const events=[],calls=[];const output=JSON.stringify(wire(analysis));
  const frames=[{model:'qwen2.5:3b',message:{content:output},done:false},{model:'qwen2.5:3b',message:{content:''},done:true,done_reason:'stop',total_duration:2e9,load_duration:1e6,prompt_eval_count:60,prompt_eval_duration:1e9,eval_count:30,eval_duration:1e9}];
  const provider=new OllamaContentIntelligenceProvider({provider:'ollama',...OLLAMA_DEFAULTS},async(_url,request)=>{calls.push(JSON.parse(request.body));return new Response(frames.map(f=>JSON.stringify(f)).join('\n'),{headers:{'Content-Type':'application/x-ndjson'}});},undefined,e=>events.push(e));
  await provider.analyzeDocument({fragments:[...document.fragments,...document.excluded]});
  assert.equal(calls[0].keep_alive,'10m');assert.equal(calls[0].messages[0].content.includes('additionalProperties'),false);assert.equal(calls[0].messages[1].content.includes(document.excluded[0].text),false);
  assert.equal(events[0].operation,'analyzeDocument');assert.equal(events[0].metrics.eval_count,30);assert.equal(events[0].metrics.generationTokensPerSecond,30);assert.ok(events[0].promptChars>0);
});

test('keep_alive is configurable with a finite lease, or 0 to unload, never permanent',()=>{
  const names=['AI_BASE_URL','AI_MODEL','AI_FALLBACK_MODEL','OLLAMA_KEEP_ALIVE'];const saved=Object.fromEntries(names.map(n=>[n,process.env[n]]));
  try{
    Object.assign(process.env,{AI_BASE_URL:'http://127.0.0.1:11435',AI_MODEL:'qwen2.5:3b',AI_FALLBACK_MODEL:'llama3.2:3b',OLLAMA_KEEP_ALIVE:'10m'});assert.equal(ollamaConfig().keepAlive,'10m');
    process.env.OLLAMA_KEEP_ALIVE='0';assert.equal(ollamaConfig().keepAlive,'0');process.env.OLLAMA_KEEP_ALIVE='-1';assert.throws(()=>ollamaConfig());
  }finally{for(const name of names)if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}
});

test('educational website pages and institutional trust are not document-page metadata',()=>{
  for(const text of ['Que representa la pagina de inicio en un negocio electronico?','Que elementos deben incluirse en una pagina de ventas de productos fisicos?','Como contribuye el marco institucional a la confianza digital?'])assert.equal(isAdministrativeQuestion(text),false);
  for(const text of ['Cuantas paginas tiene el PDF?','Cual es el nombre de la universidad del documento?','Cual es el codigo de asignatura?'])assert.equal(isAdministrativeQuestion(text),true);
});
