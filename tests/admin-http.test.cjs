/* eslint-disable @typescript-eslint/no-require-imports */
const {nativeFetch}=require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{createServerClient}=require('@supabase/ssr');
test('HTTP admin endpoints: verified ADMIN, TEACHER/anonymous denial, confirmation and last-admin guard',{skip:!process.env.SCORM_TEST_URL},async()=>{
 const base=process.env.SCORM_TEST_URL,teacher=process.env.SCORM_TEST_AUTH_COOKIE;let jar=[];
 const client=createServerClient(process.env.SCORM_TEST_SUPABASE_URL,'sb_publishable_local_protocol_fixture',{cookies:{getAll:()=>jar,setAll:c=>jar=c},auth:{autoRefreshToken:false}});
 assert.equal((await client.auth.signInWithPassword({email:'admin@scorm.test',password:'Local-test-password-123!'})).error,null);const admin=jar.map(c=>c.name+'='+c.value).join('; ');
 const request=(path,cookie,init={})=>nativeFetch(base+path,{...init,headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...init.headers}});
 const routes=['/api/admin/overview','/api/admin/people','/api/admin/activities','/api/admin/people/11111111-1111-4111-8111-111111111111'];
 for(const path of routes){for(const [cookie,expected] of [[undefined,401],[teacher,403],[admin,200]]){const response=await request(path,cookie);assert.equal(response.status,expected,path);assert.match(response.headers.get('cache-control'),/no-store/);const text=await response.text();assert.equal(/prepared_json|draft_json|encrypted_password|storage_path|access_token/.test(text),false);}}
 const path='/api/admin/people/33333333-3333-4333-8333-333333333333/role',body={role:'TEACHER',expectedRole:'ADMIN',requestId:randomUUID(),reason:'Comprobación de última cuenta ADMIN',confirmed:true};
 const post=(cookie,data,origin=base)=>request(path,cookie,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(data)});
 assert.equal((await post(undefined,body)).status,401);assert.equal((await post(teacher,body)).status,403);assert.equal((await post(admin,{...body,confirmed:false})).status,422);assert.equal((await post(admin,body,'https://foreign.invalid')).status,403);const last=await post(admin,body);assert.equal(last.status,409);assert.match((await last.json()).error,/al menos una/);
 assert.equal((await request('/api/admin/people?pageSize=26',admin)).status,422);
 const overview=await(await request('/api/admin/overview',admin)).json();assert.deepEqual([overview.accounts,overview.teachers,overview.admins],[3,2,1]);
 await client.auth.signOut();
});
