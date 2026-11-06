/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {OllamaContentIntelligenceProvider,OLLAMA_DEFAULTS,ollamaConfig}=require('../src/lib/content/ollama-provider.server.ts');
const {providerConfig,createContentIntelligenceProvider,OpenAICompatibleProvider,IntelligenceError,getProviderStatus}=require('../src/lib/content/provider.server.ts');
const {analysis,document,quiz,blueprint,extracted,wire}=require('./content-fixture.cjs');
const {analyzeContent,buildEducationalQuiz,regenerate}=require('../src/lib/content/pipeline.server.ts');
const {validateQuiz}=require('../src/lib/content/quality.ts');
const config={provider:'ollama',...OLLAMA_DEFAULTS};
const response=(data,model=config.model)=>Response.json({model,message:{role:'assistant',content:JSON.stringify(wire(data))},done:true,done_reason:'stop'});
function create(responses){const calls=[],logs=[];const provider=new OllamaContentIntelligenceProvider(config,async(url,request)=>{calls.push({url,...request,body:request.body?JSON.parse(request.body):undefined});const r=responses[calls.length-1];if(r instanceof Error)throw r;if(!r)throw new Error('Unexpected request');return r;},undefined,event=>logs.push(event));return {provider,calls,logs};}
test('Ollama health uses GET tags only, confirms primary/fallback and never runs inference',async()=>{
  const run=create([Response.json({models:[{name:'qwen2.5:3b'},{name:'llama3.2:3b'},{name:'llama3.2:1b'}]})]);
  const health=await run.provider.healthCheck();assert.equal(health.connection,true);assert.equal(health.primaryInstalled,true);assert.equal(health.fallbackInstalled,true);assert.equal(run.calls.length,1);assert.equal(run.calls[0].url,'http://127.0.0.1:11435/api/tags');assert.equal(run.calls[0].method,'GET');assert.equal(run.calls[0].body,undefined);
});
test('Ollama missing primary is distinct from an unavailable connection',async()=>{
  const missing=create([Response.json({models:[{name:'llama3.2:3b'}]})]);const health=await missing.provider.healthCheck();assert.equal(health.connection,true);assert.equal(health.primaryInstalled,false);assert.equal(health.fallbackInstalled,true);
  const absent=create([new Error('ECONNREFUSED')]);assert.equal((await absent.provider.healthCheck()).connection,false);
});
test('native chat requests JSON, low temperature, bounded context and no API-key header',async()=>{
  const run=create([response({ok:true})]);assert.deepEqual(await run.provider.checkConnectivity(),{ok:true});
  assert.equal(run.calls[0].url,'http://127.0.0.1:11435/api/chat');const body=run.calls[0].body;assert.equal(body.stream,true);assert.equal(body.format.type,'object');assert.equal(body.format.additionalProperties,false);assert.deepEqual(body.format.required,['ok']);assert.equal(body.model,'qwen2.5:3b');assert.ok(body.options.temperature<=0.2);assert.equal(body.options.num_ctx,16384);assert.equal(body.response_format,undefined);assert.equal(run.calls[0].headers.Authorization,undefined);assert.equal(run.logs[0].jsonParse,'PASS');assert.equal(run.logs[0].zod,'PASS');assert.equal(typeof run.logs[0].responseMs,'number');
});

test('native NDJSON streaming assembles split frames before JSON and strict Zod validation',async()=>{
  const frames=[{model:config.model,message:{content:'{"ok":'},done:false},{model:config.model,message:{content:'true}'},done:false},{model:config.model,message:{content:''},done:true,done_reason:'stop'}];
  const bytes=new TextEncoder().encode(frames.map(f=>JSON.stringify(f)).join('\n'));
  const stream=new ReadableStream({start(controller){for(let offset=0;offset<bytes.length;offset+=7)controller.enqueue(bytes.slice(offset,offset+7));controller.close();}});
  const run=create([new Response(stream,{headers:{'Content-Type':'application/x-ndjson'}})]);
  assert.deepEqual(await run.provider.checkConnectivity(),{ok:true});assert.equal(run.logs[0].jsonParse,'PASS');assert.equal(run.logs[0].zod,'PASS');
});

