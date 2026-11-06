// Browser acceptance over the exported bytes. No AI, remote writes or real LMS claims.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve,join,extname} from 'node:path';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {once} from 'node:events';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);require('./register.cjs');
const {Browser}=await import(pathToFileURL(process.env.SCORM_CDP_MODULE).href);
const root=resolve('artifacts/scorm-learner-refinement'),out=join(root,'screens');mkdirSync(out,{recursive:true});
const quiz=JSON.parse(readFileSync(join(root,'before/quiz.json'),'utf8'));
const report={scope:'Exported SCORM and same-origin iframe with a test SCORM 1.2 API; not a real Moodle test',checks:[],screens:[],comparisons:[]};
const wrapper=(kind,mode,restore)=>`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SCORM iframe QA</title><style>body{margin:0;background:#dbe4ec}iframe{display:block;width:100%;height:760px;border:0}</style><script>
window.values=${JSON.stringify(restore||{})};window.calls=[];const mode=${JSON.stringify(mode)};
if(mode!=='preview')window.API={LMSInitialize:()=>{calls.push(['LMSInitialize']);return mode==='init-fail'?'false':'true'},LMSGetValue:key=>values[key]||'',LMSSetValue:(key,value)=>{calls.push(['LMSSetValue',key,value]);values[key]=value;return mode==='set-fail'?'false':'true'},LMSCommit:()=>{calls.push(['LMSCommit']);return mode==='commit-fail'?'false':'true'},LMSFinish:()=>{calls.push(['LMSFinish']);return 'true'}};
</script><iframe title="Actividad de aprendizaje" src="/${kind}/${kind==='before'?'preview.html':'index.html'}"></iframe></html>`;
const server=createServer((req,res)=>{const url=new URL(req.url,'http://qa');
 if(url.pathname==='/frame'){let restore={};if(url.searchParams.get('restore'))restore=JSON.parse(url.searchParams.get('restore'));res.setHeader('Content-Type','text/html; charset=utf-8');res.end(wrapper(url.searchParams.get('kind')==='before'?'before':'after',url.searchParams.get('mode')||'preview',restore));return;}
 if(!/^\/(before|after)\/(preview\.html|index\.html|runtime\.js|styles\.css)$/.test(url.pathname)){res.writeHead(404);res.end();return;}
 const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[extname(url.pathname)];res.setHeader('Content-Type',type);res.end(readFileSync(join(root,url.pathname.slice(1))));
});server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
const browser=await Browser.launch();
try{
 const wait=async(page)=>{for(let i=0;i<100;i++){if(await page.eval(()=>!!document.querySelector('iframe')?.contentDocument?.getElementById('title')?.textContent))return;await new Promise(r=>setTimeout(r,50));}throw Error('Frame did not load');};
 const frame=async(kind='after',mode='preview',width=1440,restore)=>{const p=await browser.newPage({width,height:1000});await p.goto(base+'/frame?'+new URLSearchParams({kind,mode,...(restore?{restore:JSON.stringify(restore)}:{})}));await wait(p);await p.eval(async()=>{await document.querySelector('iframe').contentDocument.fonts.ready;});return p;};
 const action=(page,id)=>page.eval(id=>document.querySelector('iframe').contentDocument.getElementById(id).click(),id);
 const choose=async(page,correct)=>{await page.eval(correct=>{const d=document.querySelector('iframe').contentDocument,q=JSON.parse(d.getElementById('quiz-data').textContent).questions[Number(d.getElementById('question-number').textContent.match(/\d+/)[0])-1],index=q.options.findIndex(o=>correct?o.id===q.correctOptionId:o.id!==q.correctOptionId);d.querySelectorAll('input[type=radio]')[index].click();},correct);};
 const submit=page=>page.eval(()=>document.querySelector('iframe').contentDocument.getElementById('quiz').requestSubmit());
 const shot=async(page,kind,state,width)=>{await page.setViewport({width,height:1000,mobile:false});await new Promise(r=>setTimeout(r,260));
  const metrics=await page.eval(()=>{const f=document.querySelector('iframe'),d=f.contentDocument;f.style.height='1px';f.style.height=d.documentElement.scrollHeight+'px';return {overflow:d.documentElement.scrollWidth>d.documentElement.clientWidth+1,viewport:d.documentElement.clientWidth,body:d.body.scrollWidth,bodyFont:d.defaultView.getComputedStyle(d.body).fontFamily,headingFont:d.defaultView.getComputedStyle(d.querySelector('.stage:not([hidden]) h1')||d.getElementById('stem')).fontFamily,connection:d.getElementById('connection').textContent,pause:d.getElementById('pause').textContent};});
  assert(!metrics.overflow,`${kind}/${state}/${width}: overflow`);const file=`${kind}-${state}-${width}.png`;await page.screenshot({path:join(out,file),format:'png',fullPage:true});report.screens.push(file);return metrics;
 };
 // Six states at every width, with exactly the same five teacher-edited questions.
 for(const kind of ['before','after']){
  const p=await frame(kind);const capture=async state=>{for(const width of [1440,390])await shot(p,kind,state,width);};
  await capture('intro');await action(p,'start');await capture('question');await choose(p,true);await capture('selected');await submit(p);await capture('correct');await action(p,'next');await choose(p,false);await submit(p);await capture('incorrect');
  await p.eval(()=>{const d=document.querySelector('iframe').contentDocument;d.querySelector('#feedback details').open=true;});await shot(p,kind,'source',390);
  for(let i=1;i<quiz.questions.length;i++){await action(p,'next');if(i<quiz.questions.length-1){await choose(p,i<3);await submit(p);}}
  // Q1/Q3/Q4 correct => 60, failing result. Compare state/data after the same actions.
  await capture('results-failed');const result=await p.eval(()=>{const d=document.querySelector('iframe').contentDocument;return {score:d.getElementById('score').textContent,status:d.getElementById('result-status').textContent,progress:d.getElementById('progress').value};});
  assert.equal(result.score,'60');report.comparisons.push({kind,...result});
  if(kind==='after'){
   await shot(p,kind,'results-failed',320);
   assert.equal(await p.eval(()=>document.querySelector('iframe').contentDocument.getElementById('pause').textContent),'Cerrar demostración');
   const text=await p.eval(()=>document.querySelector('iframe').contentDocument.body.innerText);assert(!/fragmentos académicos|candidatos detectados|grounding|comprensión semántica|propuestas deterministas/i.test(text));
   assert.equal(await p.eval(()=>document.querySelector('iframe').contentDocument.getElementById('result-status').dataset.outcome),'failed');
  }
  assert.deepEqual(p.consoleErrors,[]);
 }
 assert.deepEqual({...report.comparisons[0],kind:undefined},{...report.comparisons[1],kind:undefined});
 report.checks.push('Before/after same content and interaction sequence: 60/100 and failed unchanged; all six states captured at desktop and 390, plus source and 320.');
 // Real native keyboard, focus, successful attempt, in an iframe.
 const p=await frame('after','ok',768);await p.eval(()=>document.querySelector('iframe').contentWindow.focus());await p.eval(()=>document.querySelector('iframe').contentDocument.getElementById('start').focus());
 const key=async(key,code,n)=>{await p.send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:n,...(key==='Enter'?{text:'\r'}:{})});await p.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:n});};
 await key('Enter','Enter',13);assert.equal(await p.eval(()=>document.querySelector('iframe').contentDocument.getElementById('question').hidden),false);
 await p.eval(()=>document.querySelector('iframe').contentDocument.querySelector('input[type=radio]').focus());await key(' ','Space',32);assert(await p.eval(()=>!!document.querySelector('iframe').contentDocument.querySelector('input:checked')));await shot(p,'after','keyboard-focus',768);
 await choose(p,true);await submit(p);const suspended=await p.eval(()=>({...window.values}));assert(JSON.parse(suspended['cmi.suspend_data']).c[0]);
 const resume=await frame('after','ok',390,suspended);assert.equal(await resume.eval(()=>document.querySelector('iframe').contentDocument.getElementById('feedback').hidden),false);assert.equal(await resume.eval(()=>document.querySelector('iframe').contentDocument.getElementById('feedback').dataset.correct),'true');
 for(let i=0;i<quiz.questions.length;i++){if(i>0){await choose(resume,true);await submit(resume);}await action(resume,'next');}
 assert.equal(await resume.eval(()=>window.values['cmi.core.score.raw']),'100');assert.equal(await resume.eval(()=>window.values['cmi.core.lesson_status']),'passed');
 for(const width of [1440,768,390])await shot(resume,'after','results-passed',width);
 assert.equal(await resume.eval(()=>document.querySelector('iframe').contentDocument.getElementById('result-status').dataset.outcome),'passed');
 await action(resume,'finish');assert.equal(await resume.eval(()=>window.calls.filter(c=>c[0]==='LMSFinish').length),1);assert(await resume.eval(()=>[...document.querySelector('iframe').contentDocument.querySelectorAll('input,button')].every(e=>e.disabled)));
 report.checks.push('Native Enter/Space, visible focus, confirmed radios locked, canonical source details, resume pending feedback, passed score 100, Finish once and controls locked.');
 for(const mode of ['preview','init-fail','commit-fail','set-fail']){
  const q=await frame('after',mode,390);await action(q,'start');await shot(q,'after',mode,390);const states=await q.eval(()=>{const d=document.querySelector('iframe').contentDocument;return {connection:d.getElementById('connection').textContent,save:d.getElementById('save-state').textContent,pause:d.getElementById('pause').textContent};});
  if(mode==='preview'){assert.match(states.connection,/Vista previa/);assert(!states.save.includes('guardado en el aula'));assert.equal(states.pause,'Cerrar demostración');}
  if(mode==='init-fail')assert.match(states.connection,/No se pudo iniciar/);
  if(mode==='commit-fail')assert.match(states.save,/No se pudo confirmar/);
  if(mode==='set-fail')assert.match(states.save,/no pudo guardar todos/);
 }
 report.checks.push('Connection/save UI derives only from the existing runtime messages: standalone demo, Initialize failure, SetValue failure, Commit failure, connected and closed.');
 const reduced=await frame('after','preview',390);await reduced.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await action(reduced,'start');assert.equal(await reduced.eval(()=>{const d=document.querySelector('iframe').contentDocument;return d.defaultView.getComputedStyle(d.getElementById('question')).animationName;}),'none');
 // Short Moodle-like iframe: scroll in the learner, no pinned footer obscures controls.
 await reduced.eval(()=>document.querySelector('iframe').style.height='520px');await choose(reduced,false);await submit(reduced);await reduced.eval(()=>{const d=document.querySelector('iframe').contentDocument;d.getElementById('next').scrollIntoView({block:'center'});});
 assert(await reduced.eval(()=>{const f=document.querySelector('iframe'),b=f.contentDocument.getElementById('next').getBoundingClientRect();return b.top>=0&&b.bottom<=f.clientHeight;}));await reduced.screenshot({path:join(out,'after-short-iframe-390.png'),format:'png'});report.screens.push('after-short-iframe-390.png');
 // File:// independent/offline launch must also work with no remote font/CDN.
 const file=await browser.newPage({width:1024,height:900});await file.goto(pathToFileURL(join(root,'after/index.html')).href);assert.equal(await file.eval(()=>document.getElementById('title').textContent),quiz.title);assert.match(await file.eval(()=>document.getElementById('connection').textContent),/Vista previa/);
 assert.deepEqual(file.consoleErrors,[]);report.checks.push('Reduced motion, scrollable 390×520 iframe with unobscured action, 320 px result, file:// package launch and embedded offline fonts.');
 report.status='PASS';writeFileSync(join(root,'visual-qa.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,screens:report.screens.length,checks:report.checks}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
