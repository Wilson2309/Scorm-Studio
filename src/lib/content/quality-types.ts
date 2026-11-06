export type QualitySeverity="PASS"|"WARNING"|"BLOCKING";
export type QualityDimension="structure"|"grounding"|"coverage"|"cognition"|"distractors"|"diversity";
export type QualityIssue={questionId:string|null;relatedQuestionIds?:string[];code:string;title:string;message:string;severity:QualitySeverity|"INFO";dimension:QualityDimension};
export type QuizQualityResult={valid:boolean;validCount:number;status:QualitySeverity;score:number;scoreMeaning:"engineering-heuristic";issues:QualityIssue[];blockingCount:number;warningCount:number;infoCount:number;passCount:number;warningQuestionCount:number;blockingQuestionCount:number;
  coverage:{conceptsAvailable:number;conceptsUsed:number;sourceCounts:Record<string,number>;declaredCognitiveCounts:Record<string,number>;suggestedCognitiveCounts:Record<string,number>;difficultyCounts:Record<string,number>};
  dimensions:Record<QualityDimension,{status:QualitySeverity;score:number|null;evaluated:boolean}>;
  questions:{id:string;status:QualitySeverity;inferredCognitiveLevel:string;issues:QualityIssue[]}[];
};
