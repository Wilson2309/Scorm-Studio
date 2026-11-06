/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {OpenAICompatibleProvider,IntelligenceError}=require('../src/lib/content/provider.server.ts');
const {PRIMARY_MODEL,FALLBACK_MODEL,FREE_MODELS_BUSY,isRecoverableCapacity}=require('../src/lib/content/model-policy.ts');
const {analysis,document,wire}=require('./content-fixture.cjs');
const config={provider:'openrouter',baseURL:'https://example.invalid/v1',apiKey:'test-only-never-real',model:PRIMARY_MODEL,mode:'strict',fallbackModel:FALLBACK_MODEL,fallbackMode:'json'};
const success=(content=analysis,model)=>Response.json({...(model?{model}:{}),choices:[{finish_reason:'stop',message:{content:JSON.stringify(wire(content))}}]});
const failure=(status,message='Provider capacity temporarily unavailable')=>Response.json({error:{code:status,message}},{status});
function adapter(responses){
  const calls=[],logs=[];
  const provider=new OpenAICompatibleProvider(config,async(_url,request)=>{calls.push(JSON.parse(request.body));const result=responses[calls.length-1];if(result instanceof Error)throw result;if(!result)throw new Error('Unexpected extra request');return result;},undefined,event=>logs.push(event));
  return {provider,calls,logs,run:()=>provider.analyzeDocument({fragments:document.fragments})};
}
test('Gemma primary overrides strict config with JSON mode, one request and safe telemetry',async()=>{
  const run=adapter([success(analysis,PRIMARY_MODEL.replace(':free',''))]);assert.deepEqual(await run.run(),analysis);
  assert.equal(run.calls.length,1);assert.equal(run.calls[0].model,PRIMARY_MODEL);assert.deepEqual(run.calls[0].response_format,{type:'json_object'});assert.ok(!JSON.stringify(run.calls).includes('"strict":true'));
  assert.equal(run.logs[0].httpStatus,200);assert.equal(run.logs[0].fallbackUsed,false);assert.equal(run.logs[0].jsonParse,'PASS');assert.equal(run.logs[0].zod,'PASS');
  assert.ok(!JSON.stringify(run.logs).includes(config.apiKey));assert.ok(!JSON.stringify(run.logs).includes(document.fragments[0].text));
});
test('primary 429 -> fallback JSON success, at most two requests and no generic free router',async()=>{
  const run=adapter([failure(429),success(analysis)]);assert.deepEqual(await run.run(),analysis);
  assert.deepEqual(run.calls.map(c=>c.model),[PRIMARY_MODEL,FALLBACK_MODEL]);assert.equal(run.calls[1].response_format.type,'json_object');
  assert.equal(run.logs[1].fallbackUsed,true);assert.equal(run.logs[1].usedModel,FALLBACK_MODEL);
});
test('primary 429 + fallback 429 -> controlled busy error; no third request',async()=>{
  const run=adapter([failure(429),failure(429)]);await assert.rejects(run.run(),e=>e instanceof IntelligenceError&&e.message===FREE_MODELS_BUSY&&e.status===503);
  assert.equal(run.calls.length,2);assert.deepEqual(run.logs.map(e=>e.httpStatus),[429,429]);
});
test('auth, configuration and generic programming/provider failures never trigger fallback',async()=>{
  for(const response of [failure(401,'Invalid key'),failure(403),failure(400),failure(404),failure(500,'Internal server error'),failure(503,'No endpoints found matching your data policy'),new Error('Transport bug')]){
    const run=adapter([response]);await assert.rejects(run.run(),IntelligenceError);assert.equal(run.calls.length,1);
  }
});
test('invalid schema and JSON get at most one same-model correction; refusal is never retried',async()=>{
  for(const response of [success({title:'partial'}),Response.json({choices:[{finish_reason:'stop',message:{content:'```json broken'}}]}),Response.json({choices:[{finish_reason:'stop',message:{content:null,refusal:'not allowed'}}]})]){
    const refusal=await response.clone().json();
    const run=adapter([response,success({title:'still partial'})]);await assert.rejects(run.run(),IntelligenceError);assert.equal(run.calls.length,refusal.choices?.[0]?.message.refusal?1:2);assert.ok(run.calls.every(c=>c.model===PRIMARY_MODEL));
  }
});
test('invalid JSON -> same model repair -> JSON and Zod pass without resending sources',async()=>{
  const run=adapter([Response.json({choices:[{finish_reason:'stop',message:{content:'```json broken'}}]}),success(analysis)]);
  assert.deepEqual(await run.run(),analysis);assert.equal(run.calls.length,2);assert.ok(run.calls.every(c=>c.model===PRIMARY_MODEL));
  const correction=JSON.parse(run.calls[1].messages[1].content);assert.deepEqual(correction.errors,[{path:'$',code:'invalid_json'}]);assert.equal(correction.draft,'```json broken');assert.equal(correction.fragments,undefined);
  assert.ok(!JSON.stringify(run.calls[1]).includes(document.fragments[0].original));assert.equal(run.logs[1].formatRetry,true);
});
test('invalid Zod -> one correction with safe validation paths -> validated application data',async()=>{
  const partial={...analysis,title:''};const run=adapter([success(partial),success(analysis)]);assert.deepEqual(await run.run(),analysis);
  const correction=JSON.parse(run.calls[1].messages[1].content);assert.ok(correction.errors.some(e=>e.path==='title'&&e.code==='too_small'));assert.equal(run.calls[1].model,PRIMARY_MODEL);assert.equal(run.logs[0].jsonParse,'PASS');assert.equal(run.logs[0].zod,'FAIL');
});
test('the second schema failure is rejected; repair/fallback never cause a third request',async()=>{
  const repeated=adapter([success({title:'partial'}),success({title:'still partial'})]);await assert.rejects(repeated.run(),IntelligenceError);assert.equal(repeated.calls.length,2);
  const capacityAfterRepair=adapter([success({title:'partial'}),failure(429)]);await assert.rejects(capacityAfterRepair.run(),IntelligenceError);assert.equal(capacityAfterRepair.calls.length,2);assert.ok(capacityAfterRepair.calls.every(c=>c.model===PRIMARY_MODEL));
});
test('Gemma fallback cannot send json_schema even when explicitly configured strict',async()=>{
  const calls=[];const provider=new OpenAICompatibleProvider({...config,fallbackMode:'strict'},async(_url,request)=>{const body=JSON.parse(request.body);calls.push(body);return calls.length===1?failure(429):success(analysis);},undefined,()=>{});
  assert.deepEqual(await provider.analyzeDocument({fragments:document.fragments}),analysis);assert.equal(calls[1].model,FALLBACK_MODEL);assert.ok(calls.every(c=>c.response_format.type==='json_object'&&!c.response_format.json_schema));
});
test('provider diagnostics redact echoed credentials and document content',async()=>{
  const marker='CONFIDENTIAL PDF CONTENT';
  const run=adapter([Response.json({error:{code:400,message:`Unsupported response_format Authorization Bearer ${config.apiKey} ${marker}`,metadata:{raw:`${config.apiKey} ${marker}`}}},{status:400})]);
  await assert.rejects(run.run(),error=>error instanceof IntelligenceError&&error.diagnostic.code===400);
  const logs=JSON.stringify(run.logs);assert.ok(!logs.includes(config.apiKey));assert.ok(!logs.includes(marker));assert.ok(!logs.includes('Authorization'));assert.equal(run.logs[0].diagnostic.parameterRelated,true);
});
test('pedagogical rejection does not trigger another model request',async()=>{
  const {buildEducationalQuiz}=require('../src/lib/content/pipeline.server.ts');
  const {validateQuiz}=require('../src/lib/content/quality.ts');
  const {quiz}=require('./content-fixture.cjs');
  const bad=structuredClone(quiz.questions);bad[1].stem=bad[0].stem;
  const run=adapter([success({questions:bad})]);
  const result=await buildEducationalQuiz(document,analysis,{title:quiz.title,count:3,scored:true},run.provider);
  assert.equal(validateQuiz(result).valid,false);assert.equal(run.calls.length,1);
});
test('fallback malformed JSON or partial schema -> controlled error, never accepted or retried',async()=>{
  for(const response of [Response.json({choices:[{finish_reason:'stop',message:{content:'{"title":'}}]}),success({title:'partial'})]){
    const run=adapter([failure(429),response]);await assert.rejects(run.run(),e=>e instanceof IntelligenceError&&/JSON|contrato/.test(e.message));assert.equal(run.calls.length,2);
  }
});
test('fallback is limited to declared temporary capacity and validates HTTP-200 error envelopes',async()=>{
  assert.equal(isRecoverableCapacity(502,'Model temporarily unavailable'),true);assert.equal(isRecoverableCapacity(502,'Invalid response from model'),false);
  const run=adapter([failure(503,'Provider at capacity'),success(analysis)]);assert.deepEqual(await run.run(),analysis);
  const embedded=adapter([Response.json({error:{code:429,message:'Rate limited'}}),success(analysis)]);assert.deepEqual(await embedded.run(),analysis);assert.equal(embedded.calls.length,2);
});
