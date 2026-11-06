import {studioQuizSchema,type StudioQuiz} from "./schema";
import {QuizQualityValidator} from "./quiz-quality";
import {cognitiveDecisions} from "./cognitive-normalization";

/** No inference and no content invention: ground/structure -> normalize -> options -> quiz. */
export function compilePedagogicalQuiz(input:StudioQuiz){
  const validator=new QuizQualityValidator(),before=validator.evaluate(input),parsed=studioQuizSchema.safeParse(input);
  if(!parsed.success)return {quiz:input,quality:before};
  const decisions=cognitiveDecisions(parsed.data);
  const quiz:StudioQuiz={...parsed.data,questions:parsed.data.questions.map(q=>{
    if(before.questions.find(item=>item.id===q.id)?.status==="BLOCKING")return q;
    const d=decisions.find(item=>item.questionId===q.id)!;
    return {...q,requestedCognitiveLevel:d.requested,actualCognitiveLevel:d.actual,cognitiveLevel:d.downgraded?d.actual:q.cognitiveLevel};
  })};
  return {quiz,quality:validator.evaluate(quiz)};
}
