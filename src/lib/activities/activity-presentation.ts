/** Clean authored display copies only. Canonical PDF text/IDs are never modified. */
export function activityPresentation(text:string){
 return text.replace(/\*\*([^*\n]+)\*\*/g,"$1").replace(/\*([^*\n]+)\*/g,"$1").replace(/\b_([^_\n]+)_\b/g,"$1");
}
export function decisionCountLabel(count:number){return `${count} ${count===1?"situación de decisión":"situaciones de decisión"}`;}