test('unfinished or malformed wire streams are rejected without exposing or accepting partial content',async()=>{
  for(const body of [JSON.stringify({model:config.model,message:{content:'{"ok":true}'},done:false}),'{bad frame']){
    const run=create([new Response(body,{headers:{'Content-Type':'application/x-ndjson'}})]);await assert.rejects(run.provider.checkConnectivity(),IntelligenceError);assert.equal(run.calls.length,1);
  }
});
test('malformed JSON and invalid Zod are not accepted or hidden by model fallback',async()=>{
  const malformed=()=>Response.json({model:config.model,message:{content:'```json broken'},done:true,done_reason:'stop'});
  for(const pair of [[malformed(),malformed()],[response({ok:'wrong'}),response({ok:'wrong'})]]){
    const run=create(pair);await assert.rejects(run.provider.checkConnectivity(),IntelligenceError);assert.equal(run.calls.length,2);assert.ok(run.calls.every(c=>c.body.model===config.model));assert.equal(run.logs[1].formatRetry,true);
  }
});
test('a valid corrected draft passes Zod with no original sources resent',async()=>{
  const run=create([response({ok:'wrong'}),response({ok:true})]);assert.deepEqual(await run.provider.checkConnectivity(),{ok:true});
  const repair=JSON.parse(run.calls[1].body.messages[1].content);assert.ok(repair.draft);assert.ok(repair.errors.length);assert.equal(repair.fragments,undefined);
});
test('missing model and recoverable inference errors may use only llama3.2:3b fallback',async()=>{
  for(const first of [Response.json({error:'model qwen2.5:3b not found'},{status:404}),Response.json({error:'runner process terminated'},{status:500}),Response.json({error:'at capacity'},{status:503})]){
    const run=create([first,response({ok:true},'llama3.2:3b')]);assert.deepEqual(await run.provider.checkConnectivity(),{ok:true});assert.deepEqual(run.calls.map(c=>c.body.model),['qwen2.5:3b','llama3.2:3b']);assert.equal(run.logs[1].fallbackUsed,true);
  }
});
test('unavailable tunnel, auth and invalid request fail without model switching',async()=>{
  for(const first of [new Error('ECONNREFUSED'),Response.json({error:'not authorized'},{status:401}),Response.json({error:'bad request'},{status:400}),Response.json({error:'unknown path'},{status:404}),Response.json({error:'invalid options configuration'},{status:503}),Response.json({error:'failed to load model: unsupported configuration'},{status:500})]){
    const run=create([first]);await assert.rejects(run.provider.checkConnectivity(),IntelligenceError);assert.equal(run.calls.length,1);
  }
});
test('native analysis, quiz and explicit regeneration use validated existing contracts',async()=>{
  const run=create([response(analysis),response({questions:quiz.questions}),response({questions:[quiz.questions[0]]})]);
  const understood=await analyzeContent(extracted,run.provider);assert.deepEqual(understood.analysis,analysis);
  const generated=await buildEducationalQuiz(understood.document,understood.analysis,{title:quiz.title,count:3,scored:true},run.provider);assert.equal(validateQuiz(generated).valid,true);
  const changed=await regenerate(document,analysis,blueprint.slots[0],'q1',quiz.questions.map(q=>q.stem),run.provider);assert.equal(changed.question.id,'q1');assert.equal(run.calls.length,3);assert.deepEqual(run.logs.map(e=>e.operation),['analyzeDocument','generateQuiz','regenerateQuestion']);
});

test('line-level PDF metadata is compacted without losing source IDs or changing application data',async()=>{
  const run=create([response(analysis)]),heading='A long section heading '.repeat(10);
  const fragments=document.fragments.map(f=>({...f,section:heading,original:'PRIVATE original duplicate'}));
  const before=JSON.stringify(fragments);await run.provider.analyzeDocument({fragments});
  const sent=run.calls[0].body.messages[1].content;
  for(const f of fragments){assert.ok(sent.includes(`[SOURCE ${f.id}]`));assert.ok(sent.includes(f.normalizedText));}
  assert.equal(JSON.stringify(fragments),before);assert.equal(JSON.stringify(run.calls).includes('PRIVATE original duplicate'),false);
});

