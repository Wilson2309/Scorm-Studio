import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {installTestSession} from './browser-test-session.mjs';
const require=createRequire(import.meta.url),{pdfBytes}=require('./pdf-fixture.cjs'),{extracted}=require('./content-fixture.cjs');
const {Browser}=await import(pathToFileURL(process.env.SCORM_CDP_MODULE).href);
const base=process.env.SCORM_TEST_URL,out=resolve('.taste-skill/phase0251/workspace-browser');mkdirSync(out,{recursive:true});
const fixture=join(out,'workspace.pdf');writeFileSync(fixture,pdfBytes(extracted.text));
const result={scope:'Local browser, official Supabase SDK, Auth/Storage HTTP fixtures and PostgreSQL with active RLS. No live Ollama or remote writes.',checks:[],screens:[]};
const browser=await Browser.launch();
try{
 const page=await browser.newPage();await installTestSession(page);
 await page.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__writingCalls=[];const native=window.fetch.bind(window);window.fetch=(input,init)=>{if(String(input).includes('/api/workspace/')&&init?.body&&typeof init.body==='string'){try{const body=JSON.parse(init.body);if(['generate','regenerate'].includes(body.action))window.__writingCalls.push(body.action);}catch{}}return native(input,init);};`});
 const wait=async(p,fn)=>{for(let i=0;i<180;i++){if(await p.eval(fn))return;await new Promise(r=>setTimeout(r,100));}throw new Error('Browser condition timed out: '+fn.toString());};
 const click=async(p,text)=>{for(let i=0;i<180;i++){if(await p.eval(text=>[...document.querySelectorAll('button')].some(b=>b.getClientRects().length&&b.textContent.trim()===text&&!b.disabled),text))return p.eval(text=>[...document.querySelectorAll('button')].find(b=>b.getClientRects().length&&b.textContent.trim()===text&&!b.disabled).click(),text);await new Promise(r=>setTimeout(r,100));}throw new Error('Unavailable '+text);};
 const set=async(p,id,value)=>p.eval(({id,value})=>{const input=document.getElementById(id);const type=input.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement;Object.getOwnPropertyDescriptor(type.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));},{id,value});
 const saved=async p=>wait(p,()=>document.querySelector('.workspace-save-strip p strong')?.textContent==='Borrador guardado');
 const edit=async(p,index,text)=>{await p.eval(i=>document.querySelectorAll('.studio-question')[i].querySelector('.question-actions-row button').click(),index);await wait(p,()=>!!document.querySelector('.question-editor'));const id=await p.eval(()=>document.querySelector('.question-editor textarea').id);await set(p,id,text);};
 await page.goto(base+'/crear');await wait(page,()=>!!document.querySelector('input[type=file]'));
 await wait(page,()=>Object.keys(document.querySelector('input[type=file]')).some(k=>k.startsWith('__reactProps$')));
 const root=(await page.send('DOM.getDocument')).root;const input=await page.send('DOM.querySelector',{nodeId:root.nodeId,selector:'input[type=file]'});await page.send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[fixture]});
 await wait(page,()=>!!document.querySelector('.document-ready-label'));await click(page,'Comprender el contenido');await click(page,'Extraer y preparar contenido');await wait(page,()=>!!document.querySelector('.understanding'));
 await click(page,'Continuar');await wait(page,()=>!!document.querySelector('.studio-type-grid'));await click(page,'Continuar');await wait(page,()=>!!document.getElementById('question-count'));await set(page,'question-count','3');await click(page,'Generar evaluación');await wait(page,()=>document.querySelectorAll('.studio-question').length===3);
 assert.deepEqual(await page.eval(()=>window.__writingCalls),['generate']);
 const id=await page.eval(()=>document.querySelector('[data-generation-id]').dataset.generationId);
 const stems=await page.eval(()=>[...document.querySelectorAll('.studio-question h4')].map(n=>n.textContent));
 const first=stems[0]+' Primera edición persistida.',second=stems[1]+' Segunda edición persistida.';
 await edit(page,0,first);await saved(page); // Autosave while editor is still open.
 await click(page,'Guardar cambios');await saved(page);
 await edit(page,1,second);await click(page,'Guardar cambios');await saved(page);
 result.checks.push('Typing saves with debounce while the editor remains open; two edited questions reach PostgreSQL.');
 await page.eval(()=>document.querySelector('.user-menu summary').click());await click(page,'Cerrar sesión');await wait(page,()=>!!document.getElementById('email'));
 await page.goto(base+'/crear?generation='+id);await wait(page,()=>!!document.getElementById('email'));assert.equal(await page.eval(()=>location.pathname),'/login');
 await set(page,'email','teacher-a@scorm.test');await set(page,'password','Local-test-password-123!');await page.eval(()=>document.querySelector('form').requestSubmit());await wait(page,()=>document.querySelectorAll('.studio-question').length===3);
 assert.equal(await page.eval(()=>document.querySelectorAll('.studio-question h4')[0].textContent),first);assert.equal(await page.eval(()=>document.querySelectorAll('.studio-question h4')[1].textContent),second);assert.deepEqual(await page.eval(()=>window.__writingCalls),[]);
 result.checks.push('Logout, protected route, login and restoration recover both edits without a writing request or localStorage draft.');
 const stale=await browser.newPage();await installTestSession(stale);await stale.goto(base+'/crear?generation='+id);await wait(stale,()=>document.querySelectorAll('.studio-question').length===3);
 await edit(page,0,first+' Nueva revisión.');await click(page,'Guardar cambios');await saved(page);
 await edit(stale,0,first+' Cambio en pestaña antigua.');await wait(stale,()=>document.querySelector('.workspace-save-strip')?.textContent.includes('Hay una revisión más reciente'));
 assert.match(await stale.eval(()=>document.querySelector('.question-editor textarea').value),/pestaña antigua/);assert.ok(await stale.eval(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Descargar mis cambios')));
 result.checks.push('A stale tab receives a revision conflict, retains its text and offers a local backup instead of overwriting.');
 await click(page,'Generar SCORM 1.2');await wait(page,()=>!!document.querySelector('.package-ready'));
 const before=await page.eval(()=>window.__writingCalls.length);const downloaded=await page.eval(async id=>{const response=await fetch('/api/workspace/'+id+'/download');return {status:response.status,type:response.headers.get('content-type'),size:(await response.arrayBuffer()).byteLength};},id);
 assert.equal(downloaded.status,200);assert.equal(downloaded.type,'application/zip');assert.ok(downloaded.size>100);assert.equal(await page.eval(()=>window.__writingCalls.length),before);
 await click(page,'Vista previa');await wait(page,()=>!!document.querySelector('iframe'));assert.ok(await page.eval(()=>document.querySelector('iframe').srcdoc.includes('Primera edición persistida')));
 // srcdoc intentionally has an opaque sandbox origin. Inspect its execution world
 // through DevTools; never relax the product's allow-scripts-only sandbox for QA.
 let learnerTarget;
 for(let i=0;i<100;i++){learnerTarget=(await browser.send('Target.getTargets')).targetInfos.find(t=>t.type==='iframe'&&t.url==='about:srcdoc');if(learnerTarget)break;await new Promise(r=>setTimeout(r,50));}
 assert(learnerTarget,'Sandbox preview must create its own iframe target');
 const {sessionId:learnerSession}=await browser.send('Target.attachToTarget',{targetId:learnerTarget.targetId,flatten:true});
 await browser.send('Runtime.enable',{},learnerSession);
 const inLearner=async expression=>{const r=await browser.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},learnerSession);if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
 for(let i=0;i<100;i++){if(await inLearner(`!!document.getElementById('title')?.textContent`))break;await new Promise(r=>setTimeout(r,50));}
 const learnerPreview=await inLearner(`({title:document.getElementById('title').textContent,description:document.querySelector('.intro-cover .description').textContent,connection:document.getElementById('connection').textContent,pause:document.getElementById('pause').textContent})`);
 assert.match(learnerPreview.connection,/Vista previa/);assert.equal(learnerPreview.pause,'Cerrar demostración');assert(!/candidatos detectados|fragmentos académicos|grounding/.test(learnerPreview.description));
 await inLearner(`document.getElementById('start').click()`);
 assert.equal(await inLearner(`document.getElementById('question').hidden`),false);
 const endpointPreview=await page.eval(async id=>{const r=await fetch('/api/workspace/'+id+'/download?preview=1');return {status:r.status,csp:r.headers.get('content-security-policy'),html:await r.text()};},id);
 assert.equal(endpointPreview.status,200);assert.match(endpointPreview.csp,/font-src data:/);assert(endpointPreview.html.includes('Primera edición persistida'));
 result.checks.push('Current learner preview renders in Quiz Studio, starts normally, hides engine metadata, labels standalone demonstration honestly and permits embedded fonts under preview CSP.');
 result.checks.push('SCORM package and preview use the edited revision, with authenticated download and zero extra inference.');
 for(const width of [1440,768,390]){await page.setViewport({width,height:1000,mobile:width<600});assert.ok(await page.eval(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:join(out,'saved-'+width+'.png'),format:'png',fullPage:true});result.screens.push('saved-'+width+'.png');}
 await stale.setViewport({width:390,height:1000,mobile:true});await stale.screenshot({path:join(out,'conflict-390.png'),format:'png',fullPage:true});result.screens.push('conflict-390.png');
 result.status='PASS';console.log(JSON.stringify(result));writeFileSync(join(out,'results.json'),JSON.stringify(result,null,2)+'\n');
}finally{await browser.close();}
