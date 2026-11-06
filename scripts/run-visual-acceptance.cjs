/* eslint-disable @typescript-eslint/no-require-imports */
// Sequential real-browser suites; local transport fixtures and generated files only.
require('../tests/register.cjs');
const {spawn}=require('node:child_process');
async function main(){for(const args of [['tests/run-integration.cjs','--ui-recovery-browser'],['tests/run-integration.cjs','--timeline-browser'],['tests/timeline-learner-browser.mjs']]){const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{env:process.env,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('close',resolve);});if(code!==0)throw Error('Browser acceptance failed: '+args.join(' '));}}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
