/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeDocument}=require('../src/lib/content/normalize.ts');
const {fixture:timelineFixture,file,process:steps,insufficient,id}=require('./timeline-fixture.cjs');
const {extractPDF}=require('../src/lib/pdf/extract.ts');
const {rankActivityEvidence}=require('../src/lib/activities/activity-evidence.ts');
const {detectTimelines,prepareTimeline}=require('../src/lib/activities/timeline-detection.ts');
const {detectSimulationCases,validateCaseWording}=require('../src/lib/activities/simulation-planning.ts');
const {prepareSimulation}=require('../src/lib/activities/simulation-detection.ts');
const {assembleSimulationCase}=require('../src/lib/activities/simulation-case-generation.ts');
const {validateTimeline}=require('../src/lib/activities/timeline-quality.ts');
const {validateSimulation}=require('../src/lib/activities/simulation-quality.ts');
const {timelineAdapter}=require('../src/lib/activities/timeline-adapter.ts'),{simulationAdapter}=require('../src/lib/activities/simulation-adapter.ts');
const {OllamaContentIntelligenceProvider,OLLAMA_DEFAULTS}=require('../src/lib/content/ollama-provider.server.ts');
// Independently authored synthetic fixtures. No academic document excerpts.
const crm='Procedimiento del invernadero ficticio\nLas cinco etapas secuenciales son: (1) Inspeccionar las bandejas y registrar el estado de las semillas; (2) Preparar macetas limpias con etiquetas de colores; (3) Distribuir las semillas en las macetas preparadas; (4) Colocar las macetas sobre las mesas del invernadero; y (5) Capacitar al equipo para revisar las etiquetas cada mañana.';
const business='Riego del invernadero ficticio\nCuando el depósito pierde agua por una válvula averiada, el problema impide regar las plantas del invernadero. La reparación de la válvula garantiza que el depósito conserve agua para regar las plantas del invernadero.';
const bi='El panel de riego: Consolida los registros del depósito de agua en una tabla para comparar el riego de las plantas del invernadero.';
const metadata='Docente: persona ficticia\nRESULTADO DE APRENDIZAJE: Revisar el ejercicio sintético de un invernadero imaginario.';
function document(){const pageTexts=[{page:1,text:metadata},{page:2,text:business+'\n'+bi},{page:3,text:crm}];return normalizeDocument({name:'Fragmentos-regresion.pdf',pages:3,text:pageTexts.map(p=>p.text).join('\n'),pageTexts,warnings:[]});}
function wording(plan){return {caseId:plan.caseId,title:'Inventario sincronizado y decisiones tecnológicas',scenario:plan.problem+' ¿Qué intervención priorizarías para resolver el problema de riego?',consequences:plan.actions.map(a=>({actionId:a.id,interpretation:`${a.evidence} Esta evidencia orienta la comparación con el problema de riego.`}))};}

