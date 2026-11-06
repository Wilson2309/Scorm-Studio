/* eslint-disable @typescript-eslint/no-require-imports */
require('../tests/register.cjs');require('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const fs=require('node:fs'),path=require('node:path');
const {extractPDF}=require('../src/lib/pdf/extract.ts');
const {analyzeDocumentDeterministically}=require('../src/lib/content/deterministic-analysis.server.ts');
const {buildHybridPlan}=require('../src/lib/content/hybrid-plan.ts');
const {buildLeanHybridContext,leanPromptData}=require('../src/lib/content/lean-question-compiler.ts');
const {generateHybridQuiz}=require('../src/lib/content/hybrid-pipeline.server.ts');
const {providerConfig,createContentIntelligenceProvider,IntelligenceError}=require('../src/lib/content/provider.server.ts');
const {validateQuiz}=require('../src/lib/content/quality.ts');
async function main(){
 const fileIndex=process.argv.indexOf('--pdf'),reportIndex=process.argv.indexOf('--report');
 const filePath=process.argv[fileIndex+1];if(fileIndex<0||!filePath)throw new Error('Use --pdf with the real PDF path.');
 const reportPath=reportIndex>=0?process.argv[reportIndex+1]:null;
 const started=performance.now(),extracted=await extractPDF(new File([fs.readFileSync(filePath)],path.basename(filePath),{type:'application/pdf'}));
 const prepared=analyzeDocumentDeterministically(extracted),plan=buildHybridPlan(prepared,5),context=buildLeanHybridContext(prepared,plan);
 const report={phase:'02.5.1',preparation:{documentId:prepared.document.documentId,pages:extracted.pages,characters:extracted.text.length,extractionAndPreparationMs:performance.now()-started,analysisMs:prepared.preprocessingMs,candidates:prepared.candidates,ranking:prepared.ranking,relations:prepared.relations},blueprint:plan.blueprint,compiled:context.leanContext.slots,context:{canonicalSourceIds:context.sources.map(f=>f.id),sourceChars:context.leanContext.slots.reduce((n,s)=>n+s.canonicalEvidence.length,0),compactDataChars:JSON.stringify(leanPromptData(context)).length},attempts:[],educationalRequests:0};
 const save=()=>{if(reportPath)fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');};
 console.log(JSON.stringify({preparation:{pages:extracted.pages,candidates:prepared.candidates.length,relations:prepared.relations.length,totalMs:report.preparation.extractionAndPreparationMs},slots:plan.blueprint.slots.map(s=>({id:s.slotId,concept:s.targetConcept,level:s.cognitiveLevel,family:s.questionFamily,sources:s.allowedSourceFragmentIds})),context:report.context}));save();
 if(process.argv.includes('--prepare-only'))return;
 const config=providerConfig();if(config.provider!=='ollama'||config.model!=='qwen3:4b-instruct')throw new Error('The regression requires the unchanged Qwen3 Ollama configuration.');
 const provider=createContentIntelligenceProvider(config,async(url,init)=>{
  if(String(url).endsWith('/api/chat')){report.educationalRequests++;if(report.educationalRequests>1)throw new Error('Automatic extra inference is forbidden.');}
  return fetch(url,init);
 },undefined,event=>{report.attempts.push(event);save();console.log(JSON.stringify({attempt:event}));});
 const llmStarted=performance.now();
 try{
  const quiz=await generateHybridQuiz(prepared,{title:prepared.analysis.title.slice(0,100),count:5,scored:true},provider);
  report.llmAndValidationMs=performance.now()-llmStarted;report.totalMs=performance.now()-started;
  report.quiz=JSON.parse(JSON.stringify(quiz,(key,value)=>['sources','sourceReferences'].includes(key)?undefined:value));report.quality=validateQuiz(quiz);save();
  console.log(JSON.stringify({result:{calls:report.educationalRequests,totalMs:report.totalMs,llmAndValidationMs:report.llmAndValidationMs,pass:report.quality.passCount,warning:report.quality.warningQuestionCount,blocking:report.quality.blockingQuestionCount,questions:quiz.questions.map(q=>({id:q.id,stem:q.stem,options:q.options,correctOptionId:q.correctOptionId,explanation:q.explanation,concept:q.concept,level:q.cognitiveLevel,family:q.questionFamily,sources:q.sourceFragmentIds}))}}));
 }catch(error){report.error=error instanceof IntelligenceError?error.message:'La respuesta no pudo validarse; no se aceptó contenido.';report.totalMs=performance.now()-started;save();console.log(JSON.stringify({error:report.error,calls:report.educationalRequests,totalMs:report.totalMs}));process.exitCode=1;}
}
main().catch(()=>{console.log(JSON.stringify({error:'No se pudo preparar la regresión híbrida.'}));process.exitCode=1;});
