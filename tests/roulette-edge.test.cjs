/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),{createRouletteEngine}=require('../src/lib/activities/roulette-engine.ts');
const {largeRouletteFixture}=require('./roulette-large-fixture.cjs'),{validateActivity,packageActivity,validateActivityArtifact}=require('../src/lib/activities/registry.ts');
const {approvedRouletteStyles}=require('../src/lib/activities/roulette-renderer.ts'),{unzipSync,zipSync,strToU8}=require('fflate');
const {rouletteSpecSchema}=require('../src/lib/activities/schema.ts');
test('out-of-range configuration and missing/invalid answers are rejected before export',async()=>{
 const {quiz,spec}=await largeRouletteFixture();
 for(const next of [{...spec,segments:spec.segments.slice(0,2)},{...spec,segments:[...spec.segments,{id:'extra',questionId:'missing',label:'Extra'}]},{...spec,settings:{...spec.settings,attempts:0}},{...spec,settings:{...spec.settings,timeLimitSeconds:-1}},{...spec,segments:spec.segments.map((s,i)=>i?s:{...s,label:'X'.repeat(41)})}])assert.equal(rouletteSpecSchema.safeParse(next).success,false);
 const bad=structuredClone(quiz);bad.questions[0].correctOptionId='missing';assert.equal(validateActivity(bad,spec).valid,false);bad.questions[0].sourceFragmentIds=[];assert.equal(validateActivity(bad,spec).valid,false);
});
test('approved legacy stylesheet remains downloadable; arbitrary CSS, changed runtime or stale question data never passes',async()=>{
 const {quiz,spec}=await largeRouletteFixture(),files=unzipSync(packageActivity(quiz,spec));files['styles.css']=strToU8(approvedRouletteStyles[0]);const old=zipSync(files);assert(validateActivityArtifact(old,quiz,spec).html.includes(approvedRouletteStyles[0]));
 files['styles.css']=strToU8(approvedRouletteStyles[0]+'/* unapproved alteration */');assert.throws(()=>validateActivityArtifact(zipSync(files),quiz,spec));
 files['styles.css']=strToU8(approvedRouletteStyles[0]);files['runtime.js']=strToU8('altered');assert.throws(()=>validateActivityArtifact(zipSync(files),quiz,spec));
 assert.throws(()=>validateActivityArtifact(old,{...quiz,title:'Otra revisión del contenido'},spec));
});
test('maximum twenty-segment activity is canonically sourced, validates and exports a real self-contained ZIP',async()=>{
 const {quiz,spec}=await largeRouletteFixture(),quality=validateActivity(quiz,spec);assert(quality.valid,JSON.stringify(quality.issues));assert.equal(spec.segments.length,20);assert.equal(spec.segments[0].label.length,40);
 const bytes=packageActivity(quiz,spec);validateActivityArtifact(bytes,quiz,spec);assert(bytes.length>1000);
});
test('spin interruption resumes the selected segment and initializes its timer once; deadline/retry races cannot add credit',async()=>{
 const {quiz,spec}=await largeRouletteFixture(),model={...spec,fingerprint:'edge',questions:quiz.questions,settings:{...spec.settings,timeLimitSeconds:1,attempts:2}},e=createRouletteEngine(model),s=e.initial(20);s.p='wheel';assert(e.spin(s));const selected=s.x,restored=e.restore(e.serialize(s));assert.equal(restored.x,selected);assert.equal(restored.p,'spinning');assert.equal(e.spin(restored),false);e.begin(restored,500);const deadline=restored.d;e.begin(restored,900);assert.equal(restored.d,deadline);
 assert(e.answer(restored,1,1000));assert(e.retry(restored,1100));assert.equal(restored.d,deadline);assert(e.answer(restored,0,1500));assert.equal(restored.timeout,true);assert.equal(e.score(restored),0);assert.equal(e.answer(restored,0,1501),false);assert.equal(e.retry(restored,1501),false);e.next(restored);const draws=restored.r;e.next(restored);assert.equal(restored.r,draws);
});
test('forty draws with practice repetition never increase unique-question credit, attempts or SCORM resume size',async()=>{
 const {quiz,spec}=await largeRouletteFixture(),e=createRouletteEngine({...spec,fingerprint:'practice',questions:quiz.questions,settings:{...spec.settings,repeatSegments:true,completion:'draws',drawCount:40}}),s=e.initial(40);s.p='wheel';
 for(let i=0;i<40;i++){assert(e.spin(s));e.begin(s,1000+i);assert(e.answer(s,0,1001+i));e.next(s);assert(e.serialize(s).length<=4096);}
 assert.equal(s.p,'results');assert.equal(e.score(s),100);assert.equal(e.points(s),20*spec.settings.pointsPerCorrect);assert.equal(s.t.reduce((a,b)=>a+b,0),20);assert(e.restore(e.serialize(s)));assert.equal(e.spin(s),false);
});
