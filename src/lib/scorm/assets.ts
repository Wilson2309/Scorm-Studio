// Fixed, versioned template assets. Document content is never executable markup.
export const quizStyles = `
:root{font-family:Inter,system-ui,sans-serif;color:#082b4c;background:#edf4fa}*{box-sizing:border-box}body{margin:0;padding:24px}main{max-width:780px;margin:auto;background:white;padding:clamp(18px,4vw,40px);border-radius:12px}h1{font-size:1.8rem;overflow-wrap:anywhere}p{line-height:1.6}fieldset{border:1px solid #d8e4f2;border-radius:8px;padding:20px;margin:24px 0}legend{font-weight:600;line-height:1.6;padding:0 8px}label{display:flex;gap:12px;padding:12px;border-radius:6px;cursor:pointer;overflow-wrap:anywhere}label:has(input:checked){background:#edf4fa}input{accent-color:#00549b}button{background:#00549b;color:white;border:0;border-radius:8px;padding:14px 22px;font:inherit;cursor:pointer}button:disabled{opacity:.55;cursor:default}button:focus-visible,input:focus-visible{outline:3px solid #00549b;outline-offset:4px}.feedback{background:#edf4fa;padding:12px;border-left:3px solid #f5c542;white-space:pre-wrap}#connection{font-size:.875rem;color:#475569}#result{font-size:1.2rem;font-weight:600}#save-state{color:#725400}progress{width:100%;height:8px;accent-color:#00549b}.actions{display:flex;gap:16px;flex-wrap:wrap}@media(max-width:480px){body{padding:8px}fieldset{padding:12px}}
`;

