/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),{createHash}=require('node:crypto');
const {quiz}=require('./content-fixture.cjs');
const {renderQuiz,learnerDescription}=require('../src/lib/scorm/template.ts');
const {learnerRuntime,learnerStyles}=require('../src/lib/scorm/learner-assets.ts');
const {learnerPresentation}=require('../src/lib/scorm/learner-visuals.ts');
const {packageSCORM}=require('../src/lib/scorm/package.ts');
const {unzipSync,strFromU8}=require('fflate');
const payload=html=>JSON.parse(html.match(/id="quiz-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
test('learner visual refinement preserves the exact production SCORM runtime bytes',()=>{
 assert.equal(createHash('sha256').update(learnerRuntime).digest('hex'),'52b795adf90cd000743ab00fe28db8cfe2863bbd00461b184626fc548fc0e7f2');
});
test('learner introduction hides engine summaries without changing serialized content or resume identity',()=>{
 const raw='Preparación local del documento: 67 fragmentos académicos y 34 candidatos detectados. Propuestas deterministas, no comprensión semántica certificada.';
 const q={...quiz,description:raw},html=renderQuiz(q),data=payload(html);assert.equal(data.description,raw);assert.equal(data.analysis,undefined);
 assert(!learnerDescription(raw).includes('fragmentos'));assert.equal(learnerDescription(quiz.description),quiz.description);
 assert.match(html,/<p id="description" hidden><\/p>/);
 assert.deepEqual(data.questions.map(q=>({id:q.id,options:q.options,answer:q.correctOptionId,refs:q.sourceReferences})),q.questions.map(q=>({id:q.id,options:q.options,answer:q.correctOptionId,refs:q.sourceReferences})));
 const {fingerprint,...original}=data;let h=2166136261;for(const char of JSON.stringify(original))h=Math.imul(h^char.charCodeAt(0),16777619);assert.equal(fingerprint,(h>>>0).toString(16));
 assert.equal(payload(renderQuiz(q,true)).fingerprint,fingerprint);
});
test('portable ZIP keeps four resources, native controls, sources and self-contained licensed typefaces',()=>{
 const files=unzipSync(packageSCORM(quiz)),html=strFromU8(files['index.html']);
 assert.deepEqual(Object.keys(files).sort(),['imsmanifest.xml','index.html','runtime.js','styles.css']);assert.equal(strFromU8(files['runtime.js']),learnerRuntime);
 assert.match(learnerStyles,/font-family:"Inter"/);assert.match(learnerStyles,/font-family:"Manrope"/);assert.match(learnerStyles,/data:font\/woff2;base64/);assert.match(learnerStyles,/SIL OPEN FONT LICENSE/);
 assert(!/<(?:script|link)[^>]+(?:src|href)="https?:/i.test(html));assert.match(learnerStyles,/prefers-reduced-motion/);assert.match(html,/<summary>.*Volver a la fuente/);assert.match(learnerRuntime,/input.type='radio'/);
});
test('presentation adapter only reflects existing runtime state and makes no LMS or answer writes',()=>{
 const observed=[],elements=new Map();
 for(const id of ['connection','save-state','result-status','pause','progress-caption','progress','quiz','stem'])elements.set(id,{textContent:'',dataset:{},value:0,setAttribute(k,v){this[k]=v;}});
 const el=id=>elements.get(id);el('connection').textContent='Vista previa local · Sin guardado en el aula';
 vm.runInNewContext(learnerPresentation,{document:{getElementById:el},MutationObserver:class{constructor(fn){this.fn=fn;}observe(){observed.push(this.fn);}}});
 assert.equal(el('pause').textContent,'Cerrar demostración');assert.equal(el('connection').dataset.state,'preview');assert.equal(el('save-state').textContent,'');
 el('connection').textContent='Conectado al aula';el('save-state').textContent='Progreso guardado en el aula.';el('result-status').textContent='Aprobado';el('progress').value=3;observed[0]();
 assert.equal(el('connection').dataset.state,'connected');assert.equal(el('save-state').dataset.state,'saved');assert.equal(el('result-status').dataset.outcome,'passed');assert.equal(el('progress-caption').textContent,'3 confirmadas');
 el('save-state').textContent='No se pudo confirmar el guardado en el aula. Mantén la actividad abierta.';el('result-status').textContent='Aún no aprobado';observed[1]();assert.equal(el('save-state').dataset.state,'error');assert.equal(el('result-status').dataset.outcome,'failed');
 el('connection').textContent='No se pudo iniciar SCORM. No se guardarán respuestas.';observed[0]();assert.equal(el('pause').textContent,'Cerrar actividad');
 assert(!/LMS(?:SetValue|GetValue|Initialize|Finish|Commit)\s*\(|addEventListener|\.click\(|quiz-data|correctOptionId|suspend_data/.test(learnerPresentation));
});
