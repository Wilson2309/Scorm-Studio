import {dateBounds,type TimelineSpec,type TimelineConstraint} from "./timeline-schema";
type AssessmentView=Pick<TimelineSpec,"events"|"mode"|"assessment">;
export function timelineConstraints(spec:AssessmentView):TimelineConstraint[]{
 if(spec.mode==="CONCEPTUAL_TIMELINE"||spec.assessment.orderBasis==="none")return [];
 if(spec.mode==="PROCESS_TIMELINE"&&spec.assessment.orderBasis==="teacher"&&spec.assessment.teacherOrderConfirmed)return spec.events.slice(1).map((_,i)=>({before:i,after:i+1}));
 if(spec.mode==="PROCESS_TIMELINE")return spec.events.slice(1).flatMap((e,i)=>e.ordinal!==null&&spec.events[i].ordinal!==null&&spec.events[i].ordinal!<e.ordinal?[{before:i,after:i+1}]:[]);
 const result:TimelineConstraint[]=[];for(let i=0;i<spec.events.length;i++)for(let j=i+1;j<spec.events.length;j++){const a=spec.events[i].date,b=spec.events[j].date;if(a&&b&&dateBounds(a.end||a.start,true)!<dateBounds(b.start)!)result.push({before:i,after:j});}return result;
}
export function recommendTimelineAssessment(spec:AssessmentView){
 const constraints=timelineConstraints(spec),ordered=spec.events.length>=2&&spec.events.slice(1).every((_,i)=>constraints.some(c=>c.before===i&&c.after===i+1));
 return ordered?{mode:"ORDERING" as const,reason:"El material respalda un orden completo. Recomendamos ordenar los hitos con calificación; puedes elegir exploración sin nota."}:{mode:"EXPLORATORY" as const,reason:spec.mode==="CONCEPTUAL_TIMELINE"?"Este recorrido relaciona conceptos, no establece un orden temporal. Se completa sin nota.":"Hay fechas simultáneas, periodos solapados o relaciones incompletas. Recomendamos explorar sin calificación, sin imponer un orden arbitrario."};
}