test('unfinished output and model mismatch cannot activate fallback',async()=>{
  for(const first of [Response.json({model:config.model,message:{content:'{"ok":'},done:false}),response({ok:true},'llama3.2:1b')]){
    const run=create([first]);await assert.rejects(run.provider.checkConnectivity(),IntelligenceError);assert.equal(run.calls.length,1);
  }
});

test('a token cap never bypasses JSON parsing or Zod and a complete object remains valid',async()=>{
  const capped=content=>Response.json({model:config.model,message:{content},done:true,done_reason:'length'});
  const complete=create([capped('{"ok":true}  ')]);await complete.provider.checkConnectivity();assert.equal(complete.logs[0].zod,'PASS');
  for(const content of ['{"ok":','{"ok":"wrong"}']){
    const invalid=create([capped(content),capped(content)]);await assert.rejects(invalid.provider.checkConnectivity(),IntelligenceError);assert.equal(invalid.calls.length,2);assert.ok(invalid.calls.every(c=>c.body.model===config.model));assert.equal(invalid.logs[1].formatRetry,true);
  }
});

test('capacity response without a JSON envelope still permits the bounded fallback',async()=>{
  const run=create([new Response('Temporary upstream failure',{status:503}),response({ok:true},'llama3.2:3b')]);
  await run.provider.checkConnectivity();assert.equal(run.calls.length,2);assert.equal(run.logs[1].fallbackUsed,true);
});

test('telemetry never records prompts, original content, keys or raw inference errors',async()=>{
  const secret='synthetic-secret-never-log';
  const run=create([Response.json({error:`bad request ${secret}`},{status:400})]);
  await assert.rejects(run.provider.checkConnectivity(),e=>!JSON.stringify(e).includes(secret));
  const logged=JSON.stringify(run.logs);assert.equal(logged.includes(secret),false);
  assert.deepEqual(Object.keys(run.logs[0]).sort(),['requestedModel','usedModel','returnedModel','httpStatus','fallbackUsed','formatRetry','jsonParse','zod','responseMs','operation','promptChars','promptBytes','metrics','requestedContext','outputBudget'].sort());
});

test('default production logging contains only models, HTTP, fallback and latency',async()=>{
  const previous=process.env.NODE_ENV,original=console.info,logs=[];
  try{
    process.env.NODE_ENV='production';console.info=event=>logs.push(event);
    const provider=new OllamaContentIntelligenceProvider(config,async()=>response({ok:true}));await provider.checkConnectivity();
    assert.deepEqual(Object.keys(logs[0]).sort(),['requestedModel','usedModel','httpStatus','fallbackUsed','responseMs','operation','promptChars','promptBytes','metrics'].sort());
  }finally{console.info=original;if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
});
test('timeout is bounded and controlled, not a second slow model call',async()=>{
  let calls=0;const provider=new OllamaContentIntelligenceProvider({...config,timeoutMs:15},async(_url,request)=>{calls++;return new Promise((_,reject)=>request.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));},undefined,()=>{});
  const keepAlive=setTimeout(()=>{},1000);try{await assert.rejects(provider.checkConnectivity(),e=>e instanceof IntelligenceError&&e.status===504);assert.equal(calls,1);}finally{clearTimeout(keepAlive);}
});
test('environment selects Ollama without a key and can switch back to existing OpenRouter',()=>{
  const names=['AI_PROVIDER','AI_BASE_URL','AI_MODEL','AI_FALLBACK_MODEL','AI_API_KEY','AI_TIMEOUT_MS','AI_HEALTH_TIMEOUT_MS','AI_TEMPERATURE','AI_NUM_CTX','OLLAMA_NUM_CTX','AI_MAX_INPUT_CHARS','AI_ANALYSIS_MAX_TOKENS','AI_QUIZ_MAX_TOKENS'];const saved=Object.fromEntries(names.map(n=>[n,process.env[n]]));
  try{
    for(const name of names)delete process.env[name];Object.assign(process.env,{AI_PROVIDER:'ollama',AI_BASE_URL:'http://127.0.0.1:11435',AI_MODEL:'qwen2.5:3b'});
    const local=providerConfig();assert.equal(local.provider,'ollama');assert.equal('apiKey' in local,false);assert.ok(createContentIntelligenceProvider(local) instanceof OllamaContentIntelligenceProvider);
    process.env.AI_BASE_URL='http://127.0.0.1:11434';assert.equal(providerConfig().baseURL,'http://127.0.0.1:11434');
    process.env.AI_MODEL='llama3.2:1b';assert.throws(()=>ollamaConfig(),IntelligenceError);
    Object.assign(process.env,{AI_PROVIDER:'openrouter',AI_BASE_URL:'https://openrouter.ai/api/v1',AI_MODEL:'google/gemma-4-26b-a4b-it:free',AI_API_KEY:'fake-test-value'});assert.ok(createContentIntelligenceProvider(providerConfig()) instanceof OpenAICompatibleProvider);
  }finally{for(const name of names)if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}
});

