/* eslint-disable @typescript-eslint/no-require-imports */
// Use the project's existing compiler; no test runner dependency.
require('./register.cjs');
const { readFileSync } = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);
};
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { unzipSync, strFromU8 } = require('fflate');
const { extractPDF, cleanText } = require('../src/lib/pdf/extract.ts');
const { generateQuiz } = require('../src/lib/quiz/generate.ts');
const { quizSchema } = require('../src/lib/quiz/schema.ts');
const { packageSCORM } = require('../src/lib/scorm/package.ts');
const { renderQuiz } = require('../src/lib/scorm/template.ts');
const { quizRuntime } = require('../src/lib/scorm/assets.ts');
const { boundedBody, BodyTooLargeError } = require('../src/lib/http/bounded-body.ts');

const sentences = [
  'La fotosintesis transforma la energia solar en nutrientes para los organismos vegetales.',
  'Las mitocondrias producen energia mediante procesos celulares de respiracion biologica.',
  'Los ecosistemas relacionan organismos vivos con los elementos naturales de su entorno.',
  'La biodiversidad representa la variedad de especies presentes en las regiones del planeta.',
  'Los investigadores observan patrones naturales y registran resultados de experimentos.',
  'La conservacion protege los recursos naturales mediante estrategias sostenibles comunitarias.',
];
const doc = { name: 'biologia.pdf', pages: 1, text: sentences.join('\n'), warnings: [] };
const quiz = generateQuiz(doc, { title: 'Biología de prueba', count: 5, scored: true });
function pdfFixture(lines = sentences) {
  const stream = 'BT /F1 11 Tf 40 780 Td 16 TL ' + lines.map((s,i) => (i ? 'T* ' : '') + '(' + s + ') Tj').join('\n') + ' ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 700 850] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream',
  ];
  let result = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((o,i) => { offsets.push(Buffer.byteLength(result)); result += `${i+1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(result);
  result += 'xref\n0 6\n0000000000 65535 f \n' + offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('');
  result += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new File([result], 'biologia.pdf', { type:'application/pdf' });
}
test('real PDF bytes -> extraction -> validated quiz -> valid ZIP members', async () => {
  const extracted = await extractPDF(pdfFixture());
  assert.equal(extracted.pages,1); assert.match(extracted.text,/fotosintesis/);
  const generated = generateQuiz(extracted,{title:'Prueba real PDF',count:5,scored:true});
  const files = unzipSync(packageSCORM(generated));
  assert.deepEqual(Object.keys(files).sort(), ['imsmanifest.xml','index.html','runtime.js','styles.css']);
  assert.match(strFromU8(files['imsmanifest.xml']),/adlcp:scormtype="sco"/);
  assert.match(strFromU8(files['imsmanifest.xml']),/<schemaversion>1.2<\/schemaversion>/);
  assert.match(strFromU8(files['index.html']),/Prueba real PDF/);
});
test('reject invalid / empty / image-only PDF and oversized stream', async () => {
  await assert.rejects(extractPDF(new File(['not pdf'],'x.pdf')),/cabecera/);
  await assert.rejects(extractPDF(pdfFixture([])),/suficiente texto/);
  await assert.rejects(boundedBody(new Request('http://localhost',{method:'POST',body:'123456'}),5),BodyTooLargeError);
  assert.equal(cleanText('infor-\nmación   útil\u0000'),'información útil');
});
test('schema rejects invalid answers and duplicate choices; generator reports insufficient text', () => {
  assert.throws(()=>quizSchema.parse({...quiz,questions:[{...quiz.questions[0],answer:4}]}));
  assert.throws(()=>packageSCORM({...quiz,questions:quiz.questions.map(q=>({...q,options:['a','a','b','c']}))}));
  assert.throws(()=>generateQuiz(doc,{title:'Prueba',count:20,scored:true}),/Reduce la cantidad/);
});
test('document strings cannot escape JSON script or XML title', () => {
  const malicious = {...quiz,title:'Prueba </script><script>alert(1)</script> & texto'};
  const html = renderQuiz(malicious,true);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html,/\\u003c\/script>/);
  const xml = strFromU8(unzipSync(packageSCORM(malicious))['imsmanifest.xml']);
  assert.match(xml,/&lt;\/script&gt;/); assert.match(xml,/&amp; texto/);
});

// Minimal DOM harness exercises the actual shipped runtime and LMS calls.
function launch(quizData, stored = {}, apiMode = 'ok') {
  class Element {
    constructor(tag) { this.tag = tag; this.children=[]; this.events={}; this.disabled=false; this.textContent=''; }
    append(...items) { this.children.push(...items); }
    addEventListener(name,fn) { this.events[name]=fn; }
    querySelectorAll() { return this.children.flatMap(c=>c instanceof Element ? [c,...c.querySelectorAll()] : []).filter(c=>c.tag==='input'||c.tag==='button'); }
    focus() {}
  }
  const elements = new Map();
  for (const id of ['quiz-data','connection','save-state','quiz','title','source','instructions','progress','result','finish']) elements.set(id,new Element(id==='quiz'?'form':'p'));
  elements.get('quiz-data').textContent=JSON.stringify(quizData);
  const values={...stored}, calls=[];
  const API = {
    LMSInitialize:()=>apiMode==='init-fail'?'false':'true',
    LMSGetValue:k=>values[k]||'',
    LMSSetValue:(k,v)=>{calls.push([k,v]);values[k]=v;return 'true';},
    LMSCommit:()=>apiMode==='commit-fail'?'false':'true',
    LMSFinish:()=>{calls.push(['finish']);return 'true';},
  };
  const win={API:apiMode==='absent'?null:API,addEventListener:()=>{}}; win.parent=win;
  const document={ getElementById:id=>elements.get(id), createTextNode:s=>s, createElement:tag=>{
    const element=new Element(tag); Object.defineProperty(element,'id',{set(id){elements.set(id,element);}});return element;
  }};
  vm.runInNewContext(quizRuntime,{document,window:win,Date,JSON,Number,String,Array,Math});
  function answer(correct=true) {
    const inputs=elements.get('quiz').querySelectorAll().filter(e=>e.tag==='input');
    quizData.questions.forEach((q,i)=>inputs[i*4+(correct?q.answer:(q.answer+1)%4)].events.change());
  }
  return { values,calls,elements,answer,submit:()=>elements.get('quiz').events.submit({preventDefault(){}}),finish:()=>elements.get('finish').events.click() };
}
test('SCORM reports score, pass/fail, suspension, resume and finishes only once', () => {
  const run=launch(quiz); run.answer();
  assert.equal(run.values['cmi.core.exit'],'suspend');
  const resumed=launch(quiz,run.values); resumed.submit();
  assert.equal(resumed.values['cmi.core.score.raw'],'100');
  assert.equal(resumed.values['cmi.core.lesson_status'],'passed');
  assert.equal(resumed.values['cmi.core.exit'],'');
  resumed.finish(); resumed.finish(); assert.equal(resumed.calls.filter(c=>c[0]==='finish').length,1);
  const failed=launch(quiz);failed.answer(false);failed.submit();assert.equal(failed.values['cmi.core.lesson_status'],'failed');
});
test('unscored completion, standalone preview and LMS failures are explicit', () => {
  const run=launch({...quiz,scored:false});run.answer();run.submit();
  assert.equal(run.values['cmi.core.lesson_status'],'completed');assert.equal(run.values['cmi.core.score.raw'],undefined);
  assert.match(launch(quiz,{},'absent').elements.get('connection').textContent,/Vista previa local/);
  assert.match(launch(quiz,{},'init-fail').elements.get('connection').textContent,/No se pudo iniciar/);
  const failed=launch(quiz,{},'commit-fail');failed.answer();assert.match(failed.elements.get('save-state').textContent,/No se pudo confirmar/);
});
test('HTTP upload and ZIP response with real PDF', {skip:!process.env.SCORM_TEST_URL}, async () => {
  const base=process.env.SCORM_TEST_URL;
  const form=new FormData();form.set('file',pdfFixture());
  const result=await fetch(base+'/api/extract',{method:'POST',body:form});
  assert.equal(result.status,200,await result.clone().text());
  const extracted=await result.json();
  const {document:sourceDocument,quiz:sourceQuiz}=require('./content-fixture.cjs');
  assert.ok(extracted.pageTexts.length);
  const generated={...sourceQuiz,sourceName:extracted.name,sources:sourceDocument.fragments};
  const zip=await fetch(base+'/api/scorm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(generated)});
  assert.equal(zip.status,200);assert.match(zip.headers.get('content-type'),/application\/zip/);
  assert.ok(unzipSync(new Uint8Array(await zip.arrayBuffer()))['imsmanifest.xml']);
  assert.equal((await fetch(base+'/api/scorm',{method:'POST',body:'{}'})).status,422);
  assert.equal((await fetch(base+'/api/extract',{method:'POST',body:new FormData()})).status,400);
});
