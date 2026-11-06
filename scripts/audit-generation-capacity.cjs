/* eslint-disable @typescript-eslint/no-require-imports */
// Read-only educational input audit; never constructs a provider or calls an LLM.
require('../tests/register.cjs');
const fs=require('node:fs'),path=require('node:path'),{performance}=require('node:perf_hooks');
const {extractPDF}=require('../src/lib/pdf/extract.ts'),{analyzeDocumentDeterministically,InsufficientAcademicContentError}=require('../src/lib/content/deterministic-analysis.server.ts');
const {buildHybridPlan,AssessmentCapacityError}=require('../src/lib/content/hybrid-plan.ts'),{precompileSlots}=require('../src/lib/content/lean-question-compiler.ts');
const {pdfBytes}=require('../tests/pdf-fixture.cjs');
async function main(){
 const files=process.argv.slice(2),report={scope:'REAL_PDF_EXTRACTION_DETERMINISTIC_COMPILATION_ONLY',educationalInferences:0,documents:[]};
 const inputs=files.map(file=>({name:path.basename(file),bytes:fs.readFileSync(file)}));inputs.push({name:'contenido-breve-sintetico.pdf',bytes:pdfBytes('El metodo Alfa organiza documentos con etiquetas de colores para facilitar su busqueda dentro del archivo escolar.')});
 for(const input of inputs){const started=performance.now(),extracted=await extractPDF(new File([input.bytes],input.name,{type:'application/pdf'})),record={name:input.name,pages:extracted.pages,characters:extracted.text.length,extraction:'PASS',requests:[]};
  try{const prepared=analyzeDocumentDeterministically(extracted);record.candidates=prepared.candidates.length;for(const count of [3,5,10,15,20])try{const slots=precompileSlots(prepared,buildHybridPlan(prepared,count));record.requests.push({requested:count,status:'PASS',slots:slots.length,grounded:slots.every(s=>s.correctAnswer.sourceFragmentIds.every(id=>prepared.document.fragments.some(f=>f.id===id)))});}catch(e){if(!(e instanceof AssessmentCapacityError))throw e;record.requests.push({requested:count,status:'INSUFFICIENT_CONTENT',available:e.available,code:e.code});}}
  catch(e){if(!(e instanceof InsufficientAcademicContentError))throw e;record.preparation='INSUFFICIENT_CONTENT';record.available=0;}
  record.elapsedMs=Math.round(performance.now()-started);report.documents.push(record);
 }
 fs.mkdirSync('artifacts/ui-recovery',{recursive:true});fs.writeFileSync('artifacts/ui-recovery/generation-capacity.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
if(require.main===module)main().catch(e=>{console.log(JSON.stringify({status:'TECHNICAL_ERROR',kind:e.name}));process.exitCode=1;});
