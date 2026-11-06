import {unzipSync,strFromU8} from "fflate";
import {renderQuiz} from "../scorm/template";
import {learnerRuntime,learnerStyles} from "../scorm/learner-assets";
import {studioQuizSchema,type StudioQuiz} from "./schema";

/** Validate the deterministic engine output against the exact current teacher draft.
 * This is package integrity validation, never Moodle/ADL certification. */
export function validateSCORMArtifact(bytes:Uint8Array,input:StudioQuiz){
  try{
    const quiz=studioQuizSchema.parse(input),files=unzipSync(bytes);
    for(const path of ["imsmanifest.xml","index.html","runtime.js","styles.css"])if(!files[path]?.length)throw new Error("missing");
    const manifest=strFromU8(files["imsmanifest.xml"]),html=strFromU8(files["index.html"]),runtime=strFromU8(files["runtime.js"]),styles=strFromU8(files["styles.css"]);
    if(!/<schemaversion>1\.2<\/schemaversion>/.test(manifest)||!/adlcp:scormtype="sco"/.test(manifest)||!/<resource\b[^>]*href="index\.html"/.test(manifest))throw new Error("manifest");
    if(!["index.html","runtime.js","styles.css"].every(path=>manifest.includes(`<file href="${path}"/>`)))throw new Error("resources");
    if(html!==renderQuiz(quiz)||runtime!==learnerRuntime||styles!==learnerStyles)throw new Error("stale or corrupt");
    // Preview the actual ZIP content, with its own resources inlined for portability.
    const preview=html.replace('<link rel="stylesheet" href="styles.css">',()=>`<style>${styles}</style>`).replace('<script src="runtime.js"></script>',()=>`<script>${runtime}</script>`);
    return {html:preview,size:bytes.byteLength,paths:Object.keys(files)};
  }catch{throw new Error("No se pudo validar el paquete SCORM. Vuelve a generarlo antes de descargar.");}
}
