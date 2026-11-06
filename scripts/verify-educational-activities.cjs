/* eslint-disable @typescript-eslint/no-require-imports */
// Read-only local PDF regression. Never invokes AI unless --ai is explicitly provided.
require('../tests/register.cjs');
const fs=require('node:fs'),path=require('node:path');
const {extractPDF}=require('../src/lib/pdf/extract.ts'),{normalizeDocument}=require('../src/lib/content/normalize.ts');
const {buildActivityKnowledge}=require('../src/lib/activities/activity-knowledge.ts'),{prepareTimeline}=require('../src/lib/activities/timeline-detection.ts'),{prepareSimulation}=require('../src/lib/activities/simulation-detection.ts');
const {validateTimeline}=require('../src/lib/activities/timeline-quality.ts'),{validateSimulation}=require('../src/lib/activities/simulation-quality.ts'),{timelineAdapter}=require('../src/lib/activities/timeline-adapter.ts'),{simulationAdapter}=require('../src/lib/activities/simulation-adapter.ts');
const args=process.argv.slice(2),value=key=>args[args.indexOf(key)+1],out=path.resolve(args.includes('--out')?value('--out'):'artifacts/final-polish/pedagogy/current');
async function main(){
 if(!args.includes('--pdf'))throw Error('Usage: node scripts/verify-educational-activities.cjs --pdf <local.pdf> [--out <D: directory>] [--ai]');
 if(process.platform==='win32'&&!out.toLowerCase().startsWith('d:\\'))throw Error('Artifacts must remain on D:.');
 const pdf=path.resolve(value('--pdf')),started=performance.now(),extracted=await extractPDF(new File([fs.readFileSync(pdf)],path.basename(pdf),{type:'application/pdf'})),doc=normalizeDocument(extracted),knowledge=buildActivityKnowledge([...doc.fragments,...doc.excluded]),events=[];
 const timeline=prepareTimeline(doc.fragments,doc.documentId,'33333333-3333-4333-8333-333333333333',path.basename(pdf,'.pdf').slice(0,100),undefined,5);
 let simulation=prepareSimulation(doc.fragments,doc.documentId,'44444444-4444-4444-8444-444444444444',path.basename(pdf,'.pdf').slice(0,100));
 if(args.includes('--ai')){process.loadEnvFile('.env.local');const {providerConfig,createContentIntelligenceProvider}=require('../src/lib/content/provider.server.ts'),{writeSimulationCase}=require('../src/lib/activities/simulation-case-generation.ts');const config=providerConfig();if(config.provider!=='ollama')throw Error('This explicit regression expects the existing Ollama provider.');simulation=await writeSimulationCase(doc.fragments,doc.documentId,simulation.id,simulation.title,createContentIntelligenceProvider(config,fetch,undefined,e=>events.push(e)));}
 const timelineQuality=validateTimeline(timeline,doc.fragments,doc.documentId),simulationQuality=validateSimulation(simulation,doc.fragments,doc.documentId),report={scope:args.includes('--ai')?'REAL_PDF_EXPLICIT_REAL_PROVIDER':'REAL_PDF_DETERMINISTIC_NO_INFERENCE',pages:extracted.pageTexts.map(p=>({page:p.page,characters:p.text.length})),documentId:doc.documentId,knowledge,elapsedMs:performance.now()-started,aiCalls:events.length,attempts:events,timeline,timelineQuality,simulation,simulationQuality};
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'activity-results.json'),JSON.stringify(report,null,2));
 for(const [name,activity,adapter,quality] of [['timeline',timeline,timelineAdapter,timelineQuality],['simulation',simulation,simulationAdapter,simulationQuality]]){if(!quality.valid)throw Error(name+' pedagogical validation failed; ZIP is not offered.');const zip=adapter.package(activity,doc.fragments);adapter.validate(zip,activity,doc.fragments);fs.writeFileSync(path.join(out,name+'-scorm12.zip'),zip);}
 console.log(JSON.stringify({pages:report.pages,timeline:timelineQuality.status,simulation:simulationQuality.status,aiCalls:events.length,output:out}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
