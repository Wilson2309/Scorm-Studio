/* eslint-disable @typescript-eslint/no-require-imports */
// Synthetic acceptance material only. Never reads a private PDF or invokes a provider.
require('./register.cjs');
const {pdfBytes}=require('./pdf-fixture.cjs');
const {buildHybridPlan}=require('../src/lib/content/hybrid-plan.ts');
const {buildLeanHybridContext,assembleLeanQuestions}=require('../src/lib/content/lean-question-compiler.ts');
const {studioQuizSchema}=require('../src/lib/content/schema.ts');
const {compilePedagogicalQuiz}=require('../src/lib/content/pedagogical-compiler.ts');
const text=[
 'La fotosintesis transforma la energia solar en nutrientes que sostienen a los organismos vegetales.',
 'Las mitocondrias producen energia mediante procesos de respiracion celular para sostener las funciones de la celula.',
 'La biodiversidad representa la variedad de especies presentes y favorece la estabilidad de los ecosistemas.',
].join('\n');
function syntheticPDF(){return new File([pdfBytes(text)],'qa-temporal-biologia.pdf',{type:'application/pdf'});}
function syntheticQuiz(prepared,marker){
 const plan=buildHybridPlan(prepared,3),context=buildLeanHybridContext(prepared,plan);
 const questions=assembleLeanQuestions({questions:context.leanContext.slots.map(s=>({slotId:s.slot.slotId,stem:`¿Cómo se interpreta la función descrita en esta evidencia: ${s.canonicalEvidence.slice(0,100)}?`,explanation:`La fuente vincula ${s.correctAnswer.text} con la función descrita en la situación.`}))},context);
 const quiz=studioQuizSchema.parse({version:2,generator:'content-intelligence-v1',title:'QA temporal 03.4 '+marker,description:'Material sintetico privado '+marker,sourceName:prepared.document.name,scored:true,passingScore:70,analysis:prepared.analysis,blueprint:context.blueprint,sources:prepared.document.fragments,questions});
 return compilePedagogicalQuiz(quiz).quiz;
}
module.exports={syntheticPDF,syntheticQuiz};
