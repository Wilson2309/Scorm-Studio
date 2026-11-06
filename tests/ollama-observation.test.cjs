/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict');
const {getResidentModels,verifyPrimaryContext,startMemoryObservation}=require('../scripts/ollama-observation.cjs');
const config={baseURL:'http://127.0.0.1:11435',model:'qwen3:4b-instruct',fallbackModel:'qwen2.5:3b',numCtx:8192};
const primary={name:config.model,context_length:8192,size:3500000000,size_vram:0};
test('context gate requires the primary response and effective context, before any PDF operation',()=>{
  const attempt={modelReturned:config.model,fallbackUsed:false},models=[{model:config.model,contextLength:8192}];
  assert.equal(verifyPrimaryContext(config,attempt,models).pass,true);
  assert.equal(verifyPrimaryContext(config,attempt,[{model:config.model,contextLength:4096}]).pass,false);
  assert.equal(verifyPrimaryContext(config,{modelReturned:config.fallbackModel,fallbackUsed:true},models).pass,false);
  assert.equal(verifyPrimaryContext(config,attempt,[]).pass,false);
});
test('residency sampling is read-only, model-scoped and keeps host RAM/swap explicitly unavailable',async()=>{
  const calls=[];const transport=async(url,request)=>{calls.push({url,body:request.body});return Response.json({models:[{...primary,privateField:'never-report'},{name:'other-model',size:1}]});};
  const models=await getResidentModels(config,transport);assert.equal(models.length,1);assert.equal(models[0].contextLength,8192);assert.equal(models[0].size,3500000000);assert.equal(JSON.stringify(models).includes('never-report'),false);
  const monitor=startMemoryObservation(config,()=> 'pdf-analysis',transport);
  await monitor.sample('before-pdf');await monitor.sample('pdf-analysis');const result=await monitor.stop();
  assert.equal(result.samples.length,3);assert.equal(result.peakModelBytesByStage['pdf-analysis'],3500000000);assert.equal(result.hostRamUsedBytes,null);assert.deepEqual(result.swapUsedBytes,{before:null,during:null,after:null});
  assert.ok(calls.every(c=>c.url.endsWith('/api/ps')&&!c.body));
});
