/* eslint-disable @typescript-eslint/no-require-imports */
// Read-only diagnostic. Never logs URL, keys, tokens, email or provider bodies.
require('../tests/register.cjs');require('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const {publicSupabaseConfig}=require('../src/lib/supabase/config.ts');
const {createClient}=require('@supabase/supabase-js');
async function main(){
 const config=publicSupabaseConfig();if(!config){console.log(JSON.stringify({configured:false,auth:'NOT_RUN',profiles:'NOT_RUN'}));process.exitCode=1;return;}
 const result={configured:true};
 try{const response=await fetch(config.url+'/auth/v1/settings',{headers:{apikey:config.publishableKey},signal:AbortSignal.timeout(15000)});result.auth={httpStatus:response.status,connection:response.ok?'PASS':'FAIL'};if(response.ok){const settings=await response.json();result.auth.emailProviderEnabled=!!settings.external?.email;result.auth.emailConfirmationRequired=!settings.mailer_autoconfirm;}}catch{result.auth={connection:'FAIL',error:'connection_unavailable'};}
 try{const client=createClient(config.url,config.publishableKey,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});const {status,error}=await client.from('profiles').select('id,full_name,role').limit(0);result.profiles={httpStatus:status,status:error?(error.code==='PGRST205'?'MIGRATION_REQUIRED':error.code==='42501'?'ANONYMOUS_DENIED_EXPECTED':'NOT_VERIFIED'):'SCHEMA_AVAILABLE',code:error?.code??null};}catch{result.profiles={status:'NOT_VERIFIED'};}
 console.log(JSON.stringify(result));if(result.auth.connection!=='PASS')process.exitCode=1;
}
main().catch(()=>{console.log(JSON.stringify({auth:'FAIL',error:'controlled_diagnostic_error'}));process.exitCode=1;});
