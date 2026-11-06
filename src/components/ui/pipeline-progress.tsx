import {Check, Circle, CircleAlert, LoaderCircle} from "lucide-react";

export type ProgressStatus="complete"|"running"|"pending"|"error";
export type ProgressStep={id:string;label:string;status:ProgressStatus;detail?:string};
const labels:Record<ProgressStatus,string>={complete:"Completado",running:"En ejecución",pending:"En espera",error:"Error"};
export function PipelineProgress({steps,label="Progreso de la actividad"}:{steps:ProgressStep[];label?:string}){
 return <ol className="pipeline-progress package-stages" aria-label={label} aria-live="polite">{steps.map(step=>{
  const Icon=step.status==="complete"?Check:step.status==="running"?LoaderCircle:step.status==="error"?CircleAlert:Circle;
  return <li key={step.id} className={step.status==="complete"?"done":step.status==="running"?"active":""} data-status={step.status} aria-current={step.status==="running"?"step":undefined} aria-label={`${step.label}: ${labels[step.status]}`}><Icon size={18} aria-hidden="true"/><span>{step.label}<span className="sr-only"> · {labels[step.status]}</span>{step.detail&&<small>{step.detail}</small>}</span></li>;
 })}</ol>;
}
