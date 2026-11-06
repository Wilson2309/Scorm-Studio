import {z} from "zod";
import {workspaceId,workspaceStates} from "./contracts";

export const historyFiltersSchema=z.object({q:z.string().trim().max(100).default(""),status:z.enum(["ALL",...workspaceStates.options]).default("ALL"),order:z.enum(["updated_desc","created_desc","created_asc"]).default("updated_desc"),page:z.coerce.number().int().min(1).max(10000).default(1),pageSize:z.coerce.number().int().min(1).max(20).default(8)});
export type HistoryFilters=z.infer<typeof historyFiltersSchema>;
export const historyItemSchema=z.object({id:workspaceId,type:z.enum(["QUIZ","ROULETTE","TIMELINE","SIMULATION"]).default("QUIZ"),title:z.string(),documentId:workspaceId,document:z.string(),createdAt:z.string(),updatedAt:z.string(),status:workspaceStates,questions:z.number().int(),revision:z.number().int(),deleting:z.boolean(),hasPackage:z.boolean(),packageSize:z.number().nullable()});
export type HistoryItem=z.infer<typeof historyItemSchema>;
export const historyResultSchema=z.object({items:z.array(historyItemSchema),total:z.number().int().nonnegative(),filters:historyFiltersSchema});
export const workspaceSummarySchema=z.object({total:z.number().int().nonnegative(),pending:z.number().int().nonnegative(),packages:z.number().int().nonnegative(),recent:z.array(historyItemSchema)});
export type WorkspaceSummary=z.infer<typeof workspaceSummarySchema>;
export const historyLabels:Record<z.infer<typeof workspaceStates>,string>={UPLOADED:"Documento guardado",PREPARED:"Preparada",GENERATING:"Generando preguntas",NEEDS_REVIEW:"En revisión",READY:"Lista para exportar",SCORM_GENERATED:"SCORM disponible",FAILED:"Requiere atención"};
export function literalTitlePattern(value:string){return `%${value.replace(/[\\%_]/g,"\\$&")}%`;}
export function historyURL(filters:HistoryFilters){const params=new URLSearchParams();if(filters.q)params.set("q",filters.q);if(filters.status!=="ALL")params.set("status",filters.status);if(filters.order!=="updated_desc")params.set("order",filters.order);if(filters.page!==1)params.set("page",String(filters.page));if(filters.pageSize!==8)params.set("pageSize",String(filters.pageSize));return params.toString();}
