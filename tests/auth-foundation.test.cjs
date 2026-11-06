/* eslint-disable @typescript-eslint/no-require-imports */
const {nativeFetch}=require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {validatePublicConfig}=require('../src/lib/supabase/config.ts');
const {safeNext,privatePage,actorFromProfile,assertAdmin}=require('../src/lib/auth/policy.ts');
const {authSchemas,performAuth,authMessage}=require('../src/lib/auth/flow.ts');
const {createServerClient}=require('@supabase/ssr');
const {mockSupabase}=require('./mock-supabase.cjs');
test('public configuration fails closed and rejects secret/service-role credentials',()=>{
 assert.equal(validatePublicConfig('https://project.supabase.co',''),null);assert.equal(validatePublicConfig('https://project.supabase.co','sb_secret_never-expose'),null);assert.equal(validatePublicConfig('http://remote.example','sb_publishable_example'),null);assert.equal(validatePublicConfig('https://user:pass@remote.example','sb_publishable_example'),null);
 const service='e30.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.test';assert.equal(validatePublicConfig('https://project.supabase.co',service),null);assert.ok(validatePublicConfig('http://127.0.0.1:54321','sb_publishable_local'));
});
test('return paths cannot escape the app or retain callback tokens',()=>{
 for(const value of ['https://evil.test','//evil.test','/\\evil.test','/%2fevil.test','/login','/auth/confirm?token_hash=secret'])assert.equal(safeNext(value),'/');
 assert.equal(safeNext('/crear?generation=123&code=secret'),'/crear?generation=123');assert.equal(safeNext('/restablecer'),'/restablecer');assert.ok(privatePage('/admin/users'));assert.equal(privatePage('/registro'),false);
});
test('role comes from the matching database profile, never user metadata',()=>{
 const user={id:'11111111-1111-4111-8111-111111111111',email:'local@example.test',user_metadata:{role:'ADMIN'}};
 const actor=actorFromProfile(user,{id:user.id,full_name:'Docente',role:'TEACHER'});assert.equal(actor.role,'TEACHER');assert.throws(()=>assertAdmin(actor),e=>e.status===403);assert.throws(()=>actorFromProfile(user,{id:'22222222-2222-4222-8222-222222222222',full_name:'Other',role:'ADMIN'}));assert.throws(()=>actorFromProfile(user,null));
});
test('registration contract rejects a browser-selected role and mismatched passwords',()=>{
 const valid={fullName:'Docente',email:'teacher@example.test',password:'Valid-password-123',confirmPassword:'Valid-password-123'};assert.ok(authSchemas.register.safeParse(valid).success);assert.equal(authSchemas.register.safeParse({...valid,role:'ADMIN'}).success,false);assert.equal(authSchemas.register.safeParse({...valid,confirmPassword:'different'}).success,false);
});
test('signup invokes only Supabase Auth and supplies no administrative metadata',async()=>{
 let called;const client={auth:{async signUp(input){called=input;return {data:{session:null},error:null};}}};const result=await performAuth('register',{fullName:'Docente',email:'teacher@example.test',password:'Valid-password-123',confirmPassword:'Valid-password-123'},client,'http://localhost:3000','/crear');assert.deepEqual(called.options.data,{full_name:'Docente'});assert.ok(called.options.emailRedirectTo.startsWith('http://localhost:3000/auth/callback?'));assert.ok(result.notice);assert.equal(result.redirect,undefined);
});
test('recovery is generic and errors never expose raw provider messages',async()=>{
 const result=await performAuth('recover',{email:'teacher@example.test'},{auth:{async resetPasswordForEmail(){return {error:null};}}},'http://localhost:3000');assert.match(result.notice,/Si existe/);assert.equal(authMessage({message:'raw-private-provider-value'}).includes('raw-private'),false);assert.match(authMessage({code:'invalid_credentials'}),/correo o la contraseña/);
});
test('expired recovery session cannot update a password',async()=>{
 let changed=false;await assert.rejects(performAuth('reset',{password:'Valid-password-123',confirmPassword:'Valid-password-123'},{auth:{async getUser(){return {data:{user:null},error:{code:'expired'}};},async updateUser(){changed=true;}}},'http://localhost:3000'));assert.equal(changed,false);
});
test('official SSR client login, persistence, recovery, update and logout via local Auth protocol fixture',async()=>{
 const mock=await mockSupabase();let jar=[];const client=createServerClient(mock.base,'sb_publishable_local_protocol_fixture',{cookies:{getAll:()=>jar,setAll:c=>{jar=c;}},auth:{autoRefreshToken:false}});
 try{
  await assert.rejects(performAuth('login',{email:mock.a.email,password:'bad'},client,'http://localhost:3000'));
  const result=await performAuth('login',{email:mock.a.email,password:mock.a.password},client,'http://localhost:3000','/crear');assert.equal(result.redirect,'/crear');assert.ok(jar.length);
  const restored=createServerClient(mock.base,'sb_publishable_local_protocol_fixture',{cookies:{getAll:()=>jar,setAll:c=>{jar=c;}},auth:{autoRefreshToken:false}});assert.equal((await restored.auth.getUser()).data.user.id,mock.a.id);
  await performAuth('recover',{email:mock.a.email},client,'http://localhost:3000');
  const reset=await performAuth('reset',{password:'Changed-password-123!',confirmPassword:'Changed-password-123!'},client,'http://localhost:3000');assert.equal(reset.redirect,'/login?notice=password-updated');assert.ok(jar.every(c=>!c.value));assert.equal(mock.a.password,'Changed-password-123!');
 }finally{await mock.close();}
});
test('Proxy refresh writes rotated cookies and private cache headers; invalid refresh fails closed',async()=>{
 const mock=await mockSupabase(),saved={url:process.env.NEXT_PUBLIC_SUPABASE_URL,key:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY};
 try{
  process.env.NEXT_PUBLIC_SUPABASE_URL=mock.base;process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_local_protocol_fixture';
  const value=await mock.loginCookie(),pairs=value.split('; ').map(p=>({name:p.slice(0,p.indexOf('=')),value:p.slice(p.indexOf('=')+1)})),cookie=pairs.find(c=>c.name.endsWith('-auth-token'));assert.ok(cookie);
  const session=JSON.parse(Buffer.from(cookie.value.slice('base64-'.length),'base64url').toString());session.expires_at=1;
  const encode=s=>cookie.name+'=base64-'+Buffer.from(JSON.stringify(s)).toString('base64url');
  const {NextRequest}=require('next/server'),{updateSession}=require('../src/lib/supabase/proxy.ts');
  const refreshed=await updateSession(new NextRequest('http://localhost:3000/crear',{headers:{Cookie:encode(session)}}));
  assert.equal(refreshed.status,200);assert.ok(refreshed.cookies.getAll().some(c=>c.value));assert.match(refreshed.headers.get('cache-control'),/private.*no-store/);
  const expired=await updateSession(new NextRequest('http://localhost:3000/crear',{headers:{Cookie:encode({...session,refresh_token:'invalid-refresh-fixture'})}}));
  assert.equal(expired.status,307);assert.equal(new URL(expired.headers.get('location')).pathname,'/login');assert.match(expired.headers.get('cache-control'),/no-store/);
 }finally{if(saved.url===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=saved.url;if(saved.key===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=saved.key;await mock.close();}
});
test('HTTP anonymous requests are blocked before PDF, AI or packaging work',{skip:!process.env.SCORM_TEST_URL},async()=>{
 const base=process.env.SCORM_TEST_URL;for(const path of ['/api/extract','/api/intelligence','/api/scorm']){const response=await nativeFetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,401,path);assert.match(response.headers.get('cache-control'),/no-store/);}
 const page=await nativeFetch(base+'/crear',{redirect:'manual'});assert.equal(page.status,307);assert.ok(new URL(page.headers.get('location'),base).pathname==='/login');
});
test('HTTP server rejects foreign origins and forged sessions',{skip:!process.env.SCORM_TEST_URL},async()=>{
 const base=process.env.SCORM_TEST_URL;const csrf=await nativeFetch(base+'/api/scorm',{method:'POST',headers:{Origin:'https://foreign.test',Cookie:process.env.SCORM_TEST_AUTH_COOKIE,'Content-Type':'application/json'},body:'{}'});assert.equal(csrf.status,403);
 const forged=await nativeFetch(base+'/api/intelligence',{headers:{Cookie:'sb-127-auth-token=base64-forged'}});assert.equal(forged.status,401);
});
test('teacher cannot open admin even with ADMIN in editable user metadata',{skip:!process.env.SCORM_TEST_URL},async()=>{
 const response=await nativeFetch(process.env.SCORM_TEST_URL+'/admin',{headers:{Cookie:process.env.SCORM_TEST_AUTH_COOKIE}});const html=await response.text();assert.ok(!html.includes('Shell administrativo'));assert.ok(!html.includes('AdminView'));
});
test('authenticated PDF larger than the default 10 MiB Proxy buffer keeps the 20 MiB contract',{skip:!process.env.SCORM_TEST_URL},async()=>{
 const {pdfBytes}=require('./pdf-fixture.cjs'),bytes=pdfBytes('El contenido educativo conserva una fuente verificable para interpretar conceptos del documento. Las relaciones entre conceptos permiten construir actividades con evidencia.',11*1024*1024);assert.ok(bytes.length>10*1024*1024&&bytes.length<20*1024*1024);
 const body=new FormData();body.set('file',new File([bytes],'large-fixture.pdf',{type:'application/pdf'}));const response=await fetch(process.env.SCORM_TEST_URL+'/api/extract',{method:'POST',body});assert.equal(response.status,200);const data=await response.json();assert.equal(data.pages,1);assert.match(data.text,/contenido educativo/);
});
