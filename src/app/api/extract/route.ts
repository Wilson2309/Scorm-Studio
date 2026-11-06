import { extractPDF } from "@/lib/pdf/extract";
import { boundedBody, BodyTooLargeError } from "@/lib/http/bounded-body";
import {guardRequest} from "@/lib/auth/request";

export async function POST(request: Request) {
  const denied=await guardRequest(request);if(denied)return denied;
  const length = Number(request.headers.get("content-length"));
  if (length > 21 * 1024 * 1024) return Response.json({ error: "La carga supera los 20 MB permitidos para el PDF." }, { status: 413 });
  try {
    const body = await boundedBody(request, 21 * 1024 * 1024);
    const form = await new Response(body, { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Falta el archivo PDF." }, { status: 400 });
    return Response.json(await extractPDF(file), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof BodyTooLargeError) return Response.json({ error: "La carga supera el límite permitido." }, { status: 413 });
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo extraer el PDF." }, { status: 422, headers: { "Cache-Control": "no-store" } });
  }
}
