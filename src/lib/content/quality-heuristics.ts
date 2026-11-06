import {canonical} from "./text";
const stop=new Set("para como segun esta este desde entre sobre porque puede cuando cual cuales siguiente siguientes opcion opciones correcto correcta describir describe representa negocio negocios electronico electronicos pagina paginas producto productos usuario usuarios sistema sistemas diseno contenido elemento elementos debe deben permite permitir una uno unos unas con que del por las los sus mas los son del mediante".split(" "));
const normalizeWord=(word:string)=>/^(?:buscad|busqu)/.test(word)?"buscar":word.replace(/(?:ciones|cion)$/,"cion").replace(/(?:es|s)$/," ").trim();
export const terms=(text:string)=>canonical(text).split(" ").filter(w=>(w.length>3||["no","sin","not"].includes(w))&&!stop.has(w)).map(normalizeWord);
export function similarity(a:string,b:string){const x=new Set(terms(a)),y=new Set(terms(b));return [...x].filter(w=>y.has(w)).length/Math.max(1,new Set([...x,...y]).size);}
export function cognitiveSignals(stem:string){
  const text=canonical(stem);
  const scenario=/\b(?:una?|dos|el|la) (?:tiendas?|empresas?|equipos?|usuarios?|clientes?|sistemas?|sitios?|celulas?|ecosistemas?|plantas?|organizaciones?|negocios?|grupos?|catalogos?|almacen(?:es)?|operador(?:es)?|transportistas?|muelles?|centros?|terminal(?:es)?)\b.{0,160}\b(?:necesitan?|presentan?|observan?|registran?|reciben?|sufren?|detectan?|tienen?|carecen?|pierden?|desean?|quieren?|muestran?|enfrentan?|deben?|no logran?|disponen?|utilizan?|ofrecen?|amplian?|crecen?|expanden?|gestionan?|intentan?|experimentan?)\b/.test(text)||/\b(?:si|ante|dado que)\b.{0,100}\b(?:problema|necesita|ocurre|aumenta|disminuye|reduce|falla|cambia)\b/.test(text);
  const multipleFactors=/\b(?:dos|ambos|distint|pero|mientras|aunque|porque|debido|a pesar|sin embargo)|.{30,}(?:y ademas|en cambio)/.test(text);
  const reasoning=multipleFactors&&/compar|diagnost|causa|consecuencia|infer|descomp|hipotesis|explicaria|por que|relacion/.test(text);
  const action=/eleg|seleccion|aplica|usar|utiliz|tecnica|enfoque|estrategia|solucion|decision|medida|cambio|deberia|accion|implement|estructura|arquitectura|organiza|combinacion|ayuda/.test(text);
  const recognition=/^(?:que es|what is|which definition|cual.{0,45}definicion)|\b(?:que|cual) (?:opcion|tecnica).{0,35}(?:define|definicion|es)|\b(?:que|cual) (?:metodo|estrategia|componente|funcion|caracteristica).{0,150}(?:se utiliza|aumenta|describe|es|permite)/.test(text);
  const interpretation=/explica|disting|interpreta|relacion|contribuye|compar/.test(text);
  const inferred=scenario&&reasoning?"analysis":scenario&&action?"application":/explica|disting|interpreta|relacion|contribuye|compar/.test(text)?"comprehension":"remember";
  return {scenario,reasoning,action,recognition,interpretation,multipleFactors,inferred};
}
export function isAdministrativeQuestion(text:string){const stem=canonical(text);return /(?:nombre|cual|que|como).{0,65}(?:universidad|institucion|docente|profesor|correo)\b|(?:numero de pagina|cuantas paginas (?:tiene|contiene).{0,20}(?:pdf|documento)|que pagina (?:del|de este) (?:pdf|documento))|(?:codigo|modalidad|creditos|dossier) (?:de|del|es)|(?:cuantos|cual|que).{0,30}(?:creditos|codigo de asignatura|modalidad del curso)/.test(stem);}
