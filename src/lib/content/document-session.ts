import type { ExtractedDocument } from "../quiz/schema";
import type { DocumentAnalysis, NormalizedDocument,StudioQuiz } from "./schema";
import type {HybridPrepared,HybridPlan} from "./hybrid-schema";
import {buildHybridPlan} from "./hybrid-plan";

export type UnderstandingResult = {document: NormalizedDocument; analysis: DocumentAnalysis;prepared?:HybridPrepared};

/** One in-memory session per selected document, owned above route templates.
 * No effect, constructor or cache lookup ever starts a network request. */
export class DocumentSession {
  constructor(readonly id = 0) {}
  extracted: ExtractedDocument | null = null;
  understanding: UnderstandingResult | null = null;
  quiz:StudioQuiz|null=null;
  quizConfigKey:string|null=null;
  quizOrigin:"ai"|"manual"="ai";
  activityChoice:"QUIZ"|"ROULETTE"|"TIMELINE"|"SIMULATION"="QUIZ";
  setActivityChoice(choice:"QUIZ"|"ROULETTE"|"TIMELINE"|"SIMULATION"){this.activityChoice=choice;}
  setOrigin(origin:"ai"|"manual"){this.quizOrigin=origin;}
  private plans=new Map<string,HybridPlan>();
  cacheQuiz(quiz:StudioQuiz){if(this.quiz&&this.quiz.questions.length!==quiz.questions.length)this.quizConfigKey=null;this.quiz=quiz;}
  rememberGenerated(key:string){this.quizConfigKey=key;}
  getPlan(count:number,mode:"breadth"|"depth"="breadth"){
    if(!this.understanding?.prepared)throw new Error("Prepara primero el contenido.");
    const key=`${count}:${mode}`,existing=this.plans.get(key);if(existing)return existing;
    const plan=buildHybridPlan(this.understanding.prepared,count,mode);this.plans.set(key,plan);return plan;
  }
  private pending: Promise<UnderstandingResult> | null = null;
  private controller: AbortController | null = null;

  understand(worker: (signal: AbortSignal) => Promise<UnderstandingResult>) {
    if (this.understanding) return Promise.resolve(this.understanding);
    if (this.pending) return this.pending;
    const controller = new AbortController();
    this.controller = controller;
    // Install the promise before running the worker, including synchronous throws.
    const pending = Promise.resolve().then(() => worker(controller.signal)).then(result => {
      if (controller.signal.aborted) throw new DOMException("Solicitud cancelada", "AbortError");
      this.understanding = result;
      return result;
    }).finally(() => {
      if (this.pending === pending) { this.pending = null; this.controller = null; }
    });
    this.pending = pending;
    return pending;
  }
  cancel() { this.controller?.abort(); }
}

/** Synchronous lock: React's next render is too late to guard rapid double clicks. */
export class OperationGate {
  private active = false;
  enter() { if (this.active) return false; this.active = true; return true; }
  leave() { this.active = false; }
}
