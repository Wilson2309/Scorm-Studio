import type {SourceFragment} from "../content/schema";
import type {SimulationSpec,SimulationScene} from "./simulation-schema";
import {academicDraftIdeas} from "./draft-suitability";
import {selectSimulationDecisions,simulationRulePattern} from "./simulation-decision-plan";
import {assembleSimulationDecisions} from "./simulation-case-generation";
import {conceptTitle} from "./activity-knowledge";
import {activityText} from "./activity-evidence";
/** Preserve explicit rules; other decisions require verified source-function/order plans. */
export function detectSimulationRules(sources:SourceFragment[]){
 const rules:{id:string;condition:string;action:string;alternative:string;sourceFragmentIds:string[]}[]=[];
 for(const f of sources.filter(s=>activityText(s))){
  const pattern=simulationRulePattern();
  for(const m of f.text.matchAll(pattern)){const clean=(s:string)=>s.trim().replace(/[.;]+$/,"");const action=clean(m[2]),alternative=clean(m[3]);if(action.toLowerCase()===alternative.toLowerCase())continue;rules.push({id:`rule-${f.id}-${m.index}`,condition:clean(m[1]),action,alternative,sourceFragmentIds:[f.id]});}
 }
 return rules.slice(0,5);
}
export function prepareSimulation(sources:SourceFragment[],documentId:string,id:string,title:string):SimulationSpec{
 const rules=detectSimulationRules(sources);if(!rules.length){const plans=selectSimulationDecisions(sources);return plans.length?assembleSimulationDecisions(plans,documentId,id,title):prepareExploratorySimulation(sources,documentId,id,title);}
 const scenes:SimulationScene[]=[];
 rules.forEach((r,i)=>{const decision=`decision-${i}`,yes=`action-${i}`,no=`review-${i}`,next=i===rules.length-1?"ending":`decision-${i+1}`,base={sourceFragmentIds:r.sourceFragmentIds,provenance:"source" as const};
  scenes.push({...base,id:decision,title:`Decisión ${i+1}`,description:`Situación: ${r.condition}. ¿Qué actuación corresponde según el material?`,kind:"DECISION",choices:[{id:`yes-${i}`,text:r.action,nextSceneId:yes,feedback:"Esta actuación corresponde a la condición indicada en el material.",points:1},{id:`no-${i}`,text:r.alternative,nextSceneId:no,feedback:"Esta alternativa corresponde al caso contrario descrito en la fuente.",points:0}]});
  if(i%2)scenes[scenes.length-1].choices.reverse();
  for(const [sceneId,correct] of [[yes,true],[no,false]] as const)scenes.push({...base,id:sceneId,title:correct?"Actuación fundamentada":"Reconsidera la decisión",kind:"CONSEQUENCE",description:correct?`El material indica: ${r.action}.`:`Para la situación indicada, el material establece: ${r.action}. La alternativa elegida corresponde al caso contrario.`,choices:[{id:`continue-${sceneId}`,text:"Continuar el recorrido",nextSceneId:next,feedback:"Continúa con la siguiente situación.",points:0}]});
 });
 scenes.push({id:"ending",title:"Recorrido completado",description:"Has contrastado tus decisiones con las condiciones y actuaciones del material. Revisa las fuentes y tu recorrido.",kind:"ENDING",choices:[],sourceFragmentIds:[...new Set(rules.flatMap(r=>r.sourceFragmentIds))].slice(0,4),provenance:"source"});
 return {id,type:"SIMULATION",schemaVersion:1,documentId,title:title.slice(0,100),description:"Decide en cada situación y contrasta las consecuencias educativas con el material.",instructions:"Lee la situación, toma una decisión y revisa su explicación antes de continuar.",startSceneId:scenes[0].id,scenes,configuration:{scored:true,passingScore:70,maxSteps:40,allowRetry:true,maxAttempts:2}};
}
function prepareExploratorySimulation(sources:SourceFragment[],documentId:string,id:string,title:string):SimulationSpec{
 const ideas=academicDraftIdeas(sources).slice(0,3);if(!ideas.length)throw Error("No hay contenido acad\u00e9mico completo para preparar una actividad. Cambia el PDF o incorpora contenido docente.");
 const refs=[...new Set(ideas.map(i=>i.source.id))].slice(0,4),scenes:SimulationScene[]=[{id:"explore-topics",title:"Exploraci\u00f3n conceptual del material",description:"Este material permite explorar conceptos, pero no aporta decisiones y consecuencias suficientes para una simulaci\u00f3n evaluativa. Elige un tema, consulta su explicaci\u00f3n y vuelve para comparar otras ideas. Puedes terminar el recorrido cuando quieras.",kind:"DECISION",provenance:"source",sourceFragmentIds:refs,choices:ideas.map(({text},i)=>({id:`topic-${i}`,text:conceptTitle(text),nextSceneId:`explanation-${i}`,feedback:"Consulta la explicaci\u00f3n y su fuente; esta elecci\u00f3n de navegaci\u00f3n no se califica.",points:0}))}];
 scenes[0].choices.push({id:"finish-exploration",text:"Terminar la exploraci\u00f3n",nextSceneId:"exploration-ending",feedback:"El recorrido es exploratorio y no asigna una nota acad\u00e9mica.",points:0});
 ideas.forEach(({text,source},i)=>scenes.push({id:`explanation-${i}`,title:conceptTitle(text),description:text,kind:"CONSEQUENCE",provenance:"source",sourceFragmentIds:[source.id],choices:[{id:`return-${i}`,text:"Explorar otro tema",nextSceneId:"explore-topics",feedback:"Compara las ideas del material sin atribuirles consecuencias que no documenta.",points:0}]}));
 scenes.push({id:"exploration-ending",title:"Exploraci\u00f3n terminada",description:"Has cerrado un recorrido conceptual. Las opciones han servido para navegar por el contenido, no para evaluar decisiones ni predecir resultados.",kind:"ENDING",choices:[],sourceFragmentIds:refs,provenance:"source"});
 return {id,type:"SIMULATION",schemaVersion:1,documentId,title:title.slice(0,100),learningMode:"CONCEPT_EXPLORATION",description:"Exploraci\u00f3n conceptual, sin evaluaci\u00f3n de decisiones ni consecuencias simuladas.",instructions:"Elige un tema para explorar sus ideas y fuentes. Esta actividad no representa un caso de decisi\u00f3n evaluativo ni asigna puntuaci\u00f3n.",preparation:{level:"weak",message:"El documento permite una exploraci\u00f3n conceptual. No se han identificado decisiones y consecuencias suficientemente respaldadas; este recorrido no se presenta como una simulaci\u00f3n evaluativa."},startSceneId:"explore-topics",scenes,configuration:{scored:false,passingScore:70,maxSteps:40,allowRetry:true,maxAttempts:2}};
}
