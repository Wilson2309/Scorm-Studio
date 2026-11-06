/* eslint-disable @typescript-eslint/no-require-imports */
// HTTP Storage transport is simulated; SQL, RPCs, roles and RLS execute in PostgreSQL.
const {workspaceDB}=require('./workspace-db.cjs');
const {randomUUID}=require('node:crypto');
async function workspaceBackend(){
 const w=await workspaceDB({adminSchema:true}),files=new Map(),signed=new Map();let clockOffset=0;
 const tables=new Set(['documents','generations','quiz_revisions','quiz_drafts','generation_events','scorm_packages']);
 async function handle(req,res,id){
  const url=new URL(req.url,'http://fixture'),send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(!id)return send({code:'42501',message:'Authentication required'},401);
  const parts=url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  try{
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const raw=Buffer.concat(chunks);
   if(parts[0]==='rest'){
    if(parts[2]==='rpc')return send(await w.rpc(id,parts[3],raw.length?JSON.parse(raw.toString()):{}));
    const table=parts[2];if(!tables.has(table))return send({code:'PGRST205'},404);
    if(!['GET','HEAD'].includes(req.method))return send({code:'42501',message:'Transactional RPC required'},403);
    const params=[],clauses=[];
    for(const [key,value] of url.searchParams){
     if(['select','order','limit','offset'].includes(key))continue;if(!/^[a-z_]+$/.test(key))throw new Error('Invalid query');
     const column='"'+key+'"';
     if(value==='is.null'){clauses.push(column+' is null');continue;}
     if(value.startsWith('in.(')&&value.endsWith(')')){const values=value.slice(4,-1).split(',').map(v=>v.replace(/^"|"$/g,''));const slots=values.map(v=>{params.push(v);return '$'+params.length;});clauses.push(column+' in ('+slots.join(',')+')');continue;}
     const at=value.indexOf('.'),op=value.slice(0,at),operator={eq:'=',neq:'<>',ilike:'ilike'}[op];if(!operator)throw new Error('Invalid query');params.push(value.slice(at+1));clauses.push(column+' '+operator+' $'+params.length);
    }
    const ordering=url.searchParams.get('order')||(table==='quiz_drafts'?'updated_at.desc':'created_at.desc');
    if(!ordering.split(',').every(s=>/^[a-z_]+\.(asc|desc)$/.test(s)))throw new Error('Invalid order');
    const order=ordering.split(',').map(s=>{const [key,direction]=s.split('.');return '"'+key+'" '+direction;}).join(',');
    const limit=Math.min(100,Number(url.searchParams.get('limit')||100));
    const offset=Number(url.searchParams.get('offset')||0),where=clauses.length?' where '+clauses.join(' and '):'';
    if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1)throw new Error('Invalid range');
    const selected=url.searchParams.get('select')||'*';if(selected!=='*'&&!selected.split(',').every(c=>/^[a-z_]+$/.test(c)))throw new Error('Invalid projection');
    if((req.headers.prefer||'').includes('count=exact')){const count=Number((await w.as(id,`select count(*)::int as total from public.${table}${where}`,params)).rows[0].total);res.setHeader('Content-Range',`${offset}-${Math.min(offset+limit,count)-1}/${count}`);if(offset>0&&offset>=count)return send({code:'PGRST103'},416);}
    const result=await w.as(id,`select ${selected} from public.${table}${where} order by ${order} limit ${limit} offset ${offset}`,params);
    if((req.headers.accept||'').includes('application/vnd.pgrst.object+json'))return result.rows.length===1?send(result.rows[0]):send({code:'PGRST116',message:'Expected one row'},406);
    return send(result.rows);
   }
   // /storage/v1/object[/authenticated|/sign]/bucket/path
   if(parts[0]==='storage'&&parts[2]==='object'){
    let at=3;const sign=parts[at]==='sign';if(parts[at]==='authenticated'||sign)at++;
    const bucket=parts[at++],path=parts.slice(at).join('/'),key=bucket+'/'+path;
    if(req.method==='POST'&&sign){
     const visible=await w.as(id,'select id from storage.objects where bucket_id=$1 and name=$2',[bucket,path]);if(!visible.rows.length)return send({message:'Not found'},404);
     const body=JSON.parse(raw.toString()),token=randomUUID();signed.set(token,{key,expires:Date.now()+clockOffset+body.expiresIn*1000});return send({signedURL:'/object/sign/'+key+'?token='+token});
    }
    if(req.method==='POST'){
     await w.as(id,'insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[bucket,path,{size:raw.length}]);files.set(key,raw);return send({Key:key,Id:randomUUID()});
    }
    if(req.method==='GET'){
     const visible=await w.as(id,'select id from storage.objects where bucket_id=$1 and name=$2',[bucket,path]);if(!visible.rows.length||!files.has(key))return send({message:'Not found'},404);
     res.writeHead(200,{'Content-Type':bucket==='scorm-pdfs'?'application/pdf':'application/zip'});res.end(files.get(key));return;
    }
    if(req.method==='DELETE'){
     const body=JSON.parse(raw.toString());const deleted=[];
     for(const name of body.prefixes){const result=await w.as(id,'delete from storage.objects where bucket_id=$1 and name=$2 returning name',[bucket,name]);for(const row of result.rows){files.delete(bucket+'/'+row.name);deleted.push(row);}}
     return send(deleted);
    }
   }
   return send({message:'Not implemented'},404);
  }catch(error){const safe=new Set(['last_admin_required','admin_role_conflict','admin_request_conflict','admin_required','admin_target_unavailable','invalid_admin_filters','invalid_role_change','invalid_period']);send({code:error.code||'fixture_error',message:safe.has(error.message)?error.message:'Local workspace operation rejected'},error.code==='42501'?403:error.code==='23505'?409:['40001','PT409','55P03'].includes(error.code)?409:400);}
 }
 return {...w,files,signed,handle,advance:ms=>{clockOffset+=ms;},signedReadable:token=>{const record=signed.get(token);return !!record&&record.expires>Date.now()+clockOffset&&files.has(record.key);}};
}
module.exports={workspaceBackend};
