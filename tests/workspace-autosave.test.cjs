/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {DraftAutosave}=require('../src/lib/workspace/autosave.ts');
test('autosave debounces many keystrokes into one snapshot and flush waits for persistence',async()=>{
 const writes=[],states=[];const save=new DraftAutosave(2,async(value,revision)=>{writes.push({value,revision});return {revision:revision+1};},state=>states.push(state),10000);
 save.schedule('a');save.schedule('ab');save.schedule('abc');assert.equal(writes.length,0);await save.flush();assert.deepEqual(writes,[{value:'abc',revision:2}]);assert.equal(save.state.status,'saved');assert.equal(save.state.revision,3);assert.equal(save.hasPending(),false);assert.ok(states.some(s=>s.status==='saving'));
});
test('edits during a save are coalesced and never overwritten by the earlier response',async()=>{
 let release;const writes=[];const save=new DraftAutosave(0,async(value,revision)=>{writes.push([value,revision]);if(writes.length===1)await new Promise(r=>release=r);return {revision:revision+1};},()=>{},10000);
 save.schedule('first');const flush=save.flush();save.schedule('second');save.schedule('third');release();await flush;assert.deepEqual(writes,[['first',0],['third',1]]);assert.equal(save.state.revision,2);
});
test('revision conflict preserves local data and does not retry or overwrite automatically',async()=>{
 let calls=0;const save=new DraftAutosave(2,async()=>{calls++;throw Object.assign(new Error('Newer revision'),{code:'revision_conflict'});},()=>{},10000);
 save.schedule('local changes');await assert.rejects(save.flush());save.schedule('more changes');await assert.rejects(save.flush());assert.equal(save.state.status,'conflict');assert.equal(calls,1);assert.ok(save.hasPending());save.discard();assert.equal(save.hasPending(),false);
});
test('session expiry and interrupted saves show errors, retain changes and permit explicit retry',async()=>{
 let fail=true;const save=new DraftAutosave(5,async()=>{if(fail)throw Object.assign(new Error('Session expired'),{code:'session_expired'});return {revision:6};},()=>{},10000);
 save.schedule('changes');await assert.rejects(save.flush());assert.equal(save.state.status,'error');assert.ok(save.hasPending());fail=false;await save.flush();assert.equal(save.state.status,'saved');assert.equal(save.state.revision,6);
});
