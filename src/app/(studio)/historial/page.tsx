import { HistoryView } from "@/features/history/history-view";
import {Suspense} from "react";
export const metadata = { title: "Historial" };
export default function Page() { return <Suspense fallback={<p role="status">Recuperando tu biblioteca…</p>}><HistoryView /></Suspense>; }
