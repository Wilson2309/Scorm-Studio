/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {fixture,chronological,process:processText,insufficient}=require('./timeline-fixture.cjs');
const {normalizeDocument}=require('../src/lib/content/normalize.ts'),{extracted}=require('./timeline-fixture.cjs');
const {detectTimelines,datesIn}=require('../src/lib/activities/timeline-detection.ts');
const {validateTimeline,timelineConstraints}=require('../src/lib/activities/timeline-quality.ts');
const {dateBounds}=require('../src/lib/activities/timeline-schema.ts');
const {createTimelineEngine}=require('../src/lib/activities/timeline-engine.ts');
const {timelineAdapter}=require('../src/lib/activities/timeline-adapter.ts');
const {educationalActivitySchema}=require('../src/lib/activities/schema.ts');
const {unzipSync,strFromU8,zipSync,strToU8}=require('fflate');
const model=(mode='ORDERING',constraints=[{before:0,after:1},{before:1,after:2}])=>({fingerprint:'test-v1',mode,count:3,constraints,requireAll:true,allowBack:true,retry:true,maxAttempts:2,passingScore:70});
function explore(engine,s){engine.start(s);engine.visit(s,1);engine.visit(s,2);assert(engine.finishExploration(s));}
test('timeline dated/process/insufficient PDF fixtures retain canonical identifiers and avoid fictional dates',()=>{
 const a=fixture(chronological),b=fixture(processText),c=normalizeDocument(extracted(insufficient));
 assert.equal(a.spec.mode,'CHRONOLOGICAL_TIMELINE');assert.deepEqual(a.spec.events.map(e=>e.date.start),['2001','2005','2010']);assert.equal(b.spec.mode,'PROCESS_TIMELINE');assert(b.spec.events.every(e=>e.date===null));assert.equal(detectTimelines(c.fragments).candidates.length,0);
 for(const f of [a,b]){assert.equal(f.spec.events.length,3);assert.equal(validateTimeline(f.spec,f.document.fragments,f.document.documentId).valid,true);assert(f.spec.events.every(e=>e.sourceFragmentIds.every(id=>f.document.fragments.some(s=>s.id===id))));}
 assert.deepEqual(fixture().spec.events.map(e=>e.id),a.spec.events.map(e=>e.id));
});
test('timeline dates validate calendar precision, ranges and exact canonical date evidence',()=>{
 assert.equal(dateBounds('2023-02-29'),null);assert.notEqual(dateBounds('2024-02-29'),null);assert.equal(dateBounds('2024-13'),null);
 assert.equal(datesIn('El 29 de febrero de 2024 se verificó el sistema.')[0].start,'2024-02-29');assert.equal(datesIn('Entre 2001–2005 se construyó el prototipo.')[0].end,'2005');assert.equal(datesIn('En 31/02/2024 ocurrió algo.').length,0);
 assert.equal(datesIn('El sistema cifra 2048 bits y admite 2000 usuarios.').length,0);
 assert.equal(datesIn('El 2024-02-29 se verificó el sistema.')[0].start,'2024-02-29');
 for(const text of ['En mayo de 2024 se verificó el sistema.','El 2024-05 se verificó el sistema.','En 05/2024 se verificó el sistema.'])assert.equal(datesIn(text)[0].start,'2024-05');
 const {spec,document}=fixture();spec.events[0].date.start='1999';assert(validateTimeline(spec,document.fragments).issues.some(i=>['unsupported_date','date_label'].includes(i.code)&&i.severity==='BLOCKING'));
});
test('bibliographic access dates do not become educational events, while real month-dated milestones remain',()=>{
 const academic=fixture().document.fragments.find(f=>f.contentType==='academic');
 const metadata=[{...academic,text:'En 2025 se registraron los indicadores agregados del sector para el estudio.\nConsulta realizada para esta propuesta en noviembre de 2026.'}];
 assert.equal(detectTimelines(metadata).candidates.length,0);
 const milestones=[{...academic,text:'En mayo de 2001 se implementaron los requisitos del primer servicio.\nEn junio de 2005 se construyo el prototipo funcional del servicio.'}];
 assert.deepEqual(detectTimelines(milestones).candidates[0].events.map(e=>e.date.start),['2001-05','2005-06']);
});
test('timeline unknown/foreign/admin references, missing evidence and malformed/duplicate events block export',()=>{
 const {spec,document}=fixture();for(const mutate of [s=>s.events[0].sourceFragmentIds=['p99-f001'],s=>s.events[0].sourceFragmentIds=[],s=>s.events[1].id=s.events[0].id,s=>s.events[1].position=0,s=>s.events[0].title='',s=>s.events=s.events.slice(0,1),s=>s.documentId='b'.repeat(64)]){const s=structuredClone(spec);mutate(s);assert.equal(validateTimeline(s,document.fragments,document.documentId).valid,false);}
 const foreign=structuredClone(document.fragments);foreign.forEach(f=>f.documentId='a'.repeat(64));assert.equal(validateTimeline(spec,foreign).valid,false);
 const admin=structuredClone(document.fragments);admin.forEach(f=>f.contentType='administrative');assert.equal(validateTimeline(spec,admin).valid,false);
});
test('timeline simultaneous dates accept either relative order; no invented ordering for overlapping periods',()=>{
 const {spec,document}=fixture();spec.events[1].date=structuredClone(spec.events[0].date);spec.events[1].sourceFragmentIds=spec.events[0].sourceFragmentIds;spec.assessment.mode='ORDERING';const q=validateTimeline(spec,document.fragments);assert(q.valid);assert(!q.constraints.some(c=>c.before===0&&c.after===1));const e=createTimelineEngine(model('ORDERING',q.constraints)),s=e.initial();explore(e,s);s.o=[1,0,2];e.submit(s);assert.equal(s.score,100);
});
test('source process order cannot be silently changed; explicit teacher order and teacher content remain labelled',()=>{
 const {spec,document}=fixture(processText);spec.assessment.mode='ORDERING';spec.events.reverse();spec.events.forEach((e,i)=>e.position=i);assert(!validateTimeline(spec,document.fragments).valid);spec.assessment.orderBasis='teacher';assert(!validateTimeline(spec,document.fragments).valid);spec.assessment.teacherOrderConfirmed=true;spec.events[0].provenance='teacher';assert(validateTimeline(spec,document.fragments).valid);assert(validateTimeline(spec,document.fragments).issues.some(i=>i.code==='teacher_content'&&i.severity==='INFO'));
});
test('exploration completion is unscored and requires visits; back navigation policy enforced',()=>{
 const e=createTimelineEngine({...model('EXPLORATORY'),allowBack:false}),s=e.initial();assert(!e.visit(s,0));e.start(s);assert(!e.finishExploration(s));assert(!e.visit(s,2));e.visit(s,1);assert(!e.visit(s,0));e.visit(s,2);assert(e.finishExploration(s));assert.equal(s.p,'results');assert.equal(s.score,null);assert(!e.submit(s));
});
test('ordering, attempts, retry, score and resume are deterministic without duplicate credit',()=>{
 const e=createTimelineEngine(model()),s=e.initial();explore(e,s);assert(e.submit(s));assert.equal(s.score,0);assert(!e.submit(s));assert(e.retry(s));e.move(s,2,0);e.move(s,2,1);assert(e.submit(s));assert.equal(s.score,100);assert(!e.retry(s));assert(e.complete(s));const raw=e.serialize(s),again=e.restore(raw);assert.equal(again.score,100);assert(!e.complete(again));assert(raw.length<4096);assert.equal(e.restore(raw.replace('test-v1','wrong')),null);assert.equal(e.restore('{'),null);assert(!e.move(s,0,1));assert(!e.move(e.initial(),-1,2));
});
test('identification requires all real answers, supports failing/passing result and rejects equivalent descriptions',()=>{
 const e=createTimelineEngine(model('IDENTIFICATION')),s=e.initial();explore(e,s);assert(!e.submit(s));for(let i=0;i<3;i++)e.identify(s,i,(i+1)%3);e.submit(s);assert.equal(s.score,0);e.retry(s);for(let i=0;i<3;i++)e.identify(s,i,i);e.submit(s);assert.equal(s.score,100);const f=fixture();f.spec.assessment.mode='IDENTIFICATION';f.spec.events[1].description=f.spec.events[0].description;assert(!validateTimeline(f.spec,f.document.fragments).valid);
});
test('versioned compact progress rejects forged score, duplicates, malformed arrays and oversized suspend data',()=>{
 const e=createTimelineEngine(model()),s=e.initial();explore(e,s);e.submit(s);s.score=100;assert.equal(e.restore(JSON.stringify(s)).score,0);s.o=[0,0,1];assert.equal(e.restore(JSON.stringify(s)),null);assert.throws(()=>e.serialize({...e.initial(),extra:'x'.repeat(5000)}),/límite/);
});
test('timeline adapter exports four deterministic self-contained files, escapes text and rejects stale/altered ZIP',()=>{
 const {spec,document}=fixture();spec.assessment.mode="EXPLORATORY";const bytes=timelineAdapter.package(spec,document.fragments),files=unzipSync(bytes);assert.deepEqual(Object.keys(files).sort(),['imsmanifest.xml','index.html','runtime.js','styles.css']);assert(timelineAdapter.validate(bytes,spec,document.fragments).html.includes('Demostración local'));assert(strFromU8(files['imsmanifest.xml']).includes('scormtype="sco"'));assert(!strFromU8(files['imsmanifest.xml']).includes('masteryscore'));files['runtime.js']=strToU8('alert(1)');assert.throws(()=>timelineAdapter.validate(zipSync(files),spec,document.fragments));const changed=structuredClone(spec);changed.title='Título cambiado';assert.throws(()=>timelineAdapter.validate(bytes,changed,document.fragments));assert(educationalActivitySchema.safeParse(spec).success);
});
test('timeline portable runtime is generated from the tested engine and stays synchronized',()=>{execFileSync(process.execPath,['scripts/build-timeline-runtime.cjs','--check']);assert(timelineConstraints(fixture().spec).length>0);});
test('explicit temporal connectors form a process; generic benefits, quantities and unordered lists do not',()=>{
 const text='PROCESO DOCUMENTADO\nPrimero, identificar las necesidades de los usuarios. Luego, preparar los datos de validación. Finalmente, verificar el resultado y documentar la comprobación.';const d=normalizeDocument(extracted(text));assert.equal(detectTimelines(d.fragments).candidates[0].mode,'PROCESS_TIMELINE');assert.equal(detectTimelines(d.fragments).candidates[0].events.length,3);const bad=normalizeDocument(extracted('VENTAJAS\n1. El sistema ofrece claridad para los usuarios y documentación accesible que describe cada componente de la arquitectura del producto.\n2. La solución permite mantenimiento de los componentes de la arquitectura y facilita la comprensión de sus responsabilidades por el equipo.'));assert.equal(detectTimelines(bad.fragments).candidates.length,0);
});
test('visible dates cannot contradict sorting dates, simultaneous events cannot gain an arbitrary teacher tie-break',()=>{
 const f=fixture();f.spec.events[0].provenance='teacher';f.spec.events[0].date.label='2099';assert(validateTimeline(f.spec,f.document.fragments).issues.some(i=>i.code==='date_label'&&i.severity==='BLOCKING'));f.spec.events[0].date.label='2001';f.spec.events[1].date=structuredClone(f.spec.events[0].date);f.spec.events[1].sourceFragmentIds=f.spec.events[0].sourceFragmentIds;f.spec.assessment={...f.spec.assessment,mode:'ORDERING',orderBasis:'teacher',teacherOrderConfirmed:true};assert(!timelineConstraints(f.spec).some(c=>c.before===0&&c.after===1));
});
test('a gap in the source process blocks assessment and a partial exploratory sequence warns without invented stages',()=>{
 const f=fixture(processText);f.spec.events=f.spec.events.filter((_,i)=>i!==1).map((e,i)=>({...e,position:i}));f.spec.assessment.mode='ORDERING';assert(validateTimeline(f.spec,f.document.fragments).issues.some(i=>i.code==='incomplete_process'));f.spec.assessment.mode='EXPLORATORY';const q=validateTimeline(f.spec,f.document.fragments);assert(q.valid);assert(q.issues.some(i=>i.code==='partial_coverage'&&i.severity==='WARNING'));
});
test('minimum and maximum event counts, teacher metadata and long labels have bounded progress without event text',()=>{
 const f=fixture();f.spec.events=f.spec.events.slice(0,2);assert(validateTimeline(f.spec,f.document.fragments).valid);const max=createTimelineEngine({...model('EXPLORATORY'),count:20}),s=max.initial();max.start(s);for(let i=1;i<20;i++)max.visit(s,i);max.finishExploration(s);assert(max.serialize(s).length<600);assert.equal(max.restore('x'.repeat(4097)),null);assert(!max.serialize(s).includes('sourceFragmentIds'));
});
