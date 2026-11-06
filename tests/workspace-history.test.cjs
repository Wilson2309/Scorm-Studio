/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createClient}=require('@supabase/supabase-js'),{mockSupabase}=require('./mock-supabase.cjs');
const {readHistory,readWorkspaceSummary}=require('../src/lib/workspace/history.server.ts');
const {historyFiltersSchema,literalTitlePattern,historyURL}=require('../src/lib/workspace/history-contracts.ts');
test('history query contract limits and literal title search',()=>{
 assert.equal(literalTitlePattern('a_%\\b'),'%a\\_\\%\\\\b%');
 for(const input of [{page:0},{pageSize:21},{order:'user_id'},{status:'ADMIN'},{q:'x'.repeat(101)}])assert.equal(historyFiltersSchema.safeParse(input).success,false);
 const filters=historyFiltersSchema.parse({q:'Tema & práctica',status:'READY',page:2});assert.equal(historyFiltersSchema.parse(Object.fromEntries(new URLSearchParams(historyURL(filters)))).q,filters.q);
});
test('history metadata uses official SDK, PostgreSQL RLS, filters, counts and current package revision',async t=>{
 const auth=await mockSupabase({workspace:true});t.after(()=>auth.close());const db=auth.workspace.db,ids=[];
 async function client(account){const c=createClient(auth.base,'sb_publishable_local_protocol_fixture',{auth:{persistSession:false,autoRefreshToken:false}});assert.equal((await c.auth.signInWithPassword({email:account.email,password:account.password})).error,null);return c;}
 const a=await client(auth.a),b=await client(auth.b);
 async function seed(owner,title,date){const doc=randomUUID(),id=randomUUID();await db.query("insert into public.documents(id,user_id,filename,file_size,file_sha256,storage_path) values($1,$2,'private.pdf',500,$3,$4)",[doc,owner,'a'.repeat(64),`${owner}/${doc}/original.pdf`]);await db.query("insert into public.generations(id,user_id,document_id,title,created_at,updated_at) values($1,$2,$3,$4,$5,$5)",[id,owner,doc,title,date]);return id;}
 for(let i=0;i<11;i++)ids.push(await seed(auth.a.id,i===0?'100%_literal':'Tema '+i,`2026-10-${String(i+1).padStart(2,'0')}T12:00:00Z`));const foreign=await seed(auth.b.id,'Privada B','2026-10-20T12:00:00Z');
 const read=(c,owner,filters={})=>readHistory(c,owner,historyFiltersSchema.parse(filters));
 await t.test('server pagination and stable date ordering return only selected owner metadata',async()=>{const first=await read(a,auth.a.id,{pageSize:3}),second=await read(a,auth.a.id,{pageSize:3,page:2});assert.equal(first.total,11);assert.equal(first.items.length,3);assert.equal(second.items.length,3);assert.equal(first.items.some(r=>second.items.some(s=>s.id===r.id)),false);assert.equal(first.items[0].id,ids[10]);assert.equal(JSON.stringify(first).includes('prepared_json'),false);assert.equal(first.items.some(r=>r.id===foreign),false);});
 await t.test('title wildcard characters are literal, sort ascending works and stale page recovers',async()=>{assert.equal((await read(a,auth.a.id,{q:'%_'})).total,1);assert.equal((await read(a,auth.a.id,{order:'created_asc'})).items[0].id,ids[0]);assert.equal((await read(a,auth.a.id,{page:999})).filters.page,1);assert.equal((await read(a,auth.a.id,{q:'missing'})).total,0);});
 await t.test('RLS applies even when a caller supplies another owner to the repository',async()=>{assert.equal((await read(a,auth.b.id)).total,0);assert.equal((await read(b,auth.a.id)).total,0);assert.equal((await read(b,auth.b.id)).items[0].id,foreign);});
 const id=ids[0],operation=randomUUID(),pack=randomUUID();
 await db.query("insert into public.quiz_revisions(generation_id,user_id,revision,draft_json,origin) values($1,$2,1,'{}','manual'),($1,$2,2,'{}','manual')",[id,auth.a.id]);
 await db.query("insert into public.generation_events(id,generation_id,user_id,event_type,request_hash,status,base_revision) values($1,$2,$3,'PACKAGE',$4,'COMPLETED',1)",[operation,id,auth.a.id,'b'.repeat(64)]);
 await db.query("insert into public.scorm_packages(id,generation_id,user_id,revision,operation_id,storage_path,status,file_size,file_sha256) values($1,$2,$3,1,$4,$5,'READY',500,$6)",[pack,id,auth.a.id,operation,`${auth.a.id}/${id}/r1/${pack}/package.zip`,'c'.repeat(64)]);
 await db.query("update public.generations set current_revision=1,current_package_id=$2,status='SCORM_GENERATED' where id=$1",[id,pack]);
 await t.test('package availability requires a READY artifact matching the current revision',async()=>{assert.equal((await read(a,auth.a.id,{q:'%_'})).items[0].hasPackage,true);await db.query('update public.generations set current_revision=2 where id=$1',[id]);assert.equal((await read(a,auth.a.id,{q:'%_'})).items[0].hasPackage,false);await db.query('update public.generations set current_revision=1 where id=$1',[id]);});
 await t.test('status filters and dashboard exact counts are real and isolated',async()=>{assert.equal((await read(a,auth.a.id,{status:'SCORM_GENERATED'})).total,1);const summary=await readWorkspaceSummary(a,auth.a.id);assert.deepEqual([summary.total,summary.pending,summary.packages,summary.recent.length],[11,10,1,3]);assert.equal((await readWorkspaceSummary(b,auth.b.id)).total,1);});
 await t.test('pending deletion remains recoverable in history and never offers its ZIP',async()=>{await db.query('update public.generations set deleting_at=now() where id=$1',[id]);const item=(await read(a,auth.a.id,{q:'%_'})).items[0];assert.equal(item.deleting,true);assert.equal(item.hasPackage,false);const summary=await readWorkspaceSummary(a,auth.a.id);assert.equal(summary.total,10);assert.equal(summary.recent.some(r=>r.id===id),false);});
 await t.test('expired credentials fail instead of presenting a fabricated empty library',async()=>{await a.auth.signOut();await assert.rejects(read(a,auth.a.id));});
});
test('history HTTP endpoints require an authenticated session',{skip:!process.env.SCORM_TEST_URL},async()=>{const {nativeFetch}=require('./register.cjs');for(const path of ['/api/workspace/history','/api/workspace/summary']){const r=await nativeFetch(process.env.SCORM_TEST_URL+path);assert.equal(r.status,401);assert.match(r.headers.get('cache-control'),/no-store/);}});