export const quizRuntime = String.raw`"use strict";
(function () {
  const quiz = JSON.parse(document.getElementById('quiz-data').textContent);
  const status = document.getElementById('connection');
  const saveState = document.getElementById('save-state');
  const form = document.getElementById('quiz');
  let api = null, active = false, ended = false, done = false;
  let answers = quiz.questions.map(() => null);
  const started = Date.now();
  function find(start) {
    let win = start;
    for (let i=0; win && i<20; i++) {
      try { if (win.API) return win.API; if (win.parent === win) break; win = win.parent; } catch { break; }
    }
    return null;
  }
  function call(method, ...args) {
    try { return api[method](...args); } catch { return 'false'; }
  }
  function ok(value) { return String(value) === 'true'; }
  function set(key, value) {
    if (!active || !ok(call('LMSSetValue', key, String(value)))) {
      if (active) saveState.textContent = 'El LMS no pudo guardar un dato. Mantén la actividad abierta y consulta al docente.';
      return false;
    }
    return true;
  }
  function commit() {
    if (!active) return false;
    const saved = ok(call('LMSCommit', ''));
    saveState.textContent = saved ? 'Progreso enviado al LMS.' : 'No se pudo confirmar el guardado en el LMS.';
    return saved;
  }
  function persist() {
    if (!active) return;
    let saved = set('cmi.suspend_data', JSON.stringify({v:1, a:answers, done}));
    saved = set('cmi.core.lesson_location', String(answers.filter(a => a !== null).length)) && saved;
    saved = set('cmi.core.exit', done ? '' : 'suspend') && saved;
    const committed = commit();
    if (!saved && committed) saveState.textContent = 'El LMS confirmó la conexión, pero no pudo guardar todos los datos.';
  }
  function evaluate() {
    const correct = quiz.questions.filter((q,i) => q.answer === answers[i]).length;
    return Math.round(correct / quiz.questions.length * 100);
  }
  function reportResult() {
    if (!active) return;
    if (quiz.scored) {
      set('cmi.core.score.min', 0); set('cmi.core.score.max', 100); set('cmi.core.score.raw', evaluate());
    }
    set('cmi.core.lesson_status', quiz.scored ? (evaluate() >= quiz.passingScore ? 'passed' : 'failed') : 'completed');
  }
  function showResult() {
    document.getElementById('result').textContent = quiz.scored ? 'Resultado: ' + evaluate() + '/100 · ' + (evaluate() >= quiz.passingScore ? 'Aprobado' : 'No aprobado') : 'Actividad completada.';
    quiz.questions.forEach((q,i) => {
      const feedback = document.getElementById('feedback-' + i);
      feedback.hidden = false;
      feedback.textContent = (answers[i] === q.answer ? 'Correcto. ' : 'Respuesta correcta: ' + q.options[q.answer] + '. ') + 'Texto de referencia: ' + q.evidence;
    });
    form.querySelectorAll('input,button').forEach(el => el.disabled = true);
  }
  api = find(window);
  if (!api) { try { api = find(window.opener); } catch {} }
  if (api) active = ok(call('LMSInitialize', ''));
  status.textContent = active ? 'Conectado al LMS · SCORM 1.2' : api ? 'No se pudo iniciar la sesión SCORM. Las respuestas no se guardarán.' : 'Vista previa local · Sin conexión ni guardado en Moodle';
  if (active) {
    try {
      const restored = JSON.parse(call('LMSGetValue', 'cmi.suspend_data') || 'null');
      if (restored && restored.v === 1 && Array.isArray(restored.a) && restored.a.length === answers.length && restored.a.every(a => a === null || (Number.isInteger(a) && a>=0 && a<4))) {
        answers = restored.a; done = restored.done === true && answers.every(a => a !== null);
      }
    } catch {}
    const previous = call('LMSGetValue','cmi.core.lesson_status');
    if (previous === 'not attempted' || previous === '' || previous === 'browsed') set('cmi.core.lesson_status','incomplete');
  }
  document.getElementById('title').textContent = quiz.title;
  document.getElementById('source').textContent = 'Documento: ' + quiz.sourceName;
  document.getElementById('instructions').textContent = quiz.scored ? 'Selecciona una respuesta en cada pregunta. Aprobación: 70/100. Un envío por intento; el docente configura nuevos intentos en Moodle.' : 'Selecciona una respuesta en cada pregunta. Al enviar se registra la finalización sin nota.';
  const progress = document.getElementById('progress');
  progress.max = quiz.questions.length;
  function updateProgress() { progress.value = answers.filter(a => a !== null).length; }
  quiz.questions.forEach((q,i) => {
    const field = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = (i+1) + '. ' + q.prompt; field.append(legend);
    q.options.forEach((option,j) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio'; input.name = q.id; input.value = String(j); input.required = true; input.checked = answers[i] === j;
      input.addEventListener('change', () => { answers[i] = j; updateProgress(); persist(); });
      label.append(input, document.createTextNode(option)); field.append(label);
    });
    const feedback = document.createElement('p'); feedback.id = 'feedback-' + i; feedback.className = 'feedback'; feedback.hidden = true; field.append(feedback);
    form.append(field);
  });
  const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = 'Enviar respuestas'; form.append(submit);
  form.addEventListener('submit', event => {
    event.preventDefault(); if (done || ended || answers.some(a => a === null)) return;
    done = true; showResult(); reportResult(); persist(); document.getElementById('result').focus();
  });
  updateProgress(); if (done) showResult();
  function finish() {
    if (ended) return;
    if (active) {
      if (done) reportResult();
      persist();
      const elapsed = Math.min(35999999, Math.floor((Date.now()-started)/1000));
      const time = String(Math.floor(elapsed/3600)).padStart(4,'0') + ':' + String(Math.floor(elapsed%3600/60)).padStart(2,'0') + ':' + String(elapsed%60).padStart(2,'0');
      set('cmi.core.session_time',time); commit();
      const finished = ok(call('LMSFinish','')); active = false;
      status.textContent = finished ? 'Sesión cerrada. Puedes volver al curso.' : 'El LMS no confirmó el cierre de la sesión.';
    }
    ended = true; form.querySelectorAll('input,button').forEach(el => el.disabled = true);
    document.getElementById('finish').disabled = true;
  }
  document.getElementById('finish').addEventListener('click',finish);
  window.addEventListener('pagehide',finish);
})();`;
