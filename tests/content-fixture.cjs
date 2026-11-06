/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const {normalizeDocument}=require('../src/lib/content/normalize.ts');
const {createBlueprint}=require('../src/lib/content/blueprint.ts');
const text=[
  'UNIVERSIDAD SINTÉTICA DE PRUEBA',
  'Docente: profesora de ejemplo',
  'Duración: 40 horas',
  'La fotosíntesis transforma la energía solar en nutrientes que sostienen a los organismos vegetales.',
  'Las mitocondrias producen energía mediante procesos de respiración celular para sostener las funciones de la célula.',
  'La biodiversidad representa la variedad de especies presentes y favorece la estabilidad de los ecosistemas.',
].join('\n');
const extracted={name:'biologia.pdf',pages:1,text,pageTexts:[{page:1,text}],warnings:[]};
const document=normalizeDocument(extracted);
const refs=document.fragments.map(f=>({fragmentId:f.id,page:f.page,quote:f.text}));
const item=(id,text,i)=>({id,text,sourceFragmentIds:[refs[i].fragmentId],sourceReferences:[refs[i]]});
const analysis={documentId:document.documentId,sourceFragmentIds:refs.map(r=>r.fragmentId),title:'Energía y diversidad en los sistemas vivos',subject:'Biología',unit:'Procesos vitales',summary:'El contenido relaciona la fotosíntesis, la respiración celular y la diversidad de especies con el funcionamiento de los sistemas vivos.',learningObjectives:[item('o1','Comprender cómo las plantas obtienen nutrientes.',0),item('o2','Aplicar la función energética de las mitocondrias.',1),item('o3','Relacionar diversidad y estabilidad de ecosistemas.',2)],keyConcepts:[item('c1','Fotosíntesis',0),item('c2','Respiración celular',1),item('c3','Biodiversidad',2)],sections:[item('s1','Procesos biológicos y ecosistemas',0)],importantFacts:[item('f1','La fotosíntesis usa energía solar.',0)],relationships:[item('r1','La diversidad favorece estabilidad.',2)],excludedAdministrativeContent:[],sourceReferences:refs};
const blueprint=createBlueprint(analysis,3);
const stems=[
  '¿Cómo contribuye la energía solar a la obtención de nutrientes en una planta?',
  'Una célula necesita sostener sus funciones. ¿Qué papel cumplen sus mitocondrias según el proceso explicado?',
  'Al comparar ecosistemas con distinta variedad de especies, ¿qué relación permite establecer el contenido?',
];
const options=[
  ['La fotosíntesis transforma energía solar en nutrientes.','La respiración convierte nutrientes en diversidad de especies.','La biodiversidad almacena energía en las mitocondrias.','La estabilidad transforma especies en energía solar.'],
  ['Las mitocondrias producen energía mediante respiración celular.','Las mitocondrias convierten luz solar en nuevas especies.','Las mitocondrias regulan la diversidad de los ecosistemas.','Las mitocondrias almacenan las especies de un ecosistema.'],
  ['La biodiversidad favorece la estabilidad de los ecosistemas.','La biodiversidad sustituye la respiración de cada célula.','La biodiversidad transforma energía solar en mitocondrias.','La biodiversidad elimina la necesidad de nutrientes.'],
];
const quiz={version:2,generator:'content-intelligence-v1',title:'Procesos y sistemas vivos',description:analysis.summary,sourceName:extracted.name,scored:true,passingScore:70,analysis,blueprint,sources:document.fragments,questions:stems.map((stem,i)=>({documentId:document.documentId,sourceFragmentIds:[refs[i].fragmentId],id:`q${i+1}`,stem,options:options[i].map((text,j)=>({id:['a','b','c','d'][j],text})),correctOptionId:'a',explanation:'La respuesta se fundamenta en el proceso descrito: '+refs[i].quote,concept:`c${i+1}`,learningObjective:`o${i+1}`,difficulty:blueprint.slots[i].difficulty,cognitiveLevel:blueprint.slots[i].cognitiveLevel,sourceReferences:[refs[i]]}))};
const wire=value=>JSON.parse(JSON.stringify(value,(key,v)=>['sourceReferences','documentId'].includes(key)?undefined:v));
module.exports={document,analysis,blueprint,quiz,extracted,wire};
