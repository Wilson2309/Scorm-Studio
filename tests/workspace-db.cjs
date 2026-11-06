/* eslint-disable @typescript-eslint/no-require-imports */
// Real PostgreSQL (WASM), real roles/RLS. Supabase Auth/Storage schemas are test bootstraps.
const {PGlite}=require('@electric-sql/pglite');
const {readFileSync}=require('node:fs');
async function workspaceDB({conflictFix=true,adminSchema=false,multiActivity=true,timeline=multiActivity,simulation=timeline,conceptual=simulation}={}){
 const db=new PGlite();
 await db.exec(`create role anon nologin; create role authenticated nologin;
 create schema auth; create schema storage;
 create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}',email text,created_at timestamptz default now(),last_sign_in_at timestamptz,email_confirmed_at timestamptz default now(),deleted_at timestamptz,is_anonymous boolean default false);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,public,storage to anon,authenticated;
 grant execute on function auth.uid() to anon,authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb,unique(bucket_id,name));
 alter table storage.objects enable row level security;
 grant select,insert,update,delete on storage.objects to authenticated;
 grant select on storage.buckets to authenticated,anon;`);
 for(const file of ['202611040001_auth_profiles.sql','20261104000200_persistent_workspace.sql','20261104000300_private_workspace_storage.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
 if(conflictFix)await db.exec(readFileSync('supabase/migrations/20261104000400_workspace_conflict_http.sql','utf8'));
 if(adminSchema)await db.exec(readFileSync('supabase/migrations/20261105042507_admin_metadata_workspace.sql','utf8'));
 if(multiActivity)await db.exec(readFileSync('supabase/migrations/20261105060949_multi_activity_roulette.sql','utf8'));
 if(timeline)await db.exec(readFileSync('supabase/migrations/20261105230601_multi_activity_timeline.sql','utf8'));
 if(simulation)await db.exec(readFileSync('supabase/migrations/20261106004707_multi_activity_simulation.sql','utf8'));
 if(conceptual)await db.exec(readFileSync('supabase/migrations/20261106095654_conceptual_timeline_revision.sql','utf8'));
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
 await db.query('insert into auth.users(id) values($1),($2)',[a,b]);
 const as=async(id,query,params=[])=>db.transaction(async tx=>{
  await tx.exec('set local role '+(id?'authenticated':'anon'));
  await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[id||'']);
  return tx.query(query,params);
 });
 const rpc=async(id,name,args)=>{
  if(!/^(workspace|admin)_[a-z_]+$/.test(name))throw new Error('Invalid test RPC');
  const keys=Object.keys(args);if(keys.some(k=>!/^p_[a-z_]+$/.test(k)))throw new Error('Invalid test RPC argument');
  return (await as(id,`select public.${name}(${keys.map((k,i)=>k+' => $'+(i+1)).join(',')}) as result`,Object.values(args))).rows[0].result;
 };
 return {db,a,b,as,rpc,close:()=>db.close()};
}
module.exports={workspaceDB};
