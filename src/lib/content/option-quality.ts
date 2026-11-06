import type {EducationalQuestion} from "./schema";
import {canonical} from "./text";
import {terms,similarity} from "./quality-heuristics";
export function optionQualityHints(q:EducationalQuestion,evidence:string,domainText:string):{code:string;message:string;blocking?:boolean}[]{
  const hints:{code:string;message:string;blocking?:boolean}[]=[],correct=q.options.find(o=>o.id===q.correctOptionId);
  if(!correct)return hints;
  if(q.options.some(o=>canonical(o.text).length>=8&&canonical(q.stem).includes(canonical(o.text))))hints.push({code:"option_in_stem",message:"El enunciado menciona una de las alternativas. Revisa si revela o descarta la respuesta sin exigir razonamiento."});
  const wrong=q.options.filter(o=>o.id!==correct.id),domain=new Set(terms(domainText+" "+evidence));
  const generic=(text:string)=>terms(text).filter(w=>domain.has(w)).length<2;
  const copied=terms(correct.text).length>=6&&(canonical(evidence).includes(canonical(correct.text))||evidence.split(/[.!?\n]/).some(sentence=>similarity(sentence,correct.text)>.68));
  if(copied&&wrong.filter(o=>generic(o.text)).length>=2)hints.push({code:"verbatim_answer_cue",message:"La correcta reproduce la fuente y las demás son genéricas. Parafrasea y equilibra el detalle de las cuatro alternativas."});
  if(wrong.every(o=>/\b(?:solo|unicamente|siempre|nunca|ningun|ignor(?:a|ar|an)|elimin(?:a|ar|an)|sin importar|no hacer|desactiv(?:a|ar|an))\b/.test(canonical(o.text))))hints.push({code:"obvious_distractors",message:"Esta pregunta es válida, pero sus distractores parecen demasiado fáciles: las tres alternativas usan restricciones o acciones extremas."});
  const unrelated=q.options.filter(o=>{const words=[...new Set(terms(o.text))],hits=words.filter(w=>domain.has(w)).length;return words.length>=3&&(hits===0||o.id!==correct.id&&words.length>=5&&hits<2);});
  if(unrelated.length)hints.push({code:"outside_domain",message:`La alternativa ${unrelated.map(o=>o.id.toUpperCase()).join(", ")} usa términos ajenos al tema. Sustitúyela por una confusión cercana al concepto.`});
  for(let i=0;i<q.options.length;i++)for(let j=i+1;j<q.options.length;j++){
    if(similarity(q.options[i].text,q.options[j].text)>.72)hints.push({code:`similar_options_${i}_${j}`,message:`Las alternativas ${q.options[i].id.toUpperCase()} y ${q.options[j].id.toUpperCase()} son demasiado similares. Comprueba que solo una responda al caso.`});
  }
  const shared=terms(wrong[0].text).filter(w=>wrong.slice(1).every(o=>terms(o.text).includes(w))&&!domain.has(w));
  if(shared.length>=3)hints.push({code:"generic_distractor_pattern",message:"Los distractores repiten una fórmula genérica ajena al contenido. Usa errores o interpretaciones concretas del tema."});
  // High-confidence internal contradiction, not a general entailment judge.
  // A near-verbatim explanation/source match to another option while the marked
  // one has almost no overlap must be resolved by the teacher, never auto-fixed.
  const explanation=terms(q.explanation),source=terms(evidence);
  const stated=canonical(q.explanation);
  // Short concept options no longer meet the long-prose overlap rule below.
  // Block only an explicit declaration of another answer; ordinary contrasts
  // or mention of a related method are not proof of a contradiction.
  const explicitWrong=wrong.find(o=>{
    const name=canonical(o.text),prefix="(?:la respuesta|la opcion|la tecnica|el metodo) (?:correcta|correcto|adecuada|adecuado) es ";
    return stated.startsWith("la respuesta correcta es "+name)||new RegExp("^"+prefix+name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"(?: |$)").test(stated);
  });
  if(explicitWrong)hints.push({code:"answer_explanation_conflict",message:`La explicación declara correcta la alternativa ${explicitWrong.id.toUpperCase()}, pero se marcó la ${correct.id.toUpperCase()}. Revisa la respuesta antes de exportar.`,blocking:true});
  const agreement=(text:string,words:string[])=>{const tokens=[...new Set(terms(text))];return tokens.filter(w=>words.includes(w)).length/Math.max(1,tokens.length);};
  if(!/\b(?:no|incorrecta|descarta|equivocad|aunque|pero|sin embargo)\b/.test(canonical(q.explanation))&&agreement(correct.text,explanation)<.18){
    const explained=wrong.find(o=>terms(o.text).length>=8&&agreement(o.text,explanation)>.5&&agreement(o.text,explanation)>agreement(correct.text,explanation)*3&&agreement(o.text,source)>.7);
    if(explained)hints.push({code:"answer_explanation_conflict",message:`La explicación respalda la alternativa ${explained.id.toUpperCase()}, pero se marcó la ${correct.id.toUpperCase()}. Revisa cuál es correcta antes de exportar.`,blocking:true});
  }
  return hints;
}
