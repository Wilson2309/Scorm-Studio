/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const {spawn}=require('node:child_process');
const {createMockAI}=require('./mock-ai.cjs');
const {once}=require('node:events');
const {readdirSync}=require('node:fs');
async function main(){
  const auth=await require('./mock-supabase.cjs').mockSupabase({workspace:true});
  if(process.argv.includes('--admin-browser')||process.argv.includes('--admin-live-browser'))await require('./admin-fixture.cjs').seedAdminFixture(auth);
  if(process.argv.includes('--teacher'))throw new Error('Private historical replay is not distributed. Use the synthetic integration suite.');
  const replay=undefined;
  const {server}=createMockAI({replay});server.listen(0,'127.0.0.1');await once(server,'listening');
  const port=Number(process.env.SCORM_TEST_PORT||3212),base=`http://127.0.0.1:${port}`;
  const env={...process.env,AI_PROVIDER:'openai-compatible',AI_BASE_URL:`http://127.0.0.1:${server.address().port}/v1`,AI_API_KEY:'local-test-only',AI_MODEL:'fixture-not-a-live-model',AI_JSON_MODE:'strict',CONTENT_AI_PROVIDER:'openai-compatible',CONTENT_AI_BASE_URL:`http://127.0.0.1:${server.address().port}/v1`,CONTENT_AI_API_KEY:'local-test-only',CONTENT_AI_MODEL:'fixture-not-a-live-model',CONTENT_AI_JSON_MODE:'strict',SCORM_TEST_URL:base,SCORM_MOCK_AI:'1'};
  Object.assign(env,{NEXT_PUBLIC_SUPABASE_URL:auth.base,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_local_protocol_fixture',APP_URL:base,SCORM_TEST_AUTH_COOKIE:await auth.loginCookie(),SCORM_TEST_SUPABASE_URL:auth.base,WORKSPACE_SIGNING_KEY:'ab'.repeat(32)});
  if(process.argv.includes('--ollama'))Object.assign(env,{AI_PROVIDER:'ollama',AI_BASE_URL:`http://127.0.0.1:${server.address().port}`,AI_MODEL:'qwen2.5:3b',AI_FALLBACK_MODEL:'llama3.2:3b'});
  const app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});
  let diagnostics='';app.stdout.on('data',data=>diagnostics+=data);app.stderr.on('data',data=>diagnostics+=data);
  try{
    let ready=false;
    for(let i=0;i<60;i++){try{if((await fetch(base+'/login')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
    if(!ready)throw new Error('Test server did not start.');
    const args=process.argv.includes('--evaluation-browser')?['tests/evaluation-editor-browser.mjs']:process.argv.includes('--refinement-browser')?['tests/refinement-browser.mjs']:process.argv.includes('--polish-browser')?['tests/final-polish-browser.mjs']:process.argv.includes('--final-browser')?['tests/final-delivery-browser.mjs']:process.argv.includes('--timeline-browser')?['tests/timeline-browser.mjs']:process.argv.includes('--ui-recovery-browser')?['tests/ui-recovery-browser.mjs',...(process.argv.includes('--update-visual-baseline')?['--update-baseline']:process.argv.includes('--visual-audit-only')?['--audit-only']:[])]:process.argv.includes('--phase041-ux-browser')?['tests/phase041-ux-browser.mjs']:process.argv.includes('--roulette-live-fixture')?['tests/roulette-live.mjs','--local-fixture']:process.argv.includes('--roulette-browser')?['tests/roulette-workspace-browser.mjs']:process.argv.includes('--admin-live-browser')?['tests/admin-live-browser-fixture.mjs']:process.argv.includes('--admin-browser')?['tests/admin-browser.mjs']:process.argv.includes('--history-browser')?['tests/history-browser.mjs']:process.argv.includes('--auth-browser')?['tests/auth-browser-qa.mjs']:process.argv.includes('--workspace-browser')?['tests/workspace-browser.mjs']:process.argv.includes('--browser')?['tests/browser-qa.mjs']:['--test',...readdirSync('tests').filter(file=>file.endsWith('.test.cjs')).map(file=>`tests/${file}`)];
    const tests=spawn(process.execPath,args,{env,stdio:'inherit',windowsHide:true});const [code]=await once(tests,'exit');if(code!==0){console.log(JSON.stringify({mockAuthRequests:auth.requests,localConfigInLogin:(await(await fetch(base+'/login')).text()).includes(auth.base)}));throw new Error(`Integration checks exited with ${code}`);}
  }finally{app.kill();server.closeAllConnections();await new Promise(r=>server.close(r));await auth.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
