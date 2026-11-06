import {AlertTriangle, CircleAlert, Info} from "lucide-react";
type Issue={severity:string;message:string;title?:string};
export function QualityFeedback({issues,label="Observaciones"}:{issues:Issue[];label?:string}){
 const actionable=issues.filter(i=>i.severity==="BLOCKING"||i.severity==="WARNING"),optional=issues.filter(i=>i.severity==="INFO");
 if(!actionable.length&&!optional.length)return null;
 return <div className="quality-feedback">{actionable.length>0&&<div role="status"><p className="quality-feedback-heading">{label}</p><ul>{actionable.map((issue,i)=>{const Icon=issue.severity==="BLOCKING"?CircleAlert:AlertTriangle;return <li key={i} data-severity={issue.severity}><Icon size={16} aria-hidden="true"/><span><strong>{issue.severity==="BLOCKING"?"Corregir":"Revisar"}{issue.title?` · ${issue.title}`:""}</strong>{issue.message}</span></li>;})}</ul></div>}{optional.length>0&&<details className="quality-info"><summary><Info size={15} aria-hidden="true"/>{optional.length} {optional.length===1?"mejora opcional":"mejoras opcionales"}</summary><ul>{optional.map((issue,i)=><li key={i}>{issue.message}</li>)}</ul></details>}</div>;
}
