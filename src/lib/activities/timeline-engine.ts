export type TimelineModel={fingerprint:string;mode:"EXPLORATORY"|"ORDERING"|"IDENTIFICATION";count:number;constraints:{before:number;after:number}[];requireAll:boolean;allowBack:boolean;retry:boolean;maxAttempts:number;passingScore:number};
export type TimelineProgress={v:1;f:string;p:"intro"|"explore"|"exercise"|"feedback"|"results";i:number;u:boolean[];o:number[];a:number[];t:number;score:number|null};
/** Pure learner state machine. Shared by tests and the generated portable runtime. */
export function createTimelineEngine(model:TimelineModel){
 const n=model.count,sequence=()=>Array.from({length:n},(_,i)=>i),permutation=(a:unknown):a is number[]=>Array.isArray(a)&&a.length===n&&new Set(a).size===n&&a.every(i=>Number.isInteger(i)&&i>=0&&i<n);
 const initial=():TimelineProgress=>({v:1,f:model.fingerprint,p:"intro",i:0,u:Array(n).fill(false),o:sequence().reverse(),a:Array(n).fill(-1),t:0,score:null});
 function start(s:TimelineProgress){if(s.p!=="intro")return false;s.p="explore";s.u[0]=true;return true;}
 function visit(s:TimelineProgress,i:number){if(s.p!=="explore"||!Number.isInteger(i)||i<0||i>=n||!model.allowBack&&i<s.i||model.requireAll&&!s.u[i]&&i>s.i+1)return false;s.i=i;s.u[i]=true;return true;}
 const canFinish=(s:TimelineProgress)=>!model.requireAll||s.u.every(Boolean);
 function finishExploration(s:TimelineProgress){if(s.p!=="explore"||!canFinish(s))return false;s.p=model.mode==="EXPLORATORY"?"results":"exercise";return true;}
 function move(s:TimelineProgress,from:number,to:number){if(s.p!=="exercise"||model.mode!=="ORDERING"||!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=n||to>=n)return false;const [item]=s.o.splice(from,1);s.o.splice(to,0,item);return true;}
 function identify(s:TimelineProgress,prompt:number,answer:number){if(s.p!=="exercise"||model.mode!=="IDENTIFICATION"||!Number.isInteger(prompt)||prompt<0||prompt>=n||!Number.isInteger(answer)||answer<0||answer>=n)return false;s.a[prompt]=answer;return true;}
 function calculate(s:TimelineProgress){if(model.mode==="EXPLORATORY")return null;if(model.mode==="IDENTIFICATION")return Math.round(100*s.a.filter((a,i)=>a===i).length/n);if(!model.constraints.length)return null;return Math.round(100*model.constraints.filter(c=>s.o.indexOf(c.before)<s.o.indexOf(c.after)).length/model.constraints.length);}
 function submit(s:TimelineProgress){if(s.p!=="exercise"||s.t>=model.maxAttempts||model.mode==="IDENTIFICATION"&&s.a.some(a=>a<0))return false;s.t++;s.score=calculate(s);s.p="feedback";return true;}
 const canRetry=(s:TimelineProgress)=>model.retry&&s.p==="feedback"&&s.t<model.maxAttempts&&(s.score??0)<100;
 function retry(s:TimelineProgress){if(!canRetry(s))return false;s.p="exercise";return true;}
 function complete(s:TimelineProgress){if(s.p!=="feedback")return false;s.p="results";return true;}
 function serialize(s:TimelineProgress){const text=JSON.stringify(s);if(text.length>4096)throw Error("No es posible guardar este recorrido dentro del límite SCORM 1.2.");return text;}
 function restore(text:string):TimelineProgress|null{
  if(text.length>4096)return null;
  let s:TimelineProgress;try{s=JSON.parse(text);}catch{return null;}
  if(!s||s.v!==1||s.f!==model.fingerprint||!["intro","explore","exercise","feedback","results"].includes(s.p)||!Number.isInteger(s.i)||s.i<0||s.i>=n||!Array.isArray(s.u)||s.u.length!==n||s.u.some(v=>typeof v!=="boolean")||!permutation(s.o)||!Array.isArray(s.a)||s.a.length!==n||s.a.some(a=>!Number.isInteger(a)||a< -1||a>=n)||!Number.isInteger(s.t)||s.t<0||s.t>model.maxAttempts)return null;
  if(model.mode==="EXPLORATORY"&&["exercise","feedback"].includes(s.p)||s.p==="exercise"&&s.t>=model.maxAttempts||["intro","explore"].includes(s.p)&&s.t!==0)return null;
  if((s.p==="feedback"||s.p==="results")&&model.mode!=="EXPLORATORY"){if(s.t<1||model.mode==="IDENTIFICATION"&&s.a.some(a=>a<0))return null;s.score=calculate(s);}else s.score=null;
  if(["exercise","feedback","results"].includes(s.p)&&!canFinish(s))return null;
  return s;
 }
 return {initial,start,visit,finishExploration,canFinish,move,identify,submit,canRetry,retry,complete,serialize,restore};
}
