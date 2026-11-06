/* eslint-disable @typescript-eslint/no-require-imports */
const {randomUUID}=require('node:crypto');
// Only the isolated local browser runner calls this. Never used by application code.
async function seedAdminFixture(auth){
 const db=auth.workspace.db;
 for(let i=0;i<10;i++){const id=randomUUID();await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,`local${i}@scorm.test`,{full_name:`Docente local ${String(i+1).padStart(2,'0')}`}]);}
 for(let i=0;i<12;i++){const doc=randomUUID(),id=randomUUID(),owner=i%2?auth.a.id:auth.b.id;await db.query("insert into public.documents(id,user_id,filename,file_size,file_sha256,storage_path,prepared_json) values($1,$2,'Contenido privado de fixture.pdf',100,$3,$4,$5)",[doc,owner,'a'.repeat(64),`${owner}/${doc}/original.pdf`,{source:'PRIVATE_ADMIN_FIXTURE_CANARY'}]);await db.query("insert into public.generations(id,user_id,document_id,title,status,error_code) values($1,$2,$3,$4,$5,$6)",[id,owner,doc,`QA local — Arquitectura ${i+1}`,i%3===0?'FAILED':'PREPARED',i%3===0?'generation_failed':null]);}
}
module.exports={seedAdminFixture};
