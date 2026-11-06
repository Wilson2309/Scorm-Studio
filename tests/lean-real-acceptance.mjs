// Explicit live acceptance only; never imported by npm test or mock suites.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);require('./register.cjs');
const {validateQuiz}=require('../src/lib/content/quality.ts');
const {validateSCORMArtifact}=require('../src/lib/content/scorm-artifact.ts');
const {Browser}=await import(pathToFileURL(process.env.SCORM_CDP_MODULE).href);
const out=resolve('artifacts/phase-02.5.1/final-acceptance'),shots=resolve('.taste-skill/phase0251/final-acceptance');mkdirSync(shots,{recursive:true});
const prepared=JSON.parse(readFileSync(join(out,'prepared.json'),'utf8'));
const result={source:'One real existing-provider inference with reused verified preparation; native Quiz Studio controls.',checks:[],realMoodle:'NOT VERIFIED'};
const save=()=>writeFileSync(join(out,'ui-results.json'),JSON.stringify(result,null,2)+'\n');
const browser=await Browser.launch();
try{
 const page=await browser.newPage();
 const wait=async(fn,timeout=20000)=>{const start=Date.now();while(Date.now()-start<timeout){if(await page.eval(fn))return;await new Promise(r=>setTimeout(r,150));}throw new Error('Timed out: '+fn.toString());};
 const click=async text=>{for(let i=0;i<160;i++){if(await page.eval(text=>[...document.querySelectorAll('button')].some(b=>b.getClientRects().length&&b.textContent.trim()===text&&!b.disabled),text))return page.eval(text=>[...document.querySelectorAll('button')].find(b=>b.getClientRects().length&&b.textContent.trim()===text&&!b.disabled).click(),text);await new Promise(r=>setTimeout(r,100));}throw new Error('Unavailable: '+text);};
 const set=async(id,value)=>page.eval(({id,value})=>{const element=document.getElementById(id);if(!element||element.readOnly)throw new Error('Not editable');const type=element.tagName==='TEXTAREA'?HTMLTextAreaElement:element.tagName==='SELECT'?HTMLSelectElement:HTMLInputElement;Object.getOwnPropertyDescriptor(type.prototype,'value').set.call(element,value);element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));},{id,value});
 const shot=async(label,width)=>{await page.setViewport({width,height:1000,mobile:width<600});assert.ok(await page.eval(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:join(shots,`${label}-${width}.png`),format:'png',fullPage:true});};
 await page.goto(process.env.SCORM_TEST_URL+'/crear');
 await page.eval(({prepared,endpoint})=>{
   const original=window.fetch.bind(window);window.__liveCalls=0;window.__submittedQuiz=null;window.__aiActions=[];
   window.fetch=async(input,options)=>{
     if(String(input).endsWith('/api/intelligence')&&options?.body){
       const data=JSON.parse(options.body);window.__aiActions.push(data.action);
       if(data.action==='prepare')return Response.json({prepared});
       if(data.action==='generateHybrid'){
         if(++window.__liveCalls!==1)throw new Error('A second inference is forbidden.');
         window.__writingStarted=performance.now();
         return original(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data.config)});
       }
       throw new Error('No additional AI action is allowed in acceptance.');
     }
     if(String(input).endsWith('/api/scorm'))window.__submittedQuiz=JSON.parse(options.body);
     return original(input,options);
   };
 },{prepared,endpoint:process.env.SCORM_LIVE_GENERATE_URL});
 const {root}=await page.send('DOM.getDocument');const {nodeId}=await page.send('DOM.querySelector',{nodeId:root.nodeId,selector:'input[type=file]'});await page.send('DOM.setFileInputFiles',{nodeId,files:[process.env.SCORM_ACCEPTANCE_PDF]});
 await wait(()=>!!document.querySelector('.document-ready-label'));await page.eval(()=>window.__documentStarted=performance.now());
 await click('Comprender el contenido');await click('Extraer y preparar contenido');await wait(()=>!!document.querySelector('.understanding'));
 await click('Continuar');await wait(()=>!!document.querySelector('.studio-type-grid'));await click('Continuar');await wait(()=>!!document.getElementById('question-count'));
 assert.equal(await page.eval(()=>document.getElementById('question-count').value),'5');
 await click('Generar evaluación');
 await wait(()=>document.querySelectorAll('.studio-question').length===5||!!document.querySelector('.field-error')?.textContent,650000);
 if(await page.eval(()=>document.querySelectorAll('.studio-question').length!==5)){result.error=await page.eval(()=>document.querySelector('.field-error')?.textContent);save();throw new Error('Real generation was rejected.');}
 result.requestToQuizStudioMs=await page.eval(()=>performance.now()-window.__writingStarted);
 result.documentToStudioMs=await page.eval(()=>performance.now()-window.__documentStarted);
 const originalQuiz=JSON.parse(readFileSync(join(out,'generated-quiz.json'),'utf8'));
 result.initialQuality=validateQuiz(originalQuiz);result.initialUI=await page.eval(()=>({reviewState:document.querySelector('.quiz-studio').dataset.reviewState,summary:document.querySelector('.studio-review-header').textContent,questions:[...document.querySelectorAll('.studio-question')].map(q=>({id:q.id,status:q.dataset.qualityStatus,issues:q.querySelector('.question-issues')?.textContent??''}))}));
 for(const width of [1440,390])await shot('real-draft',width);
 result.checks.push('The actual real-provider result reached Quiz Studio with all five assigned questions.');result.status='AWAITING_TEACHER_EDITS';save();
 console.log(JSON.stringify({status:result.status,requestToQuizStudioMs:result.requestToQuizStudioMs,quality:{pass:result.initialQuality.passCount,warning:result.initialQuality.warningQuestionCount,blocking:result.initialQuality.blockingQuestionCount}}));
 const editFile=join(out,'teacher-edits.json');const reviewStart=Date.now();
 while(!existsSync(editFile)){if(Date.now()-reviewStart>1800000)throw new Error('Teacher edit instructions not provided in acceptance window.');await new Promise(r=>setTimeout(r,500));}
 const edits=JSON.parse(readFileSync(editFile,'utf8'));assert.ok(edits.length>=1);
 for(const change of edits){
   await page.eval(id=>document.getElementById('question-'+id).querySelector('.question-actions-row button').click(),change.id);await wait(()=>!!document.querySelector('.question-editor'));
   assert.ok(await page.eval(()=>[...document.querySelectorAll('.editor-sources textarea')].every(t=>t.readOnly)));
   if(change.stem!==undefined)await set(`edit-${change.id}-stem`,change.stem);
   if(change.explanation!==undefined)await set(`edit-${change.id}-explanation`,change.explanation);
   if(change.cognitiveLevel!==undefined)await set(`edit-${change.id}-level`,change.cognitiveLevel);
   if(change.options){for(const [i,text] of change.options.entries())await set(`edit-${change.id}-${'abcd'[i]}`,text);}
   if(change.correctOptionId)await page.eval(letter=>document.querySelectorAll('.option-editor input[type=radio]')['abcd'.indexOf(letter)].click(),change.correctOptionId);
   await click('Guardar cambios');await wait(()=>!document.querySelector('.question-editor'));
 }
 assert.equal(await page.eval(()=>window.__liveCalls),1);assert.deepEqual(await page.eval(()=>window.__aiActions),['prepare','generateHybrid']);
 result.afterEditUI=await page.eval(()=>({state:document.querySelector('.quiz-studio').dataset.reviewState,summary:document.querySelector('.studio-review-header').textContent,questions:[...document.querySelectorAll('.studio-question')].map(q=>({id:q.id,status:q.dataset.qualityStatus}))}));
 assert.equal(result.afterEditUI.state,'READY');
 await click('Vista previa');await wait(()=>!!document.querySelector('.quiz-preview'));
 const preExportPreview=await page.eval(()=>document.querySelector('.quiz-preview').srcdoc);
 await click('Generar SCORM 1.2');await wait(()=>!!document.querySelector('.package-ready'));
 const quiz=await page.eval(()=>window.__submittedQuiz),quality=validateQuiz(quiz);assert.equal(quality.blockingCount,0);
 for(const change of edits){const q=quiz.questions.find(q=>q.id===change.id);if(change.stem!==undefined)assert.equal(q.stem,change.stem);if(change.explanation!==undefined)assert.equal(q.explanation,change.explanation);}
 const bytes=new Uint8Array(await page.eval(async()=>Array.from(new Uint8Array(await(await fetch(document.querySelector('a[download]').href)).arrayBuffer()))));
 const artifact=validateSCORMArtifact(bytes,quiz);
 const getPayload=html=>JSON.parse(html.match(/id="quiz-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
 const finalPayload=getPayload(artifact.html);assert.deepEqual(getPayload(preExportPreview),finalPayload);
 assert.deepEqual(finalPayload.questions.map(q=>({stem:q.stem,options:q.options,correct:q.correctOptionId,explanation:q.explanation})),quiz.questions.map(q=>({stem:q.stem,options:q.options,correct:q.correctOptionId,explanation:q.explanation})));
 writeFileSync(join(out,'edited-quiz.json'),JSON.stringify(quiz,null,2));writeFileSync(join(out,'unidad-1-lean-reviewed-scorm12.zip'),bytes);writeFileSync(join(out,'preview.html'),artifact.html);
 result.finalQuality=quality;result.zip={validated:true,size:bytes.length,files:artifact.paths,usesEditedData:true};
 result.checks.push('Native editing reran deterministic validators, sources remained read-only, and no extra model call occurred.','Preview and validated ZIP exactly match all final edited questions, answers and explanations.');
 for(const width of [1440,390])await shot('edited-package',width);
 const learner=await browser.newPage();await learner.goto(pathToFileURL(join(out,'preview.html')).href);assert.equal(await learner.eval(()=>document.getElementById('question-count').textContent),'5 preguntas');assert.equal(await learner.eval(()=>document.getElementById('passing').textContent),'70/100');await learner.eval(()=>document.getElementById('start').click());
 for(let i=0;i<5;i++){const index=quiz.questions[i].options.findIndex(o=>o.id===quiz.questions[i].correctOptionId);await learner.eval(index=>{document.querySelectorAll('input[type=radio]')[index].click();document.getElementById('quiz').requestSubmit();},index);assert.equal(await learner.eval(()=>document.getElementById('explanation').textContent),quiz.questions[i].explanation);await learner.eval(()=>document.getElementById('next').click());}
 assert.equal(await learner.eval(()=>document.getElementById('score').textContent),'100');
 assert.deepEqual(page.consoleErrors,[]);assert.deepEqual(learner.consoleErrors,[]);
 result.checks.push('Actual exported learner starts, shows final explanations and completes the passing attempt.');result.liveCalls=await page.eval(()=>window.__liveCalls);result.status='PASS';save();
 console.log(JSON.stringify({status:'UI_ACCEPTANCE_PASS',zip:result.zip,finalQuality:{pass:quality.passCount,warning:quality.warningQuestionCount,blocking:quality.blockingQuestionCount},liveCalls:result.liveCalls}));
}catch(error){result.status='FAIL';result.error=error.message;save();throw error;}
finally{await browser.close();}
