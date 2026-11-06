/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const {file,extracted}=require('./timeline-fixture.cjs'),{normalizeDocument}=require('../src/lib/content/normalize.ts'),{prepareSimulation}=require('../src/lib/activities/simulation-detection.ts');
const policy='PROTOCOLO DE VALIDACION\nLa validacion es la comprobacion de los criterios documentados antes de aceptar una solicitud o una entrega. La evidencia permite justificar cada decision del procedimiento.\nSi la evidencia de la solicitud esta completa, entonces registrar la solicitud validada; de lo contrario solicitar la evidencia faltante.\nSi el prototipo cumple los criterios acordados, entonces aprobar la entrega documentada; de lo contrario solicitar la correccion del prototipo.';
function fixture(){const document=normalizeDocument(extracted(policy)),spec=prepareSimulation(document.fragments,document.documentId,'44444444-4444-4444-8444-444444444444','Decisiones para una entrega fundamentada');return {document,spec};}
module.exports={policy,fixture,file:()=>file(policy)};
