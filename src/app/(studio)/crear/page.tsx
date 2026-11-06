import { GeneratorWizard } from "@/features/generator/generator-wizard";
import {Suspense} from "react";
export const metadata = { title: "Crear actividad" };
export default function Page() { return <Suspense fallback={<p role="status">Recuperando espacio de trabajo…</p>}><GeneratorWizard /></Suspense>; }