test('activity evidence ranks the whole document, excludes wrapped administrative metadata and preserves canonical fragments',()=>{
 const d=document(),before=JSON.stringify(d.fragments),rank=rankActivityEvidence(d.fragments);assert(!rank.some(r=>r.text.includes('CPAE')||r.text.includes('RESULTADO DE APRENDIZAJE')));assert(rank.some(r=>r.source.page===2&&r.problem));assert(rank.some(r=>r.source.page===3&&r.process));assert.equal(JSON.stringify(d.fragments),before);
});
test('inline parenthesized invernadero stages survive PDF wrapping; all five share the actual page-3 evidence without artificial page quotas',()=>{
 const d=document(),s=prepareTimeline(d.fragments,d.documentId,id,'Implantación invernadero',undefined,5);assert.equal(s.events.length,5);assert(s.events.every(e=>e.ordinal&&e.date===null&&e.sourceFragmentIds.every(id=>d.fragments.find(f=>f.id===id).page===3)));assert.match(s.events[0].description,/Inspeccionar/);assert.match(s.events[4].description,/Capacitar/);assert.equal(validateTimeline(s,d.fragments).status,'PASS');timelineAdapter.validate(timelineAdapter.package(s,d.fragments),s,d.fragments);
});
test('numbered benefits are not a process; missing intermediate steps and mixed numbering do not establish a sequence',()=>{
 const d=document();for(const text of ['Ventajas: (1) Claridad del contenido; (2) Facilidad de mantenimiento; (3) Calidad de las respuestas.','El procedimiento tiene etapas secuenciales: (1) Preparar todos los requisitos; (3) Verificar los resultados completos.'])assert.equal(detectTimelines([{...d.fragments[0],text,sectionHeading:'Material educativo'}]).candidates.length,0);
});
test('another process PDF is extracted and generates its own source-grounded sequence, not invernadero-specific results',async()=>{
 const extracted=await extractPDF(file(steps)),d=normalizeDocument(extracted),s=prepareTimeline(d.fragments,d.documentId,id,'Validación del sistema');assert.equal(s.events.length,3);assert.match(s.events[0].description,/Identificar/);assert(validateTimeline(s,d.fragments).valid);
});
test('a business problem plus qualitative documented remedies produces a case without requiring numeric outcomes or if/else phrasing',()=>{
 const d=document(),plan=detectSimulationCases(d.fragments)[0];assert(plan);assert.match(plan.problem,/depósito pierde agua/);assert.equal(plan.actions.length,2);assert.match(plan.actions[0].label,/reparación de la válvula/);assert(plan.actions.some(a=>/panel de riego/.test(a.label)));assert(plan.actions.every(a=>a.evidence.length>60));assert(plan.sourceFragmentIds.every(id=>d.fragments.find(f=>f.id===id).page===2));
 const s=prepareSimulation(d.fragments,d.documentId,id,'Decisión de riego');assert(validateSimulation(s,d.fragments).valid);assert.equal(s.configuration.scored,true);assert(s.scenes[0].evaluation);assert(!s.scenes[0].choices.some(c=>/Proponer una aplicación|Examinar la evidencia/.test(c.text)));simulationAdapter.validate(simulationAdapter.package(s,d.fragments),s,d.fragments);
});
test('headings, table labels and the adjective Integral are not finite-action evidence',()=>{
 const d=document(),header={...d.fragments[0],id:'p1-f999',text:'2.2. METODOLOGÍA invernadero (PARTE I: ARQUITECTURA Y Gestión Integral de Relaciones',sectionHeading:'Unidad'};const plan=detectSimulationCases([...d.fragments,header])[0];assert(!plan.actions.some(a=>a.sourceFragmentIds.includes(header.id)));
});
test('explicit optional Ollama wording remains one request; identities, references and legacy unscored assembly stay application-owned',async()=>{
 const d=document(),plan=detectSimulationCases(d.fragments)[0],requests=[];
 const provider=new OllamaContentIntelligenceProvider({...OLLAMA_DEFAULTS,provider:'ollama',model:'qwen3:4b-instruct',numCtx:8192,keepAlive:'10m'},async(url,init)=>{requests.push({url,body:JSON.parse(init.body)});return Response.json({model:'qwen3:4b-instruct',done:true,done_reason:'stop',message:{content:JSON.stringify(wording(plan))}});},undefined,()=>{});
 const s=assembleSimulationCase(plan,d.documentId,id,'Caso revisable',await provider.generateSimulationCase(plan));assert.equal(requests.length,1);assert.match(requests[0].url,/api\/chat$/);assert(!requests[0].body.messages.some(m=>m.content.includes('CPAE')));assert.deepEqual(s.scenes[0].choices.map(c=>c.text),plan.actions.map(a=>a.label));assert(validateSimulation(s,d.fragments).valid);
});
test('invalid JSON is controlled with one request, no automatic repair or fallback',async()=>{
 const d=document();let calls=0;const provider=new OllamaContentIntelligenceProvider({...OLLAMA_DEFAULTS,provider:'ollama',model:'qwen3:4b-instruct'},async()=>{calls++;return Response.json({model:'qwen3:4b-instruct',done:true,message:{content:'not JSON'}});},undefined,()=>{});await assert.rejects(()=>provider.generateSimulationCase(detectSimulationCases(d.fragments)[0]));assert.equal(calls,1);
});
test('unknown/duplicate action identities, unrelated prose, invented numbers and incomplete qualitative explanations are rejected',()=>{
 const plan=detectSimulationCases(document().fragments)[0];for(const change of [w=>w.caseId='other',w=>w.consequences[0].actionId='unknown',w=>w.consequences[0].actionId=w.consequences[1].actionId,w=>w.scenario='Las plantas requieren nutrientes para crecer durante el invierno y mantener las raíces.',w=>w.consequences[0].interpretation+=' Mejora el 97%.',w=>w.consequences[0].interpretation='Una explicación cortada de riego y sincronización']){const w=wording(plan);change(w);assert.throws(()=>validateCaseWording(w,plan));}
});
test('old bad drafts fail pedagogical validation even with valid Zod and existing source IDs',()=>{
 const d=document(),s=prepareTimeline(d.fragments,d.documentId,id,'invernadero'),bad=structuredClone(s);bad.events[0].title='Idea 1: (CPAE) • 14 h Autónomo (CTA)';bad.events[0].description=metadata;assert(!validateTimeline(bad,d.fragments).valid);bad.events[0].description='La fotosíntesis transforma la radiación solar en energía para las plantas.';assert(validateTimeline(bad,d.fragments).issues.some(i=>i.code==='unrelated_source'));
 const sim=prepareSimulation(d.fragments,d.documentId,id,'Caso'),copy=structuredClone(sim.scenes[0]);copy.id='duplicate';sim.scenes.push(copy);assert(validateSimulation(sim,d.fragments).issues.some(i=>i.code==='repeated_decisions'&&i.severity==='BLOCKING'));
});
test('insufficient PDF yields an explicit review diagnosis, not a certified sequence or a concrete decision fabricated from reading order',()=>{
 const d=timelineFixture(insufficient).document,t=prepareTimeline(d.fragments,d.documentId,id,'Recorrido'),s=prepareSimulation(d.fragments,d.documentId,id,'Reflexión');assert.equal(detectTimelines(d.fragments).candidates.length,0);assert.equal(detectSimulationCases(d.fragments).length,0);assert.equal(t.mode,'CONCEPTUAL_TIMELINE');assert.equal(s.learningMode,'CONCEPT_EXPLORATION');assert(validateTimeline(t,d.fragments).valid);assert(validateSimulation(s,d.fragments).valid);assert(t.events.every(e=>e.date===null&&e.ordinal===null));
});
