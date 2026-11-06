/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto'),{unzipSync,strFromU8}=require('fflate');
const {quiz}=require('./content-fixture.cjs');
const {rouletteFromQuiz,rouletteSpecSchema,activityDefinition}=require('../src/lib/activities/schema.ts');
const {createRouletteEngine,rouletteRotation}=require('../src/lib/activities/roulette-engine.ts');
const {rouletteEngineSource,rouletteRotationSource}=require('../src/lib/activities/roulette-engine-source.ts');
const {packageActivity,validateActivityArtifact,registeredActivity,validateActivity}=require('../src/lib/activities/registry.ts');
const {learnerRuntime}=require('../src/lib/scorm/learner-assets.ts');
const {packageSCORM}=require('../src/lib/scorm/package.ts');
const spec=()=>rouletteFromQuiz(quiz,randomUUID(),randomUUID(),1);
test('portable roulette engine is synchronized with its typed implementation and independent of Next minification',()=>{assert.equal(rouletteEngineSource,createRouletteEngine.toString());assert.equal(rouletteRotationSource,rouletteRotation.toString());});
const model=(patch={})=>{const s=spec();return {...s,fingerprint:'unit-v1',questions:quiz.questions,settings:{...s.settings,...patch}};};
const select=(engine,state,correct=true,time=1000)=>{assert(engine.spin(state));engine.begin(state,time);const q=quiz.questions.find(q=>q.id===state._model?.segments?.[state.x]?.questionId)||quiz.questions[state.x];engine.answer(state,q.options.findIndex(o=>(o.id===q.correctOptionId)===correct),time+100);engine.next(state);};

