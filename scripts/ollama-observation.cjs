// Read-only benchmark instrumentation. No host credentials, inference, model
// unload, service configuration or raw provider content is accessed here.
async function getResidentModels(config,transport=fetch){
  const response=await transport(`${config.baseURL}/api/ps`,{signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error('Model residency unavailable');
  const data=await response.json();
  if(!Array.isArray(data.models))throw new Error('Invalid residency envelope');
  return data.models.filter(m=>[config.model,config.fallbackModel].includes(m.name||m.model)).map(m=>({model:m.name||m.model,expiresAt:m.expires_at,size:m.size,sizeVram:m.size_vram,contextLength:m.context_length}));
}
function verifyPrimaryContext(config,attempt,models){
  if(attempt?.modelReturned!==config.model||attempt?.fallbackUsed)return {pass:false,reason:'La prueba minima no fue completada por el modelo principal.'};
  const primary=models.find(m=>m.model===config.model);
  if(!primary||primary.contextLength!==config.numCtx)return {pass:false,reason:'No se pudo confirmar el contexto efectivo del modelo principal.',requestedContext:config.numCtx,actualContext:primary?.contextLength??null};
  return {pass:true,model:config.model,requestedContext:config.numCtx,actualContext:primary.contextLength};
}
function startMemoryObservation(config,getStage,transport=fetch){
  const samples=[];let pending=null;
  async function sample(label){
    const at=new Date().toISOString();
    try{samples.push({stage:label,at,models:await getResidentModels(config,transport)});}
    catch{samples.push({stage:label,at,available:false});}
  }
  const interval=setInterval(()=>{if(!pending){pending=sample(getStage()).finally(()=>{pending=null;});}},2000);
  return {sample,async stop(){
    clearInterval(interval);if(pending)await pending;await sample('after-pdf');
    const peakByStage={};
    for(const entry of samples){const primary=entry.models?.find(m=>m.model===config.model);if(primary&&Number.isFinite(primary.size))peakByStage[entry.stage]=Math.max(peakByStage[entry.stage]||0,primary.size);}
    return {source:'Ollama /api/ps.size: reported model allocation, not process RSS or VPS used RAM',intervalMs:2000,samples,peakModelBytesByStage:peakByStage,hostRamUsedBytes:null,swapUsedBytes:{before:null,during:null,after:null},hostMeasurementNote:'VPS RAM/swap require host telemetry; Ollama API does not expose them.'};
  }};
}
module.exports={getResidentModels,verifyPrimaryContext,startMemoryObservation};
