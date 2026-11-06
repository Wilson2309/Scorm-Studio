/* eslint-disable @typescript-eslint/no-require-imports */
// Explicit operator-only setup/teardown. Never imported by the application.
// The existing CLI login supplies a key into process memory, never a file/env/browser.
require('../tests/register.cjs');
const fs=require('node:fs'),path=require('node:path'),{randomBytes,randomUUID}=require('node:crypto'),{spawn,spawnSync}=require('node:child_process');
const {createClient}=require('@supabase/supabase-js');
async function main(){
 if(!process.argv.includes('--run-live')){console.log(JSON.stringify({status:'NOT_EXECUTED',reason:'Explicit operator run required'}));return;}
 require('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}});
 const ref='xufqqqufvlmbkjiszpki',url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 if(fs.readFileSync('supabase/.temp/project-ref','utf8').trim()!==ref||new URL(url).hostname!==ref+'.supabase.co')throw Error('wrong_project');
 const simulation=process.argv.includes('--simulation'),timeline=process.argv.includes('--timeline'),runner=simulation?'tests/simulation-live.cjs':timeline?'tests/timeline-live.cjs':'tests/roulette-live.mjs';
 const out=process.env.SCORM_ACCEPTANCE_OUT||(simulation?'artifacts/final-delivery/simulation-remote':timeline?'artifacts/final-delivery/timeline-remote':'artifacts/phase-04.1/remote-acceptance'),run=randomUUID();if(!path.resolve(out).startsWith(path.resolve('artifacts')+path.sep))throw Error('invalid_report_path');fs.mkdirSync(out,{recursive:true});process.env.SCORM_ACCEPTANCE_OUT=out;
 const report={status:'RUNNING',scope:'OPERATOR_TEMPORARY_TEACHER_SETUP_ORDINARY_SESSION_ACCEPTANCE',project:ref,run,step:'preflight',createdUsers:[],deletedUsers:[],existingRolesModified:0,privilegedKeyPersisted:false,privilegedKeySentToBrowser:false,cleanup:'NOT_EXECUTED'};
 const save=()=>fs.writeFileSync(path.join(out,'operator-results.json'),JSON.stringify(report,null,2));
 let admin,keyResponse,credentials={};const temporary=[];
 const child=(args,input)=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,args,{env:process.env,stdio:['pipe','pipe','pipe'],windowsHide:true});let output='';p.stdout.on('data',b=>{output+=b;if(output.length>50000)output=output.slice(-50000);});p.stderr.resume();p.on('error',()=>reject(Error('child_start_failed')));p.on('close',code=>resolve({code,output}));p.stdin.end(input||'');});
 try{
  const ready=await child([runner,'--preflight']);if(ready.code!==0)throw Error('browser_preflight_failed');
  report.step='temporary_account_setup';save();
  const npm=process.env.npm_execpath||path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
  const cli=spawnSync(process.execPath,[npm,'exec','--yes','--package=supabase@3.0.0','--','supabase','projects','api-keys','--remote='+ref,'--reveal','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true,maxBuffer:1024*1024,timeout:90000});
  if(cli.status!==0)throw Error('operator_key_access_unavailable');
  keyResponse=JSON.parse(cli.stdout);cli.stdout='';cli.stderr='';
  const arrays=Array.isArray(keyResponse)?keyResponse:Object.values(keyResponse).filter(Array.isArray).flat();
  const candidate=arrays.find(k=>k.name==='service_role'||k.type==='secret'||k.role==='service_role');
  const key=candidate?.api_key||candidate?.secret_api_key||candidate?.value;
  if(typeof key!=='string'||!(/^(?:eyJ|sb_secret_)/.test(key)))throw Error('operator_key_not_available');
  admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});keyResponse=null;
  for(const label of ['a','b']){
   const email=`phase041-${run}-${label}@scorm-studio.test`,password=randomBytes(24).toString('base64url')+'!aA1';
   const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'QA 04.1 '+label.toUpperCase(),phase041_run:run}});
   if(created.error||!created.data.user)throw Error('temporary_account_creation_failed');
   temporary.push({id:created.data.user.id,email});report.createdUsers.push(created.data.user.id);save();
   const profile=await admin.from('profiles').select('role').eq('id',created.data.user.id).single();if(profile.error||profile.data.role!=='TEACHER')throw Error('temporary_profile_not_teacher');
   credentials[label]={email,password};
  }
  report.step='ordinary_session_browser_acceptance';save();
  const result=await child([runner,'--run-live'],JSON.stringify(credentials));
  let acceptance;try{acceptance=JSON.parse(fs.readFileSync(path.join(out,'results.json'),'utf8'));}catch{throw Error('acceptance_report_missing');}
  report.acceptance={status:acceptance.status,checks:acceptance.checks.length,cleanup:acceptance.cleanup};
  if(result.code!==0||acceptance.status!=='PASS')throw Error('acceptance_failed');report.status='PASS';
 }catch(e){report.status='FAIL';report.error=/^(?:wrong_project|browser_preflight_failed|operator_key_access_unavailable|operator_key_not_available|temporary_account_creation_failed|temporary_profile_not_teacher|acceptance_report_missing|acceptance_failed)$/.test(e.message)?e.message:'controlled_operator_failure';}
 finally{
  report.step='temporary_account_cleanup';let clean=true;
  if(admin)for(const account of temporary){try{
   const user=await admin.auth.admin.getUserById(account.id);if(user.error||user.data.user?.email!==account.email||user.data.user?.user_metadata?.phase041_run!==run)throw Error('not_owned_test_account');
   for(const table of ['documents','generations']){const r=await admin.from(table).select('id',{count:'exact',head:true}).eq('user_id',account.id);if(r.error||r.count!==0)throw Error('synthetic_resources_remain');}
   const label=account.email.endsWith('-a@scorm-studio.test')?'a':'b';if(credentials[label]){const ordinary=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const signed=await ordinary.auth.signInWithPassword(credentials[label]);if(signed.error)throw Error('revoke_failed');const revoked=await ordinary.auth.signOut({scope:'global'});if(revoked.error)throw Error('revoke_failed');}
   const deleted=await admin.auth.admin.deleteUser(account.id);if(deleted.error)throw Error('delete_failed');report.deletedUsers.push(account.id);
  }catch{clean=false;}}
  report.cleanup=clean?'PASS_ONLY_THIS_RUN_ACCOUNTS_AND_RESOURCES_REMOVED':'RETRY_REQUIRED';if(!clean)report.status='FAIL';credentials={};keyResponse=null;admin=null;save();console.log(JSON.stringify({status:report.status,acceptance:report.acceptance,error:report.error,accountsCreated:report.createdUsers.length,accountsDeleted:report.deletedUsers.length,cleanup:report.cleanup,report:path.join(out,'operator-results.json')}));if(report.status!=='PASS')process.exitCode=1;
 }
}
if(require.main===module)main().catch(()=>{console.log(JSON.stringify({status:'FAIL',error:'controlled_operator_configuration_failure'}));process.exitCode=1;});