test('multi-activity contracts retain Quiz and reject unimplemented engines, duplicates and incoherent completion',()=>{
 const a=spec();assert(rouletteSpecSchema.safeParse(a).success);assert.equal(activityDefinition(quiz,a.id,a).type,'ROULETTE');assert.equal(activityDefinition(quiz,a.id,null).type,'QUIZ');
 assert.equal(typeof registeredActivity('TIMELINE').package,'function');assert.equal(typeof registeredActivity('SIMULATION').package,'function');
 assert(!rouletteSpecSchema.safeParse({...a,segments:[a.segments[0],a.segments[0],a.segments[2]]}).success);
 assert(!rouletteSpecSchema.safeParse({...a,settings:{...a.settings,repeatSegments:true}}).success);
 assert(!rouletteSpecSchema.safeParse({...a,settings:{...a.settings,completion:'draws',drawCount:5}}).success);
 const bad=structuredClone(a);bad.segments[0].questionId='unknown';assert(!validateActivity(quiz,bad).valid);
});
test('roulette selection is reproducible, never repeats in first coverage, locks simultaneous spins and matches pointer geometry',()=>{
 const e=createRouletteEngine(model()),a=e.initial(12),b=e.initial(12);a.p=b.p='wheel';const seen=new Set();
 for(let i=0;i<3;i++){assert(e.spin(a));assert(e.spin(b));assert.equal(a.x,b.x);assert(!seen.has(a.x));seen.add(a.x);assert.equal(e.spin(a),false);const angle=rouletteRotation(a.x,3,900);assert(Math.abs(((a.x+.5)*120+angle)%360)<.0001);e.begin(a,1000);e.begin(b,1000);e.answer(a,0,1001);e.answer(b,0,1001);e.next(a);e.next(b);}
 assert.equal(a.p,'results');assert.equal(seen.size,3);assert.equal(e.spin(a),false);
});
test('scoring follows answers, attempts and time; practice repetitions cannot earn points',()=>{
 let e=createRouletteEngine(model({attempts:2,timeLimitSeconds:10})),s=e.initial(1);s.p='wheel';e.spin(s);e.begin(s,1000);const q=quiz.questions[s.x],wrong=q.options.findIndex(o=>o.id!==q.correctOptionId),right=q.options.findIndex(o=>o.id===q.correctOptionId);
 assert(e.answer(s,wrong,1100));assert(e.canRetry(s,1200));assert.equal(e.score(s),0);assert(e.retry(s,1200));assert(e.answer(s,right,1300));assert.equal(e.score(s),33);assert.equal(e.answer(s,right,1400),false);assert.equal(e.points(s),10);
 e=createRouletteEngine(model({timeLimitSeconds:1}));s=e.initial(1);s.p='wheel';e.spin(s);e.begin(s,0);e.answer(s,0,1000);assert.equal(s.timeout,true);assert.equal(e.score(s),0);assert.equal(e.canRetry(s,1001),false);
 e=createRouletteEngine(model({repeatSegments:true,completion:'draws',drawCount:5}));s=e.initial(2);s.p='wheel';for(let i=0;i<5;i++)select(e,s,true);assert.equal(s.p,'results');assert.equal(e.score(s),100);assert.equal(e.points(s),30);assert.equal(s.t.reduce((a,b)=>a+b,0),3);
});
test('resume contains compact state, preserves pending selection/deadline and rejects stale or invalid progress',()=>{
 const e=createRouletteEngine(model()),s=e.initial(33);s.p='wheel';e.spin(s);assert.deepEqual(e.restore(e.serialize(s)),s);e.begin(s,1000);assert.deepEqual(e.restore(e.serialize(s)),s);
 assert(e.serialize(s).length<4096);for(const patch of [{f:'stale'},{x:99},{a:[]},{r:-1},{s:-1},{p:'results'},{c:[true,false,false]},{d:-1}])assert.equal(e.restore(JSON.stringify({...s,...patch})),null);
 assert.equal(e.restore('x'.repeat(4097)),null);assert(!e.serialize(s).includes(quiz.questions[0].stem));
});
test('3, 5, 8 and 20 segments stay aligned, finish without repetition and fit the SCORM resume budget',()=>{
 for(const count of [3,5,8,20]){const m=model();m.questions=Array.from({length:count},(_,i)=>({...quiz.questions[0],id:'question-'+i}));m.segments=m.questions.map((q,i)=>({id:'s'+i,questionId:q.id}));const e=createRouletteEngine(m),s=e.initial(55);s.p='wheel';const used=new Set();
  for(let i=0;i<count;i++){assert(e.spin(s));assert(!used.has(s.x));used.add(s.x);assert(Math.abs(((s.x+.5)*360/count+rouletteRotation(s.x,count))%360)<.001);e.begin(s,1000);e.answer(s,0,1001);e.next(s);assert(e.serialize(s).length<=4096);}assert.equal(s.p,'results');assert.equal(used.size,count);assert(e.restore(e.serialize(s)));}
});
test('Roulette ZIP is self-contained, current teacher data is validated and Quiz runtime bytes stay unchanged',()=>{
 const a=spec(),bytes=packageActivity(quiz,a),files=unzipSync(bytes);assert.deepEqual(Object.keys(files).sort(),['imsmanifest.xml','index.html','runtime.js','styles.css']);assert(strFromU8(files['imsmanifest.xml']).includes('ROULETTE'));assert(validateActivityArtifact(bytes,quiz,a).html.includes('Girar ruleta'));
 assert.throws(()=>validateActivityArtifact(bytes,{...quiz,title:'Título editado'},a));assert.equal(createHash('sha256').update(learnerRuntime).digest('hex'),'52b795adf90cd000743ab00fe28db8cfe2863bbd00461b184626fc548fc0e7f2');
 const old=unzipSync(packageSCORM(quiz)),same=unzipSync(packageActivity(quiz,null));for(const key of Object.keys(old))assert.deepEqual(old[key],same[key]);
 assert(!strFromU8(files['index.html']).includes('https://'));assert(!strFromU8(files['runtime.js']).includes('fetch('));
});
