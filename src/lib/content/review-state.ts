import {validateQuiz} from "./quality";
export type ReviewLifecycle="AI_DRAFT"|"NEEDS_REVIEW"|"READY"|"SCORM_GENERATED";
export function reviewSummary(quiz:unknown,generated=false,reviewOpen=true){
  const quality=validateQuiz(quiz);
  const lifecycle:ReviewLifecycle=!reviewOpen?"AI_DRAFT":!quality.valid?"NEEDS_REVIEW":generated?"SCORM_GENERATED":"READY";
  return {quality,lifecycle,readyQuestions:quality.validCount,blockingQuestions:quality.blockingQuestionCount,
    label:lifecycle==="SCORM_GENERATED"?"Paquete listo":quality.valid?"Listo para generar":"No está listo"};
}
/** Editing or replacing content invalidates every artifact from an older revision. */
export class ReviewRevision {
  private revision=0;
  invalidate(){return ++this.revision;}
  capture(){return this.revision;}
  isCurrent(revision:number){return revision===this.revision;}
}
