/* eslint-disable @typescript-eslint/no-require-imports */
// Opt-in real acceptance. No successful role changes, new accounts, PDF work or inference.
if(!process.argv.includes('--run-live')){console.log(JSON.stringify({status:'NOT_EXECUTED',scope:'ADMIN_API_READ_ONLY',reason:'Use scripts/test-admin-live.ps1 privately after activation.'}));process.exit(2);}
require('../tests/register.cjs');require('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const {createServerClient}=require('@supabase/ssr'),{createClient}=require('@supabase/supabase-js'),{publicSupabaseConfig,applicationURL}=require('../src/lib/supabase/config.ts'),{projectRef}=require('./supabase-project-ref.cjs'),{overviewSchema,peopleSchema,adminActivitiesSchema}=require('../src/lib/admin/contracts.ts'),{mkdirSync,writeFileSync}=require('node:fs');
async function main(){
 let input='',credentials;for await(const chunk of process.stdin){input+=chunk;if(input.length>8192)throw Error('invalid_private_input');}try{credentials=JSON.parse(input.replace(/^\uFEFF/,''));}catch{throw Error('invalid_private_input');}input='';
 const config=publicSupabaseConfig(),base=applicationURL();if(!config||!base||projectRef(config.url)!=='xufqqqufvlmbkjiszpki')throw Error('invalid_local_configuration');
 const report={scope:'REAL_AUTH_POSTGREST_NEXT_ADMIN_APIS_AND_BROWSER',status:'RUNNING',checks:[],roleMutation:'NOT_EXECUTED',browserUI:'NOT_EXECUTED'},clients=[];
 const check=(test,ok,status)=>{report.checks.push({test,status:ok?'PASS':'FAIL',...(status?{httpStatus:status}:{})});if(!ok)throw Error('admin_live_check_failed');};
 const session=async(account,label,expected)=>{let jar=[];const client=createServerClient(config.url,config.publishableKey,{cookies:{getAll:()=>jar,setAll:v=>{jar=v;}},auth:{autoRefreshToken:false,persistSession:false}});clients.push(client);const {data,error}=await client.auth.signInWithPassword({email:account.email,password:account.password});check(label+': confirmed real login',!error&&!!data.user?.email_confirmed_at);const profile=await client.from('profiles').select('id,role').single();check(label+': verified profile role',!profile.error&&profile.data?.id===data.user.id&&profile.data.role===expected);return {client,id:data.user.id,cookie:jar.map(c=>c.name+'='+c.value).join('; ')};};
 const request=(path,session,init={})=>fetch(base+path,{...init,headers:{...(session?{Cookie:session.cookie}:{}),Origin:base,...init.headers},signal:AbortSignal.timeout(20000),redirect:'manual'});
 try{
  const a=await session(credentials.admin,'ADMIN','ADMIN'),t=await session(credentials.teacher,'TEACHER','TEACHER');check('Independent identities',a.id!==t.id);
  check('ADMIN is explicitly approved bootstrap target',a.id==='22924639-38df-4f2a-9f92-82a63389fe0d');
  for(const [path,schema] of [['/api/admin/overview',overviewSchema],['/api/admin/people?pageSize=2',peopleSchema],['/api/admin/activities?pageSize=2',adminActivitiesSchema]]){
   const r=await request(path,a);check('ADMIN '+path.split('?')[0],r.status===200,r.status);schema.parse(await r.json());
   const denied=await request(path,t);check('TEACHER '+path.split('?')[0],denied.status===403,denied.status);
   const anon=await request(path);check('Anonymous '+path.split('?')[0],anon.status===401,anon.status);
  }
  for(const name of ['admin_overview','admin_people','admin_activities']){const result=await t.client.rpc(name);check('Direct TEACHER RPC '+name,result.error?.code==='42501');}
  const anon=createClient(config.url,config.publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});check('Direct anonymous RPC denied',(await anon.rpc('admin_overview')).error?.code==='42501');
  const invalidRoleArgs={p_target:null,p_role:null,p_expected_role:null,p_request:null,p_reason:null};
  for(const [actor,label] of [[t.client,'TEACHER'],[anon,'Anonymous']])check(label+' direct administrative action denied before input validation',(await actor.rpc('admin_change_role',invalidRoleArgs)).error?.code==='42501');
  for(const [actor,label,expected] of [[t,'TEACHER',403],[undefined,'Anonymous',401]]){const r=await request('/api/admin/people/'+a.id+'/role',actor,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});check(label+' administrative POST denied',r.status===expected,r.status);}
  const summary=overviewSchema.parse(await(await request('/api/admin/overview',a)).json());check('Real aggregate roles and authorized bootstrap audit',summary.admins===1&&summary.teachers===1&&summary.accounts===2&&summary.audit.some(e=>e.id==='05439e0c-91c2-473b-a7cd-00a509ebf782'&&e.targetId===a.id&&e.oldRole==='TEACHER'&&e.newRole==='ADMIN'));
  for(const role of ['TEACHER','ADMIN']){const r=await request('/api/admin/people?role='+role,a),people=peopleSchema.parse(await r.json());check('Real people role filter '+role,r.ok&&people.total===1&&people.items.every(p=>p.role===role));}
  const page1=peopleSchema.parse(await(await request('/api/admin/people?pageSize=1&page=1',a)).json()),page2=peopleSchema.parse(await(await request('/api/admin/people?pageSize=1&page=2',a)).json());check('Real people pagination',page1.total===2&&page1.items.length===1&&page2.page===2&&page2.items.length===1&&page1.items[0].id!==page2.items[0].id);
  const detail=await request('/api/admin/people/'+t.id,a);check('ADMIN reads only permitted account detail',detail.ok,detail.status);
  for(const table of ['documents','generations','quiz_revisions','scorm_packages'])for(const [owner,other,label] of [[a,t,'TEACHER cannot read ADMIN'],[t,a,'ADMIN cannot read TEACHER']]){
   const own=await owner.client.from(table).select('user_id',{head:true,count:'exact'}).eq('user_id',owner.id);check('Owner inventory readable '+table+' '+label,!own.error);
   if(!own.count){report.checks.push({test:label+' '+table,status:'NOT_EXECUTED',reason:'No owned rows exist to prove isolation.'});continue;}
   const hidden=await other.client.from(table).select('user_id').eq('user_id',owner.id);check(label+' '+table,!hidden.error&&hidden.data.length===0);
  }
  report.browserUI='RUNNING';await import('../tests/admin-live-browser.mjs').then(m=>m.adminLiveBrowser({base,credentials,mark:test=>check(test,true)}));report.browserUI='PASS';
  report.status=report.checks.some(c=>c.status==='NOT_EXECUTED')?'PARTIAL':'PASS';
 }catch{report.status='FAIL';if(report.browserUI==='RUNNING')report.browserUI='FAIL';report.error='controlled_admin_live_error';}
 finally{credentials.admin=null;credentials.teacher=null;for(const c of clients)await c.auth.signOut({scope:'local'}).catch(()=>{});mkdirSync('artifacts/phase-03.4',{recursive:true});writeFileSync('artifacts/phase-03.4/live-api-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(report.status==='FAIL')process.exitCode=1;}
}
main().catch(()=>{console.log(JSON.stringify({status:'FAIL',error:'controlled_private_configuration_error'}));process.exitCode=1;});
