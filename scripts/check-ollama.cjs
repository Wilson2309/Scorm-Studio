/* eslint-disable @typescript-eslint/no-require-imports */
// Real provider probe. PDF processing is gated by a successful minimal inference.
require('../tests/register.cjs');
require('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const {readFileSync,writeFileSync}=require('node:fs');
const {createHash}=require('node:crypto');
const {getResidentModels,verifyPrimaryContext,startMemoryObservation}=require('./ollama-observation.cjs');
const {providerConfig,createContentIntelligenceProvider,IntelligenceError}=require('../src/lib/content/provider.server.ts');
const {extractPDF}=require('../src/lib/pdf/extract.ts');
const {analyzeContent,buildEducationalQuiz}=require('../src/lib/content/pipeline.server.ts');
const {validateQuiz}=require('../src/lib/content/quality.ts');
const {buildConceptPool,buildConstructionGuides}=require('../src/lib/content/question-builder.ts');
const {ZodError}=require('zod');
async function main(){
  const config=providerConfig();
  if(config.provider!=='ollama')throw new Error('Select Ollama in server configuration before running this check.');
  const regressionOnly=process.argv.includes('--regression-only');
  if(regressionOnly&&process.argv.includes('--verify-context'))throw new Error('Use --regression-only without --verify-context; context is observed after the normal requests.');
  const events=[],records=[];
  const reportIndex=process.argv.indexOf('--report');
  const reportPath=reportIndex>=0?process.argv[reportIndex+1]:null;
  if(reportIndex>=0&&!reportPath)throw new Error('Missing report path.');
  function emit(record){
    records.push(record);if(reportPath)writeFileSync(reportPath,JSON.stringify({records},null,2)+'\n');
    let display=record;
    if(record.analysisReplay||record.quizReplay)display={replaySaved:reportPath,kind:record.analysisReplay?'analysis':'quiz'};
    if(record.memoryObservation){const m=record.memoryObservation;display={memoryObservation:{source:m.source,sampleCount:m.samples.length,peakModelBytesByStage:m.peakModelBytesByStage,hostRamUsedBytes:m.hostRamUsedBytes,swapUsedBytes:m.swapUsedBytes,hostMeasurementNote:m.hostMeasurementNote}};}
    console.log(JSON.stringify(display));
  }
  function snapshot(value){return JSON.parse(JSON.stringify(value,(key,item)=>key==='sourceReferences'?undefined:item));}
  let stage='health';
  const observedFetch=async(url,request)=>{
    if(String(url).endsWith('/api/chat')&&request?.body){const body=JSON.parse(request.body);emit({request:{stage,model:body.model,contextRequested:body.options?.num_ctx,maxOutputTokens:body.options?.num_predict,temperature:body.options?.temperature,keepAlive:body.keep_alive,promptDigest:createHash('sha256').update(JSON.stringify(body.messages)).digest('hex')}});}
    return fetch(url,request);
  };
  const provider=createContentIntelligenceProvider(config,observedFetch,undefined,event=>{
    const safe={stage,operation:event.operation,promptChars:event.promptChars,promptBytes:event.promptBytes,metrics:event.metrics,validationIssues:event.validationIssues,modelRequested:event.usedModel,modelReturned:event.returnedModel,httpStatus:event.httpStatus,fallbackUsed:event.fallbackUsed,formatRetry:event.formatRetry,jsonParse:event.jsonParse,zod:event.zod,responseMs:event.responseMs};
    events.push(safe);emit({attempt:safe});
  });
  async function resident(label){
    try{const models=await getResidentModels(config);emit({residency:{stage:label,keepAlive:config.keepAlive,models}});return models;}
    catch{emit({residency:{stage:label,available:false}});return [];}
  }
  await resident('before');
  const health=await provider.healthCheck();emit({health:{provider:'Ollama',baseURL:config.baseURL,...health}});
  if(!health.connection){emit({minimal:{pass:false,error:'No se pudo conectar con el servicio de IA.'},pdf:{executed:false}});process.exitCode=1;return;}
  if(process.argv.includes('--verify-context')&&!health.primaryInstalled){emit({pdf:{executed:false,reason:'El modelo principal no figura instalado.'}});process.exitCode=1;return;}
  let started=Date.now();
  if(!regressionOnly){
  stage='minimum';
  try{
    await provider.checkConnectivity();
    emit({minimal:{pass:true,modelLoaded:true,model:events.at(-1).modelReturned,jsonParse:events.at(-1).jsonParse,zod:events.at(-1).zod,responseMs:Date.now()-started}});
  }catch(error){emit({minimal:{pass:false,error:error instanceof IntelligenceError?error.message:'No se pudo validar la respuesta mínima.',responseMs:Date.now()-started},pdf:{executed:false}});process.exitCode=1;return;}
  const minimumResidency=await resident('after-minimum');
  if(process.argv.includes('--verify-context')){
    const verification=verifyPrimaryContext(config,events.at(-1),minimumResidency);emit({contextVerification:verification});
    if(!verification.pass){emit({pdf:{executed:false,reason:verification.reason}});process.exitCode=1;return;}
  }
  }else{
    emit({minimal:{executed:false,reason:'Regression-only: no extra inference. Health uses tags; context is observed after the normal operations.'}});
    if(!health.primaryInstalled){emit({pdf:{executed:false,reason:'Primary model is not installed.'}});process.exitCode=1;return;}
  }
  const index=process.argv.indexOf('--pdf');
  if(index<0){emit({pdf:{executed:false,reason:'No PDF requested'}});return;}
  const filePath=process.argv[index+1];if(!filePath)throw new Error('Missing PDF path.');
  const callsBefore=events.length;let analysisResult;
  const memory=process.argv.includes('--observe-memory')?startMemoryObservation(config,()=>stage):null;
  if(memory)await memory.sample('before-pdf');
  stage='pdf-extraction';started=Date.now();
  try{
    const file=new File([readFileSync(filePath)],require('node:path').basename(filePath),{type:'application/pdf'});
    const extracted=await extractPDF(file);
    emit({pdfExtraction:{pages:extracted.pages,characters:extracted.text.length}});
    stage='pdf-analysis';analysisResult=await analyzeContent(extracted,provider);await resident('after-analysis');
    emit({analysis:{title:analysisResult.analysis.title,subject:analysisResult.analysis.subject,summary:analysisResult.analysis.summary,objectives:analysisResult.analysis.learningObjectives.map(i=>i.text),concepts:analysisResult.analysis.keyConcepts.map(i=>i.text),chunks:analysisResult.processing.chunks,excluded:analysisResult.document.excluded.length,sourceFragments:analysisResult.document.fragments.length,excludedTypes:analysisResult.document.excluded.reduce((o,f)=>(o[f.contentType]=(o[f.contentType]||0)+1,o),{}),grounding:"PASS"}});
    if(reportPath)emit({analysisReplay:snapshot(analysisResult.analysis)});
    stage='pdf-quiz';const quiz=await buildEducationalQuiz(analysisResult.document,analysisResult.analysis,{title:analysisResult.analysis.title.slice(0,100),count:5,scored:true},provider);
    if(reportPath)emit({quizReplay:{analysis:snapshot(quiz.analysis),questions:snapshot(quiz.questions),blueprint:quiz.blueprint,title:quiz.title,description:quiz.description,scored:quiz.scored,passingScore:quiz.passingScore,sourceName:quiz.sourceName,constructionGuides:buildConstructionGuides(quiz.blueprint.slots,buildConceptPool(quiz.analysis,quiz.sources),quiz.sources)}});
    await resident('after-quiz');stage='pdf-quality';const quality=validateQuiz(quiz),eventsForPDF=events.slice(callsBefore);
    emit({pdfResult:{executed:true,pass:quality.valid,qualityStatus:quality.status,score:quality.score,passCount:quality.passCount,warningQuestions:quality.warningQuestionCount,blockingQuestions:quality.blockingQuestionCount,quality,models:[...new Set(eventsForPDF.map(e=>e.modelRequested))],fallbackUsed:eventsForPDF.some(e=>e.fallbackUsed),calls:eventsForPDF.length,retries:eventsForPDF.filter(e=>e.formatRetry).length,questionCount:quiz.questions.length,rejected:quiz.questions.length-quality.validCount,issues:quality.issues,questions:quiz.questions.map(q=>({id:q.id,stem:q.stem,options:q.options,correctOptionId:q.correctOptionId,explanation:q.explanation,concept:quiz.analysis.keyConcepts.find(c=>c.id===q.concept)?.text,cognitiveLevel:q.cognitiveLevel,sourceFragmentIds:q.sourceFragmentIds,sourcePages:q.sourceReferences.map(r=>r.page),valid:quality.questions.find(item=>item.id===q.id)?.status!=="BLOCKING",status:quality.questions.find(item=>item.id===q.id)?.status})),responseMs:Date.now()-started}});
    if(!quality.valid)process.exitCode=1;
  }catch(error){
    const safeError=error instanceof IntelligenceError?error.message:error instanceof ZodError?'La salida no cumple el contrato estructurado.':error instanceof Error&&/^(Análisis sin respaldo:|El análisis |No hay suficiente|El texto supera|Esta versión)/.test(error.message)?error.message:'No se pudo completar la regresión del documento.';
    const eventsForPDF=events.slice(callsBefore);
    emit({pdfResult:{executed:true,pass:false,stage,analysisObtained:!!analysisResult,models:[...new Set(eventsForPDF.map(e=>e.modelRequested))],fallbackUsed:eventsForPDF.some(e=>e.fallbackUsed),calls:eventsForPDF.length,retries:eventsForPDF.filter(e=>e.formatRetry).length,questionCount:0,rejected:null,error:safeError,responseMs:Date.now()-started}});process.exitCode=1;
  }finally{if(memory)emit({memoryObservation:await memory.stop()});}
}
main().catch(error=>{console.log(JSON.stringify({error:error instanceof IntelligenceError?error.message:'No se pudo ejecutar la comprobación de configuración.'}));process.exitCode=1;});
