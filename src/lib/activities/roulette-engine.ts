export type RouletteModel={fingerprint:string;settings:{attempts:number;timeLimitSeconds:number;pointsPerCorrect:number;repeatSegments:boolean;completion:"all"|"draws";drawCount:number};segments:{id:string;questionId:string}[];questions:{id:string;correctOptionId:string;options:{id:string}[]}[]};
export type RouletteProgress={v:1;f:string;s:number;p:"intro"|"wheel"|"spinning"|"challenge"|"feedback"|"results";x:number;r:number;a:number[];t:number[];c:boolean[];u:boolean[];d:number;timeout:boolean;practice:boolean};
/** Self-contained for serialization into the portable runtime. No imports or network calls. */
export function createRouletteEngine(model:RouletteModel){
 const n=model.segments.length,settings=model.settings;
 const question=(i:number)=>model.questions.find(q=>q.id===model.segments[i].questionId)!;
 const initial=(seed=Date.now()>>>0):RouletteProgress=>({v:1,f:model.fingerprint,s:seed>>>0,p:"intro",x:-1,r:0,a:Array(n).fill(-1),t:Array(n).fill(0),c:Array(n).fill(false),u:Array(n).fill(false),d:0,timeout:false,practice:false});
 const complete=(v:RouletteProgress)=>settings.completion==="all"?v.u.every(Boolean):v.r>=settings.drawCount;
 function spin(v:RouletteProgress){
  if(v.p!=="wheel"||complete(v))return false;
  let pool=model.segments.map((_,i)=>i).filter(i=>!v.u[i]);
  // Every concept is encountered before optional practice repetitions. Repeats never award points.
  if(!pool.length&&settings.repeatSegments)pool=model.segments.map((_,i)=>i);
  if(!pool.length){v.p="results";return false;}
  v.s=(Math.imul(v.s,1664525)+1013904223)>>>0;v.x=pool[v.s%pool.length];v.practice=v.u[v.x];v.timeout=false;v.d=0;v.p="spinning";return true;
 }
 function begin(v:RouletteProgress,now:number){if(v.p!=="spinning")return;v.p="challenge";v.d=settings.timeLimitSeconds?now+settings.timeLimitSeconds*1000:0;}
 function answer(v:RouletteProgress,option:number,now:number){
  if(v.p!=="challenge")return false;
  const q=question(v.x),expired=v.d>0&&now>=v.d;if(!expired&&(!Number.isInteger(option)||option<0||option>=q.options.length))return false;
  v.timeout=expired;v.a[v.x]=expired?-1:option;if(!v.practice)v.t[v.x]++;
  if(!v.practice&&!expired&&q.options[option].id===q.correctOptionId)v.c[v.x]=true;
  v.p="feedback";return true;
 }
 const canRetry=(v:RouletteProgress,now:number)=>v.p==="feedback"&&!v.practice&&!v.timeout&&!v.c[v.x]&&v.t[v.x]<settings.attempts&&(!v.d||now<v.d);
 function retry(v:RouletteProgress,now:number){if(!canRetry(v,now))return false;v.p="challenge";return true;}
 function next(v:RouletteProgress){if(v.p!=="feedback")return;v.u[v.x]=true;v.r++;v.d=0;v.p=complete(v)?"results":"wheel";}
 const score=(v:RouletteProgress)=>Math.round(v.c.filter(Boolean).length/n*100);
 const points=(v:RouletteProgress)=>v.c.filter(Boolean).length*settings.pointsPerCorrect;
 function serialize(v:RouletteProgress){const text=JSON.stringify(v);if(text.length>4096)throw Error("progress_budget_exceeded");return text;}
 function restore(text:string):RouletteProgress|null{
  try{if(text.length>4096)return null;const v=JSON.parse(text) as RouletteProgress;
   if(!v||v.v!==1||v.f!==model.fingerprint||!Number.isInteger(v.s)||v.s<0||v.s>4294967295||!["intro","wheel","spinning","challenge","feedback","results"].includes(v.p)||!Number.isInteger(v.x)||v.x< -1||v.x>=n||!Number.isInteger(v.r)||v.r<0||v.r>40)return null;
   for(const key of ["a","t","c","u"] as const)if(!Array.isArray(v[key])||v[key].length!==n)return null;
   if(!v.a.every(a=>Number.isInteger(a)&&a>=-1&&a<4)||!v.t.every(t=>Number.isInteger(t)&&t>=0&&t<=settings.attempts)||!v.c.every(c=>typeof c==="boolean")||!v.u.every(u=>typeof u==="boolean")||typeof v.practice!=="boolean"||typeof v.timeout!=="boolean"||!Number.isFinite(v.d)||v.d<0)return null;
   if(["spinning","challenge","feedback"].includes(v.p)&&v.x<0)return null;
   if(v.c.some((c,i)=>c&&v.t[i]===0)||v.u.filter(Boolean).length>v.r||(!settings.repeatSegments&&v.r>n)||(v.p==="results"&&!complete(v)))return null;
   return v;
  }catch{return null;}
 }
 return {initial,spin,begin,answer,retry,canRetry,next,score,points,serialize,restore};
}
/** Pointer is at the top. Sectors begin at 12 o'clock, increasing clockwise. */
export function rouletteRotation(index:number,count:number,previous=0){const target=(360-(index+.5)*360/count)%360;return previous+(360-(previous%360)+target)%360+1440;}
