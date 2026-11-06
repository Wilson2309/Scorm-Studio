import type { Activity, ActivityType } from "@/types/activity";

export const activities: Activity[] = [
  { id: "aprendizaje", title: "¿Cómo aprendemos?", document: "Teorías del aprendizaje.pdf", kind: "quiz", date: "2026-10-29", status: "Lista", questions: 10, subject: "Pedagogía" },
  { id: "etica", title: "Decisiones que importan", document: "Ética profesional · Unidad 3.pdf", kind: "decisions", date: "2026-10-28", status: "Borrador", questions: 6, subject: "Ética profesional" },
  { id: "historia", title: "Un recorrido por la innovación", document: "Historia de la tecnología.pdf", kind: "timeline", date: "2026-10-26", status: "En revisión", questions: 8, subject: "Tecnología" },
  { id: "conceptos", title: "Conecta los conceptos", document: "Fundamentos de investigación.pdf", kind: "wheel", date: "2026-10-24", status: "Lista", questions: 12, subject: "Investigación" },
];
export const activityTypes: ActivityType[] = [
  { id: "recommended", name: "Recomendado por IA", description: "En el futuro, el contenido orientará la elección del formato más adecuado.", label: "Selección asistida" },
  { id: "quiz", name: "Quiz", description: "Preguntas que invitan a recordar, conectar y comprobar lo aprendido.", label: "Evaluación" },
  { id: "wheel", name: "Ruleta", description: "Una dinámica de conceptos y preguntas para despertar la participación.", label: "Exploración" },
  { id: "timeline", name: "Línea de tiempo", description: "Organiza eventos e ideas en una secuencia fácil de explorar.", label: "Secuencias" },
  { id: "decisions", name: "Simulador de decisiones", description: "Lleva la teoría a escenarios donde cada elección tiene una consecuencia.", label: "Aprendizaje situado" },
];
export const sampleAnalysis = { pages: 18, topics: ["Aprendizaje significativo", "Constructivismo", "Estrategias de enseñanza"], description: "Material de ejemplo sobre teorías del aprendizaje y su aplicación en el aula universitaria." };
export const kindLabels = { recommended: "Recomendado por IA", quiz: "Quiz", wheel: "Ruleta", timeline: "Línea de tiempo", decisions: "Decisiones" };
