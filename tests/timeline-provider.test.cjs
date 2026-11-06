/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {OllamaContentIntelligenceProvider,OLLAMA_DEFAULTS}=require('../src/lib/content/ollama-provider.server.ts');
const {OpenAICompatibleProvider}=require('../src/lib/content/provider.server.ts');
const {fixture}=require('./timeline-fixture.cjs');
test('timeline optional wording uses existing Ollama native JSON transport once and sends only supplied evidence',async()=>{
 const f=fixture(),e=f.spec.events[0],input={eventId:e.id,title:e.title,description:e.description,sources:f.document.fragments.filter(s=>e.sourceFragmentIds.includes(s.id))},calls=[];
 const p=new OllamaContentIntelligenceProvider({...OLLAMA_DEFAULTS,provider:'ollama',model:'qwen3:4b-instruct',numCtx:8192,keepAlive:'10m'},async(url,request)=>{calls.push({url,body:JSON.parse(request.body)});return Response.json({model:'qwen3:4b-instruct',done:true,done_reason:'stop',message:{content:JSON.stringify({eventId:e.id,title:e.title,description:e.description})}});},undefined,()=>{});
 assert.equal((await p.rewriteTimelineEvent(input)).eventId,e.id);assert.equal(calls.length,1);assert(calls[0].url.endsWith('/api/chat'));assert.equal(calls[0].body.options.num_ctx,8192);assert.equal(calls[0].body.keep_alive,'10m');assert.equal(calls[0].body.options.num_predict,640);assert.equal(calls[0].body.model,'qwen3:4b-instruct');assert(calls[0].body.messages.some(m=>m.content.includes(e.id)));assert.equal(calls[0].body.messages.map(m=>m.content).join('').split('[SOURCE ').length-1,input.sources.length);
});
test('timeline invalid JSON, unknown identity or invented fields are rejected without repair/fallback',async()=>{
 const f=fixture(),e=f.spec.events[0],input={eventId:e.id,title:e.title,description:e.description,sources:f.document.fragments.filter(s=>e.sourceFragmentIds.includes(s.id))};
 for(const content of ['{',JSON.stringify({eventId:'unknown',title:e.title,description:e.description}),JSON.stringify({eventId:e.id,title:e.title,description:e.description,date:'2099'})]){let calls=0;const p=new OllamaContentIntelligenceProvider({...OLLAMA_DEFAULTS,provider:'ollama'},async()=>{calls++;return Response.json({model:OLLAMA_DEFAULTS.model,done:true,message:{content}});},undefined,()=>{});await assert.rejects(()=>p.rewriteTimelineEvent(input));assert.equal(calls,1);}
});
test('timeline wording remains provider agnostic through the existing OpenAI-compatible adapter',async()=>{
 const f=fixture(),e=f.spec.events[0];let calls=0;const p=new OpenAICompatibleProvider({baseURL:'http://localhost:1234',apiKey:'synthetic',model:'fixture',mode:'json'},async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({eventId:e.id,title:e.title,description:e.description})}}]});},undefined,()=>{});assert.equal((await p.rewriteTimelineEvent({eventId:e.id,title:e.title,description:e.description,sources:f.document.fragments})).eventId,e.id);assert.equal(calls,1);
});
