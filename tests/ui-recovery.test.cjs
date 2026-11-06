/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {visualFaults,cssFaults}=require('./visual/structural-health.cjs');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {PipelineProgress}=require('../src/components/ui/pipeline-progress.tsx');
const {conceptLabel}=require('../src/lib/content/presentation.ts');
const {validateQuiz}=require('../src/lib/content/quality.ts');
const {quiz}=require('./content-fixture.cjs');
const {analyzeDocumentDeterministically}=require('../src/lib/content/deterministic-analysis.server.ts'),{canPrecompileTarget}=require('../src/lib/content/lean-question-compiler.ts'),{extracted}=require('./content-fixture.cjs');
test('programming failures remain technical errors instead of being reclassified as insufficient academic material',()=>{
 const p=analyzeDocumentDeterministically(extracted),target=p.candidates.find(c=>!c.name.includes('|')),source=p.document.fragments.find(f=>target.sourceFragmentIds.includes(f.id));Object.defineProperty(source,'normalizedText',{get(){throw new TypeError('Synthetic implementation fault');}});assert.throws(()=>canPrecompileTarget(target,p),TypeError);
});
test('Tailwind processes only the directive entry, never Studio/feature/font CSS',()=>{
 const config=require('../next.config.ts').default;
 assert.deepEqual(Object.keys(config.turbopack.rules),['globals.css']);
 assert(fs.readFileSync('src/app/globals.css','utf8').startsWith('@import "tailwindcss";'));
 assert(!/@(import|reference|theme|variant|config|plugin|apply|tailwind)\b/.test(fs.readFileSync('src/app/studio.css','utf8')));
});
test('global CSS protection detects source substitution, structural loss and palette/illustration regressions',()=>{
 assert.deepEqual(cssFaults(fs.readFileSync('src/app/studio.css','utf8')),[]);
 assert(cssFaults(fs.readFileSync('src/app/globals.css','utf8')).length>=2);
 const healthy={scrollWidth:1440,primary:'#00549b',navy:'#082b4c',bodyFont:'Inter',motifs:[{width:260,height:128}],nodes:{'.creative-workspace-grid':{width:1240,display:'grid'},'.creation-companion':{width:240,display:'block'}}};
 assert.deepEqual(visualFaults(healthy,1440),[]);
 const broken=structuredClone(healthy);broken.primary='#2459d3';broken.scrollWidth=2000;broken.motifs[0].width=900;broken.nodes['.creative-workspace-grid'].display='block';assert.equal(visualFaults(broken,1440).length,4);
});
test('shared progress renders real complete/running/pending/error states with accessible status and error detail',()=>{
 const html=renderToStaticMarkup(React.createElement(PipelineProgress,{steps:['complete','running','pending','error'].map(status=>({id:status,label:status,status,detail:status==='error'?'No se pudo procesar el documento':undefined}))}));
 for(const state of ['complete','running','pending','error'])assert(html.includes(`data-status="${state}"`));
 assert.equal((html.match(/aria-current="step"/g)||[]).length,1);assert(html.includes('No se pudo procesar el documento'));assert(html.includes('lucide-check'));assert(html.includes('lucide-loader-circle'));
});
test('concept presentation abbreviates propositions without mutating the canonical target',()=>{
 const text='NubeVerde es viable técnicamente para Empresa Ficticia como SaaS multiempresa. La apuesta comercial es moderada';
 assert.equal(conceptLabel(text),'NubeVerde');assert.equal(conceptLabel('Arquitectura de información'),'Arquitectura de información');assert(text.includes('es viable técnicamente'));
});
test('INFO is retained separately, global warnings are not multiplied into every question and genuine conflicts still block',()=>{
 const q=structuredClone(quiz);q.questions[1].options[1].text=q.questions[0].options[1].text;
 const quality=validateQuiz(q);assert(quality.issues.some(i=>i.code==='option_reuse'&&i.severity==='INFO'));assert(quality.infoCount>0);assert.equal(quality.warningCount,quality.issues.filter(i=>i.severity==='WARNING').length);
 assert(quality.questions.every(item=>item.issues.every(i=>i.questionId!==null||i.severity==='BLOCKING')));
 const correct=q.questions[0].correctOptionId,wrong=q.questions[0].options.find(o=>o.id!==correct);q.questions[0].explanation='La respuesta correcta es '+wrong.text;
 const blocked=validateQuiz(q);assert(blocked.issues.some(i=>i.code==='answer_explanation_conflict'&&i.severity==='BLOCKING'));assert.equal(q.questions[0].correctOptionId,correct);assert.equal(blocked.valid,false);
});
