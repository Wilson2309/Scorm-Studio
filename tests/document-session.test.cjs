/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {DocumentSession,OperationGate}=require('../src/lib/content/document-session.ts');
const {analysis,document,quiz}=require('./content-fixture.cjs');
const {buildEducationalQuiz}=require('../src/lib/content/pipeline.server.ts');
test('UI session deduplicates pending analysis and reuses it after rerenders and route remounts',async()=>{
  const session=new DocumentSession();let calls=0,resolve;
  const worker=()=>{calls++;return new Promise(r=>resolve=r);};
  const first=session.understand(worker),second=session.understand(worker);assert.equal(first,second);await Promise.resolve();assert.equal(calls,1);
  resolve({analysis,document});await first;
  // Each consumer remount receives the same DocumentProvider-owned session.
  for(let i=0;i<5;i++)assert.deepEqual(await session.understand(worker),{analysis,document});
  assert.equal(calls,1);assert.equal(session.understanding.analysis,analysis);
});
test('UI synchronous operation gate prevents duplicate clicks before the next React render',()=>{
  const gate=new OperationGate();assert.equal(gate.enter(),true);assert.equal(gate.enter(),false);gate.leave();assert.equal(gate.enter(),true);gate.leave();
});
test('failed analysis is retried only through an explicit action; new document has its own cache',async()=>{
  const session=new DocumentSession();let calls=0;
  await assert.rejects(session.understand(async()=>{calls++;throw new Error('busy');}));
  assert.equal(session.understanding,null);assert.equal(calls,1);
  await session.understand(async()=>{calls++;return {analysis,document};});assert.equal(calls,2);
  const replacement=new DocumentSession(session.id+1);assert.equal(replacement.understanding,null);assert.notEqual(replacement.id,session.id);
});
test('explicit cancellation cannot cache a late response for a replaced document',async()=>{
  const session=new DocumentSession();let finish;
  const pending=session.understand(()=>new Promise(resolve=>finish=resolve));await Promise.resolve();session.cancel();finish({analysis,document});
  await assert.rejects(pending,error=>error.name==='AbortError');assert.equal(session.understanding,null);
});
test('one normal quiz generation uses one provider call even for more than four questions',async()=>{
  let calls=0;
  const provider={generateQuiz:async input=>{calls++;assert.equal(input.blueprint.slots.length,5);return Array.from({length:5},(_,i)=>({...quiz.questions[i%3],id:`q${i+1}`}));}};
  await buildEducationalQuiz(document,analysis,{title:'Five questions',count:5,scored:true},provider);assert.equal(calls,1);
});
