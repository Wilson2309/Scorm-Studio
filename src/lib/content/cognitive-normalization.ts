import type {EducationalQuestion,StudioQuiz} from "./schema";
import {cognitiveSignals} from "./quality-heuristics";
export type CognitiveLevel=EducationalQuestion["cognitiveLevel"];
export type CognitiveDecision={questionId:string;requested:CognitiveLevel;actual:CognitiveLevel;downgraded:boolean;conflict:boolean;needsScenario:boolean};
/** Conservative, one-step downgrades only. Preserve at least one task at each planned level. */
export function cognitiveDecisions(quiz:StudioQuiz):CognitiveDecision[]{
  const remaining=new Map<CognitiveLevel,number>();
  quiz.blueprint.slots.forEach(s=>remaining.set(s.cognitiveLevel,(remaining.get(s.cognitiveLevel)??0)+1));
  const decisions:CognitiveDecision[]=[];
  for(const q of quiz.questions){
    const slot=quiz.blueprint.slots.find(s=>s.questionId===q.id),requested=slot?.cognitiveLevel??q.cognitiveLevel;
    const signals=cognitiveSignals(q.stem);
    // Only a positive signature establishes a lower task, not the absence of keywords.
    const actual:CognitiveLevel=signals.recognition&&!signals.scenario?"remember":signals.scenario&&signals.reasoning?"analysis":signals.scenario&&signals.action?"application":signals.interpretation&&!signals.scenario?"comprehension":requested;
    const candidate=requested==="analysis"&&actual==="application"||requested==="application"&&actual==="comprehension";
    const duplicate=quiz.questions.some(other=>other.id!==q.id&&other.concept===q.concept&&(decisions.find(d=>d.questionId===other.id)?.actual??other.cognitiveLevel)===actual);
    const preservesActualCoverage=quiz.questions.some(other=>{
      if(other.id===q.id||quiz.blueprint.slots.find(s=>s.questionId===other.id)?.cognitiveLevel!==requested)return false;
      const task=cognitiveSignals(other.stem);
      return requested==="analysis"?task.scenario&&task.reasoning:task.scenario&&task.action;
    });
    const conflict=candidate&&((remaining.get(requested)??0)<=1||duplicate||!preservesActualCoverage);
    const downgraded=candidate&&!conflict;
    if(downgraded){remaining.set(requested,(remaining.get(requested)??0)-1);remaining.set(actual,(remaining.get(actual)??0)+1);}
    // Never upgrade. A stronger-looking task is only a teacher review hint.
    const rank={remember:0,comprehension:1,application:2,analysis:3};
    decisions.push({questionId:q.id,requested,actual:rank[actual]<=rank[requested]?actual:requested,downgraded,conflict,needsScenario:(requested==="analysis"||requested==="application")&&(!signals.scenario||requested==="analysis"&&!signals.reasoning)});
  }
  return decisions;
}
