// Explicit real-browser acceptance. Credentials arrive only on stdin; no privileged client.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {mkdirSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);require('./register.cjs');
const dir=resolve('artifacts/phase-03.3');
const preflight=process.argv.includes('--preflight');
if(!process.argv.includes('--run-live')&&!preflight){console.log(JSON.stringify({status:'NOT_EXECUTED',reason:'Use scripts/test-workspace-ui-live.ps1 privately.'}));process.exit(2);}
require('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const {projectRef}=require('../scripts/supabase-project-ref.cjs');assert.equal(projectRef(process.env.NEXT_PUBLIC_SUPABASE_URL),'xufqqqufvlmbkjiszpki');
const {Browser}=await import(pathToFileURL(process.env.SCORM_CDP_MODULE).href);
const {unzipSync}=require('fflate'),{validateSCORMArtifact}=require('../src/lib/content/scorm-artifact.ts'),{validateQuiz}=require('../src/lib/content/quality.ts');
const base='http://localhost:3000',pdf='./.cache/private/authorized-input.pdf';
if(preflight){
 let probe;
 try{probe=await Browser.launch();const page=await probe.newPage();await page.goto(base+'/login',{timeoutMs:60000});const state=await page.eval(()=>({email:!!document.getElementById('email'),password:!!document.getElementById('password'),enabled:!!document.querySelector('button[type=submit]:not(:disabled)')}));assert(state.email&&state.password&&state.enabled);console.log(JSON.stringify({preflight:'PASS',scope:'Browser and real login form only; no login or inference'}));}
 catch{console.log(JSON.stringify({preflight:'FAIL',reason:'Cannot open enabled login form'}));process.exitCode=1;}
 finally{await probe?.close();}
 process.exit(process.exitCode||0);
}
mkdirSync(dir,{recursive:true});let secret='',credentials,browser,stage='checkpoint';
for await(const chunk of process.stdin){secret+=chunk;if(secret.length>8192)throw Error('invalid_private_input');}
try{credentials=JSON.parse(secret.replace(/^\uFEFF/,''));}catch{secret='';console.log(JSON.stringify({status:'FAIL',error:'invalid_private_input'}));process.exit(1);}secret='';assert(credentials.a.email!==credentials.b.email);
const report={transport:'REAL_BROWSER_SUPABASE_OLLAMA',project:'xufqqqufvlmbkjiszpki',checkpoint:{status:'RUNNING',checks:[]},history:{status:'NOT_EXECUTED',checks:[]},newMoodleZIP:'NOT_VERIFIED'};
const save=()=>writeFileSync(join(dir,'ui-live-results.json'),JSON.stringify(report,null,2));
const check=text=>{report[stage].checks.push({test:text,status:'PASS'});save();};
const step=name=>{report[stage].step=name;save();};
const wait=async(page,fn,timeout=60000)=>{const started=Date.now();while(Date.now()-started<timeout){if(await page.eval(fn))return;await new Promise(r=>setTimeout(r,150));}throw Error('ui_condition_timeout');};
const click=async(page,text)=>{const started=Date.now();while(Date.now()-started<30000){const clicked=await page.eval(text=>{const b=[...document.querySelectorAll('button,a')].find(b=>b.getClientRects().length&&b.textContent.trim()===text&&!b.disabled);if(!b)return false;b.click();return true;},text);if(clicked)return;await new Promise(r=>setTimeout(r,150));}throw Error('control_unavailable');};
const set=async(page,id,value)=>page.eval(({id,value})=>{const e=document.getElementById(id);if(!e)throw Error('field_unavailable');const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement:e.tagName==='SELECT'?HTMLSelectElement:HTMLInputElement;Object.getOwnPropertyDescriptor(proto.prototype,'value').set.call(e,value);e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));},{id,value});
const login=async(page,account)=>{step('login_navigation');await page.goto(base+'/login',{timeoutMs:60000});await wait(page,()=>!!document.getElementById('email')&&Object.keys(document.querySelector('form')).some(k=>k.startsWith('__reactProps$')));step('login_submit');await set(page,'email',account.email);await set(page,'password',account.password);await page.eval(()=>{document.querySelector('form').requestSubmit();});await wait(page,()=>!!document.querySelector('.user-menu')||!!document.querySelector('form ~ .field-error'));if(!await page.eval(()=>!!document.querySelector('.user-menu')))throw Error('login_rejected');};
const logout=async page=>{await page.eval(()=>document.querySelector('.user-menu summary').click());await click(page,'Cerrar sesión');await wait(page,()=>!!document.getElementById('email'));};
const screenshot=async(page,label)=>{await page.screenshot({path:join(dir,label+'.png'),format:'png',fullPage:true});};
try{
 step('browser_launch');browser=await Browser.launch();step('browser_page');const page=await browser.newPage();
 await page.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__writing=[];const original=window.fetch.bind(window);window.fetch=(url,init)=>{if(String(url).includes('/api/workspace/')&&typeof init?.body==='string'){try{const b=JSON.parse(init.body);if(['generate','regenerate'].includes(b.action))window.__writing.push(b.action);}catch{}}return original(url,init);};`});
 await login(page,credentials.a);check('A logs in through the real application UI');step('pdf_upload');
 await page.goto(base+'/crear');await wait(page,()=>!!document.querySelector('input[type=file]'));
 await wait(page,()=>Object.keys(document.querySelector('input[type=file]')).some(k=>k.startsWith('__reactProps$')));
 const root=(await page.send('DOM.getDocument')).root;const node=await page.send('DOM.querySelector',{nodeId:root.nodeId,selector:'input[type=file]'});await page.send('DOM.setFileInputFiles',{nodeId:node.nodeId,files:[pdf]});
 await wait(page,()=>!!document.querySelector('.document-ready-label'));await click(page,'Comprender el contenido');await wait(page,()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Extraer y preparar contenido'&&!b.disabled));await click(page,'Extraer y preparar contenido');
 await wait(page,()=>!!document.querySelector('.understanding'),120000);check('Real PDF upload and deterministic preparation reach the understanding screen');
 report.generationId=await page.eval(()=>document.querySelector('[data-generation-id]').dataset.generationId);save();
 await click(page,'Continuar');await wait(page,()=>!!document.querySelector('.studio-type-grid'));
 // Advance the design screen, then use the existing real quiz configuration.
 await click(page,'Continuar');await wait(page,()=>!!document.getElementById('question-count'));await set(page,'question-count','5');await set(page,'activity-title','Aceptación UI 03.3');
 step('one_educational_request');report.checkpoint.educationalRequests=1;save();const began=Date.now();await click(page,'Generar evaluación');await wait(page,()=>document.querySelectorAll('.studio-question').length===5||!!document.querySelector('.field-error')?.textContent.trim(),660000);
 assert.equal(await page.eval(()=>document.querySelectorAll('.studio-question').length),5,'one_real_inference_did_not_produce_quiz');report.checkpoint.generationMs=Date.now()-began;
 assert.deepEqual(await page.eval(()=>window.__writing),['generate']);check('Exactly one real Ollama quiz generation reaches the persisted five-question draft');
 const resource=report.generationId;let current=await page.eval(async id=>(await(await fetch('/api/workspace/'+id)).json()).snapshot,resource);
 writeFileSync(join(dir,'generated-quiz.json'),JSON.stringify(current.quiz,null,2));report.checkpoint.quality={valid:validateQuiz(current.quiz).valid,blocking:validateQuiz(current.quiz).blockingCount};save();
 const edit=async(index,field,value)=>{await page.eval(i=>document.querySelectorAll('.studio-question')[i].querySelector('.question-actions-row button').click(),index);await wait(page,()=>!!document.querySelector('.question-editor'));await set(page,`edit-${current.quiz.questions[index].id}-${field}`,value);await wait(page,()=>document.querySelector('.workspace-save-strip strong')?.textContent==='Borrador guardado');await click(page,'Guardar cambios');await wait(page,()=>!document.querySelector('.question-editor'));};
 const first=current.quiz.questions[0].stem+' Versión revisada.',second=current.quiz.questions[1].explanation+' Evidencia revisada.';
 await edit(0,'stem',first);await edit(1,'explanation',second);check('Two edits autosave through Quiz Studio without another inference');
 await logout(page);await login(page,credentials.a);await page.goto(base+'/crear?generation='+resource);await wait(page,()=>document.querySelectorAll('.studio-question').length===5);
 current=await page.eval(async id=>(await(await fetch('/api/workspace/'+id)).json()).snapshot,resource);assert.equal(current.quiz.questions[0].stem,first);assert.equal(current.quiz.questions[1].explanation,second);assert.deepEqual(await page.eval(()=>window.__writing),[]);check('Logout/login restores the exact edited draft without invoking Ollama');
 await screenshot(page,'checkpoint-restored');
 if(!validateQuiz(current.quiz).valid){report.checkpoint.status='REVIEW_REQUIRED';report.checkpoint.reason='Real AI draft has blocking pedagogical issues; teacher correction required before export';save();throw Error('teacher_review_required');}
 await click(page,'Generar SCORM 1.2');await wait(page,()=>!!document.querySelector('.package-ready'),120000);
 const zip=await page.eval(async id=>{const r=await fetch('/api/workspace/'+id+'/download');if(!r.ok)throw Error('private_download_failed');return Array.from(new Uint8Array(await r.arrayBuffer()));},resource);const bytes=new Uint8Array(zip);validateSCORMArtifact(bytes,current.quiz);assert.deepEqual(Object.keys(unzipSync(bytes)).sort(),['imsmanifest.xml','index.html','runtime.js','styles.css']);writeFileSync(join(dir,'checkpoint-scorm.zip'),bytes);check('UI builds and stores a valid private SCORM ZIP using the edited data');
 await click(page,'Descargar SCORM 1.2');assert.deepEqual(await page.eval(()=>window.__writing),[]);check('Download button uses the stored ZIP and triggers no generation request');
 await screenshot(page,'checkpoint-package');report.checkpoint.status='PASS';report.history.status='WAITING_FOR_IMPLEMENTATION';save();console.log(JSON.stringify({checkpoint:'PASS',checks:report.checkpoint.checks.length,generationId:resource,message:'Mantén esta terminal abierta. Se reutilizará esta sesión para la QA del historial.'}));
 const flag=join(dir,'history-ready');if(existsSync(flag))unlinkSync(flag);const waiting=Date.now();while(!existsSync(flag)){if(Date.now()-waiting>3600000)throw Error('history_qa_deferred');await new Promise(r=>setTimeout(r,1500));}
 stage='history';
 // Implementation supplies only test code, not credentials. Same process/session remains private.
 const {historyAcceptance}=await import(pathToFileURL(resolve('tests/history-ui-acceptance.mjs')).href);
 await historyAcceptance({page,browser,base,credentials,resource,report,check,save,wait,click,set,login,logout,screenshot});
 report.history.status='PASS';save();console.log(JSON.stringify({checkpoint:report.checkpoint.status,history:report.history.status,checks:report.history.checks.length}));
}catch(e){report[stage].status=report[stage].status==='REVIEW_REQUIRED'?'REVIEW_REQUIRED':'FAIL';report[stage].error=/^[a-z_]+$/.test(e.message)?e.message:/CDP timeout/.test(e.message)?'browser_protocol_timeout':/navigate:/.test(e.message)?'browser_navigation_failed':/page eval:/.test(e.message)?'browser_dom_evaluation_failed':/Chrome|WebSocket/.test(e.message)?'browser_launch_failed':'controlled_ui_assertion_or_transport_error';report[stage].failureLocation=e.stack?.match(/(?:workspace-ui-live|cdp)\.mjs:\d+:\d+/)?.[0]??'unknown';save();console.log(JSON.stringify({stage,step:report[stage].step,status:report[stage].status,error:report[stage].error,failureLocation:report[stage].failureLocation,report:'artifacts/phase-03.3/ui-live-results.json'}));process.exitCode=1;}
finally{if(credentials){credentials.a=null;credentials.b=null;}await browser?.close();}
