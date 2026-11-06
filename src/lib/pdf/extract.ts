import { getDocumentProxy } from "unpdf";
import { extractedDocumentSchema, type ExtractedDocument } from "../quiz/schema";

export function cleanText(text: string) {
  return text.normalize("NFKC").replace(/(\p{L})-\r?\n(?=\p{L})/gu, "$1")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[\t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
export async function extractPDF(file: File): Promise<ExtractedDocument> {
  if (!file.name.toLowerCase().endsWith(".pdf") || (file.type && file.type !== "application/pdf")) throw new Error("Selecciona un archivo PDF válido.");
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("El PDF debe pesar entre 1 byte y 20 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.subarray(0,5)) !== "%PDF-") throw new Error("El archivo no tiene una cabecera PDF válida.");
  let pdf;
  try { pdf = await getDocumentProxy(bytes); }
  catch { throw new Error("No se pudo abrir el PDF. Puede estar dañado o protegido con contraseña."); }
  try {
    if (pdf.numPages > 100) throw new Error("Esta versión admite hasta 100 páginas.");
    const pages: string[] = [];
    const warnings: string[] = [];
    let length = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = cleanText(content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join(""));
      page.cleanup();
      if (text.length < 30) warnings.push(`Página ${i}: poco o ningún texto extraíble; no se aplica OCR.`);
      length += text.length;
      if (length > 200_000) throw new Error("El texto supera los 200.000 caracteres permitidos.");
      pages.push(text);
    }
    const text = pages.join("\n\n");
    if (text.trim().length < 100) throw new Error("No hay suficiente texto extraíble. Los PDF escaneados necesitan OCR, fuera de esta fase.");
    return extractedDocumentSchema.parse({ name: file.name.slice(0,255), pages: pdf.numPages, text, pageTexts: pages.map((text,i)=>({page:i+1,text})), warnings });
  } finally { await pdf.loadingTask.destroy(); }
}
