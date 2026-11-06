import { packageSCORM } from "@/lib/scorm/package";
import {guardRequest} from "@/lib/auth/request";
import { boundedBody, BodyTooLargeError } from "@/lib/http/bounded-body";
import { studioQuizSchema } from "@/lib/content/schema";
import { validateQuiz } from "@/lib/content/quality";
import {validateSCORMArtifact} from "@/lib/content/scorm-artifact";
export async function POST(request: Request) {
  const denied=await guardRequest(request);if(denied)return denied;
  try {
    const body = new TextDecoder().decode(await boundedBody(request, 1_500_000));
    const quiz=studioQuizSchema.parse(JSON.parse(body));
    const quality=validateQuiz(quiz);
    if(!quality.valid)return Response.json({error:quality.issues.find(i=>i.severity==="BLOCKING")?.message??"Revisa los problemas que bloquean la exportación.",issues:quality.issues},{status:422,headers:{"Cache-Control":"no-store"}});
    const zip = packageSCORM(quiz);
    try{validateSCORMArtifact(zip,quiz);}catch{return Response.json({error:"No se pudo validar el paquete SCORM. Vuelve a generarlo antes de descargar."},{status:500,headers:{"Cache-Control":"no-store"}});}
    return new Response(new Uint8Array(zip), { headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="scorm-studio-quiz.zip"',
      "Cache-Control": "no-store",
    } });
  } catch (error) {
    if (error instanceof BodyTooLargeError) return Response.json({ error: "El quiz supera el límite permitido." }, { status: 413 });
    return Response.json({ error: "El quiz no cumple el esquema. Revisa las preguntas antes de exportar." }, { status: 422 });
  }
}
