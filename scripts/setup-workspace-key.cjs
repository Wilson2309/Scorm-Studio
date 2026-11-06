/* eslint-disable @typescript-eslint/no-require-imports */
// Local setup only. Never prints or rotates a nonempty key.
const fs=require('node:fs'),crypto=require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const existing=process.env.WORKSPACE_SIGNING_KEY;
if(existing){
 const configured=/^[a-f0-9]{64}$/.test(existing);console.log(JSON.stringify({workspaceSigningKey:{configured},created:false}));if(!configured)process.exitCode=1;
}else if(process.argv.includes('--check')){console.log(JSON.stringify({workspaceSigningKey:{configured:false},created:false}));process.exitCode=1;}
else{
 try{const path='.env.local',text=fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';
  const line='WORKSPACE_SIGNING_KEY='+crypto.randomBytes(32).toString('hex');
  const next=/^WORKSPACE_SIGNING_KEY=.*$/m.test(text)?text.replace(/^WORKSPACE_SIGNING_KEY=.*$/m,line):text.replace(/\s*$/,'')+'\n'+line+'\n';
  fs.writeFileSync(path,next);console.log(JSON.stringify({workspaceSigningKey:{configured:true},created:true}));
 }catch{console.log(JSON.stringify({workspaceSigningKey:{configured:false},error:'local_key_setup_failed'}));process.exitCode=1;}
}
