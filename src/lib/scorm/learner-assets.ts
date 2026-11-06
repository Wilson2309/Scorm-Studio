import {learnerVisualStyles} from "./learner-visuals";
import {scormAPIPrimitives} from "./api-primitives";
export const learnerStyles=learnerVisualStyles;

export const learnerRuntime=String.raw`"use strict";
(function(){
const quiz=JSON.parse(document.getElementById('quiz-data').textContent);
const el=id=>document.getElementById(id);
let api=null,active=false,ended=false,started=false,done=false,index=0;
let answers=quiz.questions.map(()=>null),confirmed=quiz.questions.map(()=>false);
const began=Date.now();
${scormAPIPrimitives}
let writeFailed=false;
function set(key,value){if(!active)return; if(!ok(call('LMSSetValue',key,String(value))))writeFailed=true;}
function commit(){if(!active)return;const saved=ok(call('LMSCommit',''));el('save-state').textContent=!saved?'No se pudo confirmar el guardado en el aula. Mantén la actividad abierta.':writeFailed?'El aula no pudo guardar todos los datos. Vuelve a intentar al finalizar.':'Progreso guardado en el aula.';}
function persist(){if(!active)return;writeFailed=false;set('cmi.suspend_data',JSON.stringify({v:2,fingerprint:quiz.fingerprint,a:answers,c:confirmed,i:index,started,done}));set('cmi.core.lesson_location',index+1);set('cmi.core.exit',done?'':'suspend');commit();}
const score=()=>Math.round(quiz.questions.filter((q,i)=>q.options[answers[i]]&&q.options[answers[i]].id===q.correctOptionId).length/quiz.questions.length*100);
function report(){if(!active)return;if(quiz.scored){set('cmi.core.score.min',0);set('cmi.core.score.max',100);set('cmi.core.score.raw',score());}set('cmi.core.lesson_status',quiz.scored?(score()>=quiz.passingScore?'passed':'failed'):'completed');}
function show(stage){['intro','question','results'].forEach(id=>el(id).hidden=id!==stage);const heading=el(stage==='intro'?'title':stage==='question'?'question-number':'results-title');heading.focus();}
function renderFeedback(q){
const selected=q.options[answers[index]],correct=selected&&selected.id===q.correctOptionId;
el('feedback').hidden=false;el('feedback').dataset.correct=String(correct);
el('feedback-title').textContent=correct?'Respuesta correcta':'Vamos a revisar esta idea';
el('feedback-answer').textContent=correct?'Has identificado la respuesta.':'Respuesta correcta: '+q.options.find(o=>o.id===q.correctOptionId).text;
el('explanation').textContent=q.explanation;
el('reference').textContent=q.sourceReferences.map(r=>'Página '+r.page+': '+r.quote).join('\n');
el('confirm').hidden=true;el('next').hidden=false;el('next').textContent=index===quiz.questions.length-1?'Ver resultados':'Siguiente pregunta';
}
function renderQuestion(){
const q=quiz.questions[index];show('question');el('question-number').textContent='Pregunta '+(index+1)+' de '+quiz.questions.length;
el('concept').textContent=q.conceptLabel;el('progress').max=quiz.questions.length;el('progress').value=confirmed.filter(Boolean).length;
el('stem').textContent=q.stem;const options=el('options');options.replaceChildren();
q.options.forEach((o,j)=>{const label=document.createElement('label');label.className='answer-card';const input=document.createElement('input');input.type='radio';input.name='answer';input.value=String(j);input.required=true;input.checked=answers[index]===j;input.disabled=confirmed[index]||ended;input.setAttribute('aria-describedby','question-help');input.addEventListener('change',()=>{answers[index]=j;persist();});const text=document.createElement('span');text.textContent=o.text;label.append(input,text);options.append(label);});
el('feedback').hidden=true;el('confirm').hidden=false;el('confirm').disabled=ended;el('next').hidden=true;
if(confirmed[index])renderFeedback(q);
}
function showResults(){show('results');el('score').textContent=quiz.scored?String(score()):String(confirmed.filter(Boolean).length);el('score-unit').textContent=quiz.scored?'/ 100':'/ '+quiz.questions.length+' respondidas';el('result-status').textContent=quiz.scored?(score()>=quiz.passingScore?'Aprobado':'Aún no aprobado'):'Actividad completada';el('result-description').textContent=quiz.scored?'Has terminado el recorrido. El umbral de aprobación es '+quiz.passingScore+'/100.':'Has completado el recorrido. Esta actividad registra finalización sin enviar una nota.';const list=el('coverage');list.replaceChildren();const concepts=[...new Set(quiz.questions.map(q=>q.conceptLabel))];concepts.forEach(concept=>{const rows=quiz.questions.map((q,i)=>({q,i})).filter(r=>r.q.conceptLabel===concept);const correct=rows.filter(r=>r.q.options[answers[r.i]]&&r.q.options[answers[r.i]].id===r.q.correctOptionId).length;const li=document.createElement('li'),name=document.createElement('strong'),value=document.createElement('span');name.textContent=concept;value.textContent=correct+' de '+rows.length+' respuestas correctas';li.append(name,value);list.append(li);});}
api=find(window);if(!api){try{api=find(window.opener);}catch{}}
if(api)active=ok(call('LMSInitialize',''));
el('connection').textContent=active?'Conectado al aula':api?'No se pudo iniciar SCORM. No se guardarán respuestas.':'Vista previa local · Sin guardado en el aula';
if(active){try{const saved=JSON.parse(call('LMSGetValue','cmi.suspend_data')||'null');if(saved&&saved.v===2&&saved.fingerprint===quiz.fingerprint&&Array.isArray(saved.a)&&saved.a.length===answers.length&&saved.a.every(a=>a===null||Number.isInteger(a)&&a>=0&&a<4)&&Array.isArray(saved.c)&&saved.c.length===answers.length&&saved.c.every((c,i)=>typeof c==='boolean'&&(!c||saved.a[i]!==null))){answers=saved.a;confirmed=saved.c;started=saved.started===true;done=saved.done===true&&confirmed.every(Boolean);index=Number.isInteger(saved.i)?Math.max(0,Math.min(quiz.questions.length-1,saved.i)):0;}}catch{}const previous=call('LMSGetValue','cmi.core.lesson_status');if(!previous||previous==='not attempted'||previous==='browsed')set('cmi.core.lesson_status','incomplete');}
el('title').textContent=quiz.title;el('description').textContent=quiz.description;el('question-count').textContent=quiz.questions.length+' preguntas';el('passing').textContent=quiz.scored?quiz.passingScore+'/100':'Sin puntuación';el('source').textContent=quiz.sourceName;
el('start').addEventListener('click',()=>{if(ended)return;started=true;renderQuestion();persist();});
el('quiz').addEventListener('submit',event=>{event.preventDefault();if(ended||confirmed[index]||answers[index]===null)return;confirmed[index]=true;renderQuestion();renderFeedback(quiz.questions[index]);el('feedback-title').focus();persist();});
el('next').addEventListener('click',()=>{if(ended||!confirmed[index])return;if(index<quiz.questions.length-1){index++;renderQuestion();persist();}else{done=true;report();persist();showResults();}});
function finish(){if(ended)return;if(active){writeFailed=false;if(done)report();persist();const elapsed=Math.min(35999999,Math.floor((Date.now()-began)/1000));set('cmi.core.session_time',String(Math.floor(elapsed/3600)).padStart(4,'0')+':'+String(Math.floor(elapsed%3600/60)).padStart(2,'0')+':'+String(elapsed%60).padStart(2,'0'));commit();const finished=ok(call('LMSFinish',''));el('connection').textContent=finished?'Sesión finalizada. Puedes volver al curso.':'El aula no confirmó el cierre de sesión.';active=false;}else el('connection').textContent='Vista previa finalizada. Puedes cerrar esta ventana.';ended=true;document.querySelectorAll('input,button').forEach(control=>control.disabled=true);}
el('finish').addEventListener('click',finish);el('pause').addEventListener('click',finish);window.addEventListener('pagehide',finish);
window.addEventListener('pageshow',event=>{if(event.persisted&&ended){el('connection').textContent='La sesión ya está cerrada. Vuelve a abrir la actividad desde el curso.';}});
if(done)showResults();else if(started)renderQuestion();else show('intro');
})();`;
