/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {quiz}=require('./content-fixture.cjs');
const {renderQuiz}=require('../src/lib/scorm/template.ts');
const {learnerRuntime}=require('../src/lib/scorm/learner-assets.ts');
function launch(input=quiz,stored={},mode='ok'){
  const html=renderQuiz(input,true),elements=new Map(),values={...stored},calls=[],windowEvents={};
  class Element{
    constructor(){this.children=[];this.events={};this.dataset={};this.disabled=false;this.hidden=false;this.textContent='';}
    append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}
    addEventListener(name,fn){this.events[name]=fn;}setAttribute(name,value){this[name]=value;}
    focus(){this.focused=true;}querySelectorAll(){return this.children.flatMap(e=>[e,...e.querySelectorAll()]);}
  }
  for(const id of html.matchAll(/id="([^"]+)"/g))elements.set(id[1],new Element());
  elements.get('quiz-data').textContent=html.match(/<script id="quiz-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
  elements.get('quiz').append(elements.get('options'));
  const API={LMSInitialize:()=>mode==='init-fail'?'false':'true',LMSGetValue:k=>values[k]||'',LMSSetValue:(k,v)=>{calls.push([k,v]);values[k]=v;return mode==='set-fail'?'false':'true';},LMSCommit:()=>mode==='commit-fail'?'false':'true',LMSFinish:()=>{calls.push(['finish']);return 'true';}};
  const window={API:mode==='absent'?null:API,addEventListener:(name,fn)=>windowEvents[name]=fn};window.parent=window;
  const document={getElementById:id=>elements.get(id),createElement:()=>new Element(),querySelectorAll:()=>[...elements.values()].flatMap(e=>[e,...e.querySelectorAll()])};
  vm.runInNewContext(learnerRuntime,{window,document,Date,JSON,Number,String,Math,Array,Set});
  const click=id=>elements.get(id).events.click();
  const submit=()=>elements.get('quiz').events.submit({preventDefault(){}});
  const select=correct=>{const state=JSON.parse(values['cmi.suspend_data']||'{"i":0}'),q=input.questions[state.i],index=correct?q.options.findIndex(o=>o.id===q.correctOptionId):q.options.findIndex(o=>o.id!==q.correctOptionId);elements.get('options').children[index].children[0].events.change();};
  return{elements,values,calls,windowEvents,click,select,submit};
}
test('learner intro -> question -> feedback -> results; confirmed answers stay locked',()=>{
  const run=launch();assert.equal(run.elements.get('intro').hidden,false);run.click('start');
  assert.match(run.elements.get('question-number').textContent,/1 de 3/);run.select(true);run.submit();
  assert.equal(run.elements.get('feedback').hidden,false);assert.equal(run.elements.get('feedback').dataset.correct,'true');
  assert.ok(run.elements.get('options').children.every(label=>label.children[0].disabled));
  run.click('next');run.select(true);run.submit();run.click('next');run.select(true);run.submit();run.click('next');
  assert.equal(run.elements.get('results').hidden,false);assert.equal(run.elements.get('score').textContent,'100');
  assert.equal(run.values['cmi.core.lesson_status'],'passed');assert.equal(run.elements.get('coverage').children.length,3);
  run.click('finish');run.windowEvents.pagehide();assert.equal(run.calls.filter(c=>c[0]==='finish').length,1);
});
test('learner resumes pending feedback, reports failure/unscored completion, and exposes save errors',()=>{
  const first=launch();first.click('start');first.select(false);first.submit();first.click('pause');
  assert.equal(first.values['cmi.core.exit'],'suspend');
  const resumed=launch(quiz,first.values);assert.equal(resumed.elements.get('feedback').hidden,false);assert.equal(resumed.elements.get('feedback').dataset.correct,'false');
  for(let i=1;i<3;i++){resumed.click('next');resumed.select(false);resumed.submit();}resumed.click('next');assert.equal(resumed.values['cmi.core.lesson_status'],'failed');
  const unscored=launch({...quiz,scored:false});unscored.click('start');for(let i=0;i<3;i++){unscored.select(true);unscored.submit();unscored.click('next');}assert.equal(unscored.values['cmi.core.lesson_status'],'completed');assert.equal(unscored.values['cmi.core.score.raw'],undefined);
  const failed=launch(quiz,{},'commit-fail');failed.click('start');assert.match(failed.elements.get('save-state').textContent,/No se pudo confirmar/);
  const setFailed=launch(quiz,{},'set-fail');setFailed.click('start');assert.match(setFailed.elements.get('save-state').textContent,/no pudo guardar todos/);
  assert.match(launch(quiz,{},'absent').elements.get('connection').textContent,/Vista previa local/);
  assert.match(launch(quiz,{},'init-fail').elements.get('connection').textContent,/No se pudo iniciar/);
  const revised=launch({...quiz,title:'Contenido actualizado'},first.values);assert.equal(revised.elements.get('intro').hidden,false);
});
