import type { DocumentAnalysis, EducationalQuestion, QuizBlueprint, SourceFragment } from "./schema";
import type { ProviderDiagnostic } from "./provider-diagnostics";
import type {analysisForModel} from "./grounding";
import type {ConstructionGuide} from "./question-builder";
import type {HybridCandidate,HybridRelation} from "./hybrid-schema";
import type {LeanContext} from "./lean-question-compiler";
import type {TimelineWordingInput,TimelineWording} from "../activities/timeline-wording";
import type {SimulationCasePlan,SimulationCaseWording} from "../activities/simulation-planning";

export class IntelligenceError extends Error {
  constructor(message:string,public status=422,public diagnostic?:ProviderDiagnostic){super(message);}
}
export type AnalysisInput={fragments:SourceFragment[];chunkAnalyses?:DocumentAnalysis[]};
export type ExistingQuestionSummary={id:string;concept:string;conceptLabel:string;stem:string;cognitiveLevel:EducationalQuestion["cognitiveLevel"];sourceFragmentIds:string[]};
export type QuestionInput={analysis:ReturnType<typeof analysisForModel>;blueprint:QuizBlueprint;sources:SourceFragment[];avoidStems:string[];existingQuestions?:ExistingQuestionSummary[];nearbyConcepts?:{id:string;text:string}[];constructionGuides?:ConstructionGuide[];singleInference?:true;leanContext?:LeanContext;hybridContext?:{slots:Record<string,unknown>[];concepts:Pick<HybridCandidate,"id"|"name"|"type"|"sourceFragmentIds">[];relations:Pick<HybridRelation,"subject"|"predicate"|"object"|"sourceFragmentIds">[]}};
export interface ContentIntelligenceProvider {
  generateSimulationCase?(input:SimulationCasePlan):Promise<SimulationCaseWording>;
  rewriteTimelineEvent?(input:TimelineWordingInput):Promise<TimelineWording>;
  analyzeDocument(input:AnalysisInput):Promise<DocumentAnalysis>;
  generateQuiz(input:QuestionInput):Promise<EducationalQuestion[]>;
  regenerateQuestion(input:QuestionInput):Promise<EducationalQuestion>;
}
