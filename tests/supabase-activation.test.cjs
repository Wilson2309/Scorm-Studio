/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {projectRef} = require('../scripts/supabase-project-ref.cjs');
const {permissionDenied, ownRows, noRows, checkLive} = require('../scripts/test-supabase-live.cjs');

test('CLI project ref is derived only from an unambiguous hosted URL', () => {
  assert.equal(projectRef('https://abcdefghijklmnopqrst.supabase.co'), 'abcdefghijklmnopqrst');
  for (const value of ['http://abcdefghijklmnopqrst.supabase.co', 'https://evil.test', 'https://abcdefghijklmnopqrst.supabase.co.evil.test', 'https://secret@abcdefghijklmnopqrst.supabase.co', 'https://abcdefghijklmnopqrst.supabase.co?key=private']) assert.throws(() => projectRef(value));
});
test('real RLS probe does not confuse schema, constraint, server errors or empty success with denied permissions', () => {
  assert.ok(permissionDenied({status:403,error:{code:'42501'}}));
  for (const result of [{status:404,error:{code:'PGRST205'}},{status:409,error:{code:'23505'}},{status:500,error:{code:'42501'}},{status:200,data:[]},{status:403,error:{code:'unexpected'}}]) assert.equal(permissionDenied(result),false);
});
test('real profile checks require one own TEACHER and treat errors as failures', () => {
  assert.ok(ownRows({data:[{id:'A',role:'TEACHER'}]},'A'));
  for (const data of [[],[{id:'B',role:'TEACHER'}],[{id:'A',role:'ADMIN'}],[{id:'A',role:'TEACHER'},{id:'B',role:'TEACHER'}]]) assert.equal(ownRows({data},'A'),false);
  assert.ok(noRows({data:[]}));assert.equal(noRows({data:[],error:{code:'42501'}}),false);
});
test('live checks require distinct accounts and refuse administrative keys before any network call', async () => {
  const config={url:'https://abcdefghijklmnopqrst.supabase.co',key:'sb_publishable_fixture'};
  await assert.rejects(checkLive(config,{a:{email:'same@example.test',password:'test-only'},b:{email:'same@example.test',password:'test-only'}}));
  await assert.rejects(checkLive({...config,key:'sb_secret_never_use'},{a:{},b:{}}));
});
test('real acceptance runner is opt-in and never performs inference or account creation by default', () => {
  const result=spawnSync(process.execPath,['scripts/test-supabase-live.cjs'],{encoding:'utf8'});
  assert.equal(result.status,2);assert.equal(JSON.parse(result.stdout).status,'NOT_EXECUTED');assert.equal(result.stderr,'');
});
