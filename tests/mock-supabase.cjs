/* eslint-disable @typescript-eslint/no-require-imports */
// Test-only Auth/PostgREST protocol fixture. This does NOT prove live SQL/RLS.
const http=require('node:http'),crypto=require('node:crypto');
const {once}=require('node:events');
const {createServerClient}=require('@supabase/ssr');
async function mockSupabase(options={}){
 const workspace=options.workspace?await require('./workspace-backend.cjs').workspaceBackend():null;
 const accounts=new Map(),tokens=new Map(),refresh=new Map(),requests=[];
 const add=(id,email,name,role='TEACHER')=>{const a={id,email,password:'Local-test-password-123!',name,role};accounts.set(email,a);return a;};
 const a=add('11111111-1111-4111-8111-111111111111','teacher-a@scorm.test','Docente A');
 const b=add('22222222-2222-4222-8222-222222222222','teacher-b@scorm.test','Docente B');
 const admin=add('33333333-3333-4333-8333-333333333333','admin@scorm.test','Admin de prueba','ADMIN');
 if(workspace){
  await workspace.db.query('insert into auth.users(id) values($1)',[admin.id]);
  for(const account of [a,b,admin]){await workspace.db.query('update auth.users set email=$2,last_sign_in_at=now() where id=$1',[account.id,account.email]);await workspace.db.query('update public.profiles set full_name=$2,role=$3 where id=$1',[account.id,account.name,account.role]);}
 }
 const user=account=>({id:account.id,aud:'authenticated',role:'authenticated',email:account.email,email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:{full_name:account.name,role:'ADMIN'},identities:[],created_at:new Date().toISOString()});
 let base;
 const session=account=>{const now=Math.floor(Date.now()/1000),header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),payload=Buffer.from(JSON.stringify({sub:account.id,aud:'authenticated',role:'authenticated',email:account.email,iat:now,exp:now+3600,session_id:crypto.randomUUID(),iss:base+'/auth/v1'})).toString('base64url');const signature=crypto.createHmac('sha256','local-fixture-signature-only').update(header+'.'+payload).digest('base64url'),access_token=header+'.'+payload+'.'+signature,refresh_token=crypto.randomUUID();tokens.set(access_token,account);refresh.set(refresh_token,account);return {access_token,refresh_token,token_type:'bearer',expires_in:3600,expires_at:now+3600,user:user(account)};};
 const server=http.createServer(async(req,res)=>{
   res.setHeader('X-Supabase-Api-Version','2024-01-01');res.setHeader('Access-Control-Expose-Headers','X-Supabase-Api-Version');
   res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,OPTIONS');res.setHeader('Access-Control-Allow-Headers',req.headers['access-control-request-headers']||'authorization,apikey,content-type,x-client-info');
   if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
   const url=new URL(req.url,base);requests.push({path:url.pathname,method:req.method});
   const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
   try{
     const identity=tokens.get((req.headers.authorization||'').replace(/^Bearer /,''));
     if(workspace&&(url.pathname.startsWith('/storage/v1/')||url.pathname.startsWith('/rest/v1/')&&url.pathname!=='/rest/v1/profiles'))return await workspace.handle(req,res,identity?.id);
     let raw='';for await(const p of req)raw+=p;const body=raw?JSON.parse(raw):{};
     const account=tokens.get((req.headers.authorization||'').replace(/^Bearer /,''));
     if(url.pathname==='/auth/v1/token'){
       const target=url.searchParams.get('grant_type')==='refresh_token'?refresh.get(body.refresh_token):accounts.get(body.email);
       if(!target||(url.searchParams.get('grant_type')==='password'&&body.password!==target.password))return send({code:'invalid_credentials',msg:'Invalid login credentials'},400);
       return send(session(target));
     }
     if(url.pathname==='/auth/v1/user'){
       if(!account)return send({code:'bad_jwt',msg:'Invalid token'},401);
       if(req.method==='PUT'&&body.password)account.password=body.password;
       return send(user(account));
     }
     if(url.pathname==='/auth/v1/logout'){res.writeHead(204);res.end();return;}
     if(url.pathname==='/auth/v1/signup'){
       const target=accounts.get(body.email)||add(crypto.randomUUID(),body.email,body.data?.full_name||'Docente');return send(user(target));
     }
     if(url.pathname==='/auth/v1/recover'||url.pathname==='/auth/v1/resend')return send({});
     if(url.pathname==='/auth/v1/verify')return body.token_hash==='fixture-email-hash'?send(session(a)):send({code:'otp_expired',msg:'Expired'},403);
     if(url.pathname.endsWith('/jwks.json'))return send({keys:[]});
     if(url.pathname==='/rest/v1/profiles'){
       if(!account)return send({message:'Unauthorized'},401);
       const own=url.searchParams.get('id')==='eq.'+account.id;
       if(!own)return send({code:'PGRST116',message:'No rows'},406);
       if(req.method==='PATCH'&&(Object.keys(body).some(k=>k!=='full_name')))return send({message:'Denied'},403);
       if(req.method==='PATCH')account.name=body.full_name;
       if(workspace){
        if(req.method==='PATCH')await workspace.as(account.id,'update public.profiles set full_name=$1 where id=$2',[account.name,account.id]);
        const rows=(await workspace.as(account.id,'select id,full_name,role from public.profiles where id=$1',[account.id])).rows;
        return rows.length?send(rows[0]):send({code:'PGRST116',message:'No rows'},406);
       }
       return send({id:account.id,full_name:account.name,role:account.role});
     }
     send({message:'Not implemented by fixture'},404);
   }catch{send({message:'Fixture request invalid'},400);}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;
 async function loginCookie(account=a){let cookies=[];const client=createServerClient(base,'sb_publishable_local_protocol_fixture',{cookies:{getAll:()=>cookies,setAll:values=>{cookies=values;}},auth:{autoRefreshToken:false}});const {error}=await client.auth.signInWithPassword({email:account.email,password:account.password});if(error)throw new Error('Fixture login failed');return cookies.map(c=>`${c.name}=${c.value}`).join('; ');}
 return {server,base,a,b,admin,accounts,requests,workspace,loginCookie,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await workspace?.close();}};
}
module.exports={mockSupabase};
