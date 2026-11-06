import {Badge} from "@/components/ui/primitives";
import {historyLabels,type HistoryItem} from "@/lib/workspace/history-contracts";
export function PersistentStatus({item}:{item:Pick<HistoryItem,"status"|"deleting">}){return <Badge tone={item.deleting||item.status==="FAILED"?"warning":item.status==="SCORM_GENERATED"?"success":item.status==="READY"?"blue":"neutral"}>{item.deleting?"Eliminación pendiente":historyLabels[item.status]}</Badge>;}
export function workspaceDate(value:string){return new Intl.DateTimeFormat("es-EC",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));}
