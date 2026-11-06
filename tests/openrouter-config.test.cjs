/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {providerConfig,OpenAICompatibleProvider}=require('../src/lib/content/provider.server.ts');
test('OpenRouter AI_* config uses the existing adapter, JSON validation and attribution headers',async()=>{
  const names=['AI_PROVIDER','AI_BASE_URL','AI_API_KEY','AI_MODEL','AI_APP_NAME','AI_HTTP_REFERER','AI_JSON_MODE'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  try{
    Object.assign(process.env,{AI_PROVIDER:'openrouter',AI_BASE_URL:'https://openrouter.ai/api/v1',AI_API_KEY:'test-only-not-real',AI_MODEL:'google/gemma-4-26b-a4b-it:free',AI_APP_NAME:'SCORM Studio',AI_HTTP_REFERER:'http://localhost:3000'});delete process.env.AI_JSON_MODE;
    const config=providerConfig();assert.equal(config.mode,'json');assert.equal(config.provider,'openrouter');assert.equal(config.fallbackModel,'google/gemma-4-31b-it:free');assert.equal(config.fallbackMode,'json');
    let requests=0;
    const provider=new OpenAICompatibleProvider(config,async(url,request)=>{
      requests++;assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(request.headers['X-OpenRouter-Title'],'SCORM Studio');assert.equal(request.headers['HTTP-Referer'],'http://localhost:3000');
      const body=JSON.parse(request.body);assert.equal(body.max_tokens,256);assert.equal(body.max_completion_tokens,undefined);assert.deepEqual(body.response_format,{type:'json_object'});assert.ok(!request.body.includes('"strict":true'));
      return Response.json({choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}]});
    });
    assert.deepEqual(await provider.checkConnectivity(),{ok:true});assert.equal(requests,1);
    process.env.AI_API_KEY='';assert.throws(()=>providerConfig(),/AI_API_KEY y AI_MODEL/);
  }finally{for(const name of names)if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}
});
