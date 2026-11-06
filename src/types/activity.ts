export type ActivityKind = "recommended" | "quiz" | "wheel" | "timeline" | "decisions";
export type ActivityStatus = "Lista" | "Borrador" | "En revisión";
export interface Activity {
  id: string;
  title: string;
  document: string;
  kind: Exclude<ActivityKind, "recommended">;
  date: string;
  status: ActivityStatus;
  questions: number;
  subject: string;
}
export interface ActivityType {
  id: ActivityKind;
  name: string;
  description: string;
  label: string;
}
