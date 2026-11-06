import type {StudioQuiz} from "./schema";
import {QuizQualityValidator} from "./quiz-quality";
import {describeSlot,summarizeBlueprint} from "./blueprint";
export {assertAnalysisGrounded,referenceProblem} from "./grounding-validation";
export {isAdministrativeQuestion} from "./quality-heuristics";
export {QuizQualityValidator} from "./quiz-quality";
export type {QualityIssue,QuizQualityResult,QualitySeverity} from "./quality-types";
const validator=new QuizQualityValidator();
export function validateQuiz(input:unknown){return validator.evaluate(input);}
export function generationState(quiz:unknown,busy=false){
  const quality=validateQuiz(quiz),first=quality.issues.find(i=>i.severity==="BLOCKING");
  return {enabled:quality.valid&&!busy,reason:busy?"Preparando el paquete...":first?`Resuelve ${quality.blockingCount} ${quality.blockingCount===1?"bloqueo":"bloqueos"} antes de generar. ${first.message}`:quality.warningCount?`Quedan ${quality.warningCount} recomendaciones. Puedes revisarlas o continuar.`:"Respuestas, fuentes y plan completos. Puedes generar SCORM.",...quality};
}
// Model responses never redefine the assigned targets. Add/delete only affects
// membership; explicit teacher target edits use reviseTeacherQuestion instead.
export function syncBlueprint(quiz:StudioQuiz):StudioQuiz{
  const slots=quiz.questions.map((q,index)=>{
    const existing=quiz.blueprint.slots.find(s=>s.questionId===q.id);
    return existing?{...existing,slot:index+1}:describeSlot(quiz.analysis,{conceptId:q.concept,objectiveId:q.learningObjective,difficulty:q.difficulty,cognitiveLevel:q.cognitiveLevel},q.id,index);
  });
  return {...quiz,blueprint:summarizeBlueprint(slots,quiz.blueprint.coverageMode)};
}
