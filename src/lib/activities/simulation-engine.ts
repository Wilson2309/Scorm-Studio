export type SimulationModel={start:number;scored:boolean;passingScore:number;maxSteps:number;allowRetry:boolean;maxAttempts:number;scenes:{kind:"DECISION"|"CONSEQUENCE"|"ENDING";choices:{next:number;points:number}[]}[]};
export type SimulationProgress={v:1;f:string;started:boolean;path:number[];feedback:boolean;attempt:number};
/** Replay compact actions; grade is derived, never trusted from persisted score. */
export function createSimulationEngine(model:SimulationModel,fingerprint:string){
 const initial=():SimulationProgress=>({v:1,f:fingerprint,started:false,path:[],feedback:false,attempt:1});
 function inspect(s:SimulationProgress){let current=model.start,earned=0,available=0;const visited:number[]=[current],graded=new Set<number>();let previous=current;
  for(let i=0;i<s.path.length;i++){const scene=model.scenes[current],choice=scene?.choices[s.path[i]];if(!choice||scene.kind==="ENDING")throw Error("Recorrido incompatible.");if(scene.kind==="DECISION"&&!graded.has(current)){graded.add(current);earned+=choice.points;available+=Math.max(...scene.choices.map(c=>c.points));}previous=current;current=choice.next;visited.push(current);}
  const terminal=model.scenes[current]?.kind==="ENDING",limited=!terminal&&s.path.length>=model.maxSteps,score=model.scored&&available>0?Math.round(100*earned/available):null;
  return {current:s.feedback?previous:current,next:current,visited,terminal:terminal&&!s.feedback,limited:limited&&!s.feedback,score,earned,available,decisions:graded.size};
 }
 function start(s:SimulationProgress){if(s.started)return false;s.started=true;return true;}
 function choose(s:SimulationProgress,index:number){const v=inspect(s);if(!s.started||s.feedback||v.terminal||v.limited||!Number.isInteger(index)||!model.scenes[v.current]?.choices[index])return false;s.path.push(index);s.feedback=true;return true;}
 function next(s:SimulationProgress){if(!s.feedback)return false;s.feedback=false;return true;}
 function retry(s:SimulationProgress){const v=inspect(s);if(!model.allowRetry||(!v.terminal&&!v.limited)||s.feedback||s.attempt>=model.maxAttempts)return false;const attempt=s.attempt+1;Object.assign(s,initial(),{started:true,attempt});return true;}
 function serialize(s:SimulationProgress){const text=JSON.stringify(s);if(text.length>4096)throw Error("El recorrido supera el límite de reanudación SCORM 1.2.");return text;}
 function restore(text:string):SimulationProgress|null{try{if(text.length>4096)return null;const s=JSON.parse(text);if(!s||s.v!==1||s.f!==fingerprint||typeof s.started!=="boolean"||typeof s.feedback!=="boolean"||!Array.isArray(s.path)||s.path.length>model.maxSteps||s.path.some((n:unknown)=>!Number.isInteger(n))||!Number.isInteger(s.attempt)||s.attempt<1||s.attempt>model.maxAttempts||!s.started&&(s.path.length||s.feedback)||s.feedback&&!s.path.length)return null;inspect(s);return {v:1,f:fingerprint,started:s.started,path:s.path,feedback:s.feedback,attempt:s.attempt};}catch{return null;}}
 return {initial,inspect,start,choose,next,retry,serialize,restore};
}
