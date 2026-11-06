/* eslint-disable @typescript-eslint/no-require-imports */
// Real minimal check through the application's adapter. Never print credentials,
// request messages, response content or raw provider JSON.
require('../tests/register.cjs');
require('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const {providerConfig,OpenAICompatibleProvider,IntelligenceError}=require('../src/lib/content/provider.server.ts');
async function checkMinimum(){
  const attempts=[];
  let config;
  try{
    config=providerConfig();
    if(config.provider!=='openrouter'||config.baseURL!=='https://openrouter.ai/api/v1'||config.model!=='google/gemma-4-26b-a4b-it:free')throw new Error('Configuration mismatch');
    const provider=new OpenAICompatibleProvider(config,fetch,undefined,event=>{
      const safe={httpStatus:event.httpStatus,modelRequested:event.usedModel,modelReturned:event.returnedModel??null,responseFormat:event.responseFormat,jsonParse:event.jsonParse,zod:event.zod,fallbackUsed:event.fallbackUsed,formatRetry:event.formatRetry,...(event.diagnostic?{diagnostic:event.diagnostic}:{})};
      attempts.push(safe);console.log(JSON.stringify({minimumAttempt:safe}));
    });
    const result=await provider.checkConnectivity();
    const last=attempts.at(-1);
    return {pass:result.ok===true,httpStatus:last?.httpStatus??null,modelRequested:last?.modelRequested??config.model,modelReturned:last?.modelReturned??null,jsonParse:last?.jsonParse??'NOT_RUN',zod:last?.zod??'NOT_RUN',calls:attempts.length,fallbackUsed:attempts.some(a=>a.fallbackUsed),retries:attempts.filter(a=>a.formatRetry).length,errors:[]};
  }catch(error){
    const last=attempts.at(-1);
    return {pass:false,httpStatus:last?.httpStatus??null,modelRequested:last?.modelRequested??'configured-model',modelReturned:last?.modelReturned??null,jsonParse:last?.jsonParse??'NOT_RUN',zod:last?.zod??'NOT_RUN',calls:attempts.length,fallbackUsed:attempts.some(a=>a.fallbackUsed),retries:attempts.filter(a=>a.formatRetry).length,errors:[error instanceof IntelligenceError?error.message:'No se pudo completar la prueba de configuración o conexión.']};
  }finally{if(config)config.apiKey='';delete process.env.AI_API_KEY;delete process.env.CONTENT_AI_API_KEY;}
}
module.exports={checkMinimum};
if(require.main===module)checkMinimum().then(report=>{console.log(JSON.stringify({minimumResult:report}));if(!report.pass)process.exitCode=1;});
