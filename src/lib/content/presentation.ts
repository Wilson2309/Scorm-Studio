/** Visible label only. Canonical concepts, answer identity and references stay intact. */
export function conceptLabel(value:string){
 const text=value.replace(/\s+/g," ").trim();
 const predicate=/\s+(?:es|son|puede|pueden|debe|deben|permite|permiten|representa|representan|reduce|reducen|mejora|mejoran|consiste|consisten)\b/i.exec(text);
 const prefix=predicate?text.slice(0,predicate.index).replace(/^(?:el|la|los|las|un|una)\s+/i,""):text.split(/[:;.!?]/)[0];
 const label=prefix.length>=3?prefix:text;
 return label.length<=64&&label.split(" ").length<=8?label:label.split(" ").slice(0,7).join(" ").slice(0,60).trimEnd()+"…";
}
