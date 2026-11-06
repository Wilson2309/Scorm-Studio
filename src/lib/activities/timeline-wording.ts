import {z} from "zod";
import type {SourceFragment} from "../content/schema";
export type TimelineWordingInput={eventId:string;title:string;description:string;sources:SourceFragment[]};
export const timelineWordingSchema=z.object({eventId:z.string().min(1).max(80),title:z.string().trim().min(3).max(100),description:z.string().trim().min(20).max(500)}).strict();
export type TimelineWording=z.infer<typeof timelineWordingSchema>;
export const TIMELINE_WORDING_TASK="Mejora solo la redacción educativa de UN hito usando exclusivamente las fuentes suministradas. Devuelve JSON válido, sin Markdown ni texto adicional: eventId exacto, title breve, description concisa. No añadas fechas, hechos, etapas, consecuencias ni relaciones de orden. No cambies la identidad ni decidas la secuencia. No incluyas código, HTML o propiedades adicionales. El texto se revisará por el docente.";