test('Qwen3 context is configured per request and Ollama-specific env takes precedence',async()=>{
  const names=['AI_PROVIDER','AI_BASE_URL','AI_MODEL','AI_FALLBACK_MODEL','AI_NUM_CTX','OLLAMA_NUM_CTX','OLLAMA_KEEP_ALIVE'];const saved=Object.fromEntries(names.map(n=>[n,process.env[n]]));
  try{
    Object.assign(process.env,{AI_PROVIDER:'ollama',AI_BASE_URL:'http://127.0.0.1:11435',AI_MODEL:'qwen3:4b-instruct',AI_FALLBACK_MODEL:'qwen2.5:3b',AI_NUM_CTX:'16384',OLLAMA_NUM_CTX:'8192',OLLAMA_KEEP_ALIVE:'10m'});
    const selected=ollamaConfig();assert.equal(selected.numCtx,8192);assert.equal(selected.model,'qwen3:4b-instruct');assert.equal(selected.fallbackModel,'qwen2.5:3b');
    let body;const provider=new OllamaContentIntelligenceProvider(selected,async(_url,request)=>{body=JSON.parse(request.body);return response({ok:true},selected.model);},undefined,()=>{});
    assert.deepEqual(await provider.checkConnectivity(),{ok:true});assert.equal(body.options.num_ctx,8192);assert.equal(body.keep_alive,'10m');assert.equal(body.model,selected.model);
    delete process.env.OLLAMA_NUM_CTX;assert.equal(ollamaConfig().numCtx,16384);
    process.env.OLLAMA_NUM_CTX='invalid';assert.throws(()=>ollamaConfig(),IntelligenceError);
    process.env.OLLAMA_NUM_CTX='2048';assert.throws(()=>ollamaConfig(),IntelligenceError);
  }finally{for(const name of names)if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}
});

test('health diagnostics are development-only and a disconnected tunnel returns a recoverable message',async()=>{
  const names=['AI_PROVIDER','AI_BASE_URL','AI_MODEL','AI_FALLBACK_MODEL','NODE_ENV'];const saved=Object.fromEntries(names.map(n=>[n,process.env[n]])),originalFetch=global.fetch;
  try{
    Object.assign(process.env,{AI_PROVIDER:'ollama',AI_BASE_URL:config.baseURL,AI_MODEL:config.model,AI_FALLBACK_MODEL:config.fallbackModel,NODE_ENV:'development'});
    let calls=0;global.fetch=async url=>{calls++;assert.ok(url.endsWith('/api/tags'));return Response.json({models:[{name:config.model},{name:config.fallbackModel}]});};
    const development=await getProviderStatus();assert.equal(development.available,true);assert.equal(development.debug.provider,'Ollama');assert.equal(development.debug.primaryInstalled,true);assert.equal(development.debug.fallbackInstalled,true);
    process.env.NODE_ENV='production';const production=await getProviderStatus();assert.equal(production.debug,undefined);assert.equal(JSON.stringify(production).includes('qwen'),false);assert.equal(calls,2);
    global.fetch=async()=>{throw new Error('ECONNREFUSED');};const offline=await getProviderStatus();assert.equal(offline.available,false);assert.equal(offline.message,'No se pudo conectar con el servicio de IA.');assert.equal(offline.debug,undefined);
  }finally{global.fetch=originalFetch;for(const name of names)if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}
});
