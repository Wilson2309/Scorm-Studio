import "server-only";
import {studioQuizSchema,type StudioQuiz,type BlueprintSlot} from "./schema";
import {hybridPreparedSchema,type HybridPrepared} from "./hybrid-schema";
import {buildHybridPlan} from "./hybrid-plan";
import {buildLeanHybridContext,assertCompiledAnswers} from "./lean-question-compiler";
import {assertAnalysisGrounded} from "./grounding-validation";
import {compilePedagogicalQuiz} from "./pedagogical-compiler";
import {questionMatchesSlot,summarizeBlueprint} from "./blueprint";
import {IntelligenceError,type ContentIntelligenceProvider,type ExistingQuestionSummary} from "./provider-contract";
import {quizConfigSchema} from "../quiz/schema";
export async function generateHybridQuiz(input:HybridPrepared,config:unknown,provider:ContentIntelligenceProvider):Promise<StudioQuiz>{
 const prepared=hybridPreparedSchema.parse(input),settings=quizConfigSchema.parse(config);
 assertAnalysisGrounded(prepared.analysis,prepared.document.fragments);
 const plan=buildHybridPlan(prepared,settings.count,settings.coverageMode),context=buildLeanHybridContext(prepared,plan);
 const questions=await provider.generateQuiz(context);
 if(questions.length!==plan.blueprint.slots.length)throw new IntelligenceError("El borrador no respeta la cantidad de preguntas solicitada. No se ha aceptado contenido.");
 assertCompiledAnswers(questions,context);
 const quiz=studioQuizSchema.parse({version:2,generator:"content-intelligence-v1",title:settings.title,description:prepared.analysis.summary,sourceName:prepared.document.name,scored:settings.scored,passingScore:70,questions,analysis:prepared.analysis,blueprint:context.blueprint,sources:prepared.document.fragments});
 return compilePedagogicalQuiz(quiz).quiz;
}
export async function regenerateHybridQuestion(prepared:HybridPrepared,slot:BlueprintSlot,existing:ExistingQuestionSummary[],provider:ContentIntelligenceProvider){
 assertAnalysisGrounded(prepared.analysis,prepared.document.fragments);
 if(slot.targetConcept!==prepared.analysis.keyConcepts.find(c=>c.id===slot.conceptId)?.text)throw new IntelligenceError("La asignación no corresponde al concepto del documento.");
 const assigned={...slot,slotId:slot.slotId??slot.questionId,questionFamily:slot.questionFamily??(slot.cognitiveLevel==="application"?"short_scenario":slot.cognitiveLevel==="analysis"?"comparison":"distinction") as NonNullable<BlueprintSlot["questionFamily"]>};
 const context=buildLeanHybridContext(prepared,{blueprint:summarizeBlueprint([assigned]),selectedConceptIds:[slot.conceptId]});
 context.existingQuestions=existing.filter(q=>q.id!==slot.questionId).map(q=>({...q,stem:q.stem.slice(0,160),conceptLabel:q.conceptLabel.slice(0,100)}));const question=await provider.regenerateQuestion(context);
 assertCompiledAnswers([question],context);
 if(!questionMatchesSlot(question,slot))throw new IntelligenceError("La nueva pregunta cambió el concepto, familia, nivel o fuentes asignados. Se conserva el borrador anterior.");
 if(context.existingQuestions.some(q=>q.concept===question.concept&&q.sourceFragmentIds.some(id=>question.sourceFragmentIds.includes(id))))throw new IntelligenceError("La nueva pregunta repite un concepto y fuente ya utilizados.");
 return {question};
}
