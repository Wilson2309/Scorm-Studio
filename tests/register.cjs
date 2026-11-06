/* eslint-disable @typescript-eslint/no-require-imports */
const {readFileSync}=require('node:fs');
const {mkdirSync}=require('node:fs');
const localTemp=require('node:path').resolve(__dirname,'../.cache/tmp');
mkdirSync(localTemp,{recursive:true});
process.env.TEMP=localTemp;process.env.TMP=localTemp;process.env.TASTE_SKILL_TMP=localTemp;
const ts=require('typescript');
const Module=require('node:module');
const load=Module._load;
const nativeFetch=globalThis.fetch;
module.exports={nativeFetch};
if(process.env.SCORM_TEST_URL&&process.env.SCORM_TEST_AUTH_COOKIE){globalThis.fetch=(input,init={})=>{
 if(String(input).startsWith(process.env.SCORM_TEST_URL+'/')){const headers=new Headers(init.headers);if(!headers.has('cookie'))headers.set('cookie',process.env.SCORM_TEST_AUTH_COOKIE);if(!headers.has('origin'))headers.set('origin',process.env.SCORM_TEST_URL);return nativeFetch(input,{...init,headers});}return nativeFetch(input,init);
};}
Module._load=function(id,...args){if(id==='server-only')return {};return load.call(this,id,...args);};
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
require.extensions['.tsx']=(module,filename)=>module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
