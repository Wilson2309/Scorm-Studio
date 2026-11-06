/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const {normalizeDocument}=require('../src/lib/content/normalize.ts');
const {prepareTimeline}=require('../src/lib/activities/timeline-detection.ts');
const {pdfBytes}=require('./pdf-fixture.cjs');
const chronological='EVOLUCION DEL SISTEMA\nEn 2001 el equipo identifico los requisitos mediante entrevistas y documento las necesidades de los usuarios.\nEn 2005 el equipo construyo un prototipo para contrastar los requisitos con las tareas de los usuarios.\nEn 2010 el equipo verifico el funcionamiento del sistema mediante pruebas de aceptacion documentadas.';
const process='PROCEDIMIENTO DE VALIDACION\nPaso 1: Identificar los requisitos mediante entrevistas y documentar las necesidades de los usuarios.\nPaso 2: Construir un prototipo para contrastar los requisitos con las tareas de los usuarios.\nPaso 3: Verificar el funcionamiento del sistema mediante pruebas de aceptacion documentadas.';
const insufficient='CARACTERISTICAS DEL SISTEMA\nLas ventajas incluyen claridad, facilidad de uso y mantenimiento. Estas propiedades no representan fases ni acontecimientos fechados.\nLa arquitectura del sistema es una estructura de componentes que define responsabilidades para facilitar las tareas del equipo.';
const id='33333333-3333-4333-8333-333333333333';
function extracted(text=chronological){return {name:'Timeline-sintetica.pdf',pages:1,text,pageTexts:[{page:1,text}],warnings:[]};}
function fixture(text=chronological){const document=normalizeDocument(extracted(text)),spec=prepareTimeline(document.fragments,document.documentId,id,'Recorrido de validacion');return {document,spec};}
function file(text=chronological){return new File([pdfBytes(text)],'Timeline-sintetica.pdf',{type:'application/pdf'});}
module.exports={chronological,process,insufficient,extracted,fixture,file,id};
