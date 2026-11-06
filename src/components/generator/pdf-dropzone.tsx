"use client";
import { useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Check, CircleAlert, LockKeyhole, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export interface DocumentSelection { name: string; size: number; file?: File; sample?: boolean; persisted?:boolean }

export function PDFObject({ active = false, ready = false }: { active?: boolean; ready?: boolean }) {
  return <div className={cn("pdf-object", active && "pdf-active", ready && "pdf-ready")} aria-hidden="true">
    <span className="pdf-sheet sheet-back" /><span className="pdf-sheet sheet-middle" />
    <div className="pdf-sheet sheet-front">
      <div className="pdf-sheet-top"><span className="pdf-file-label">PDF</span><span className="pdf-fold" /></div>
      <span className="pdf-title-line" /><span className="pdf-title-line short" />
      <div className="pdf-lines"><i /><i /><i /><i /></div>
      <div className="pdf-sheet-bottom"><span>Tu conocimiento</span>{ready ? <Check size={16} /> : <span className="pdf-page-mark">Aa</span>}</div>
    </div>
  </div>;
}

export function PDFDropzone({ value, onChange, compact = false, action }: {
  value?: DocumentSelection | null;
  onChange: (file: DocumentSelection | null) => void;
  compact?: boolean;
  action?: ReactNode;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef(false);
  const dragDepth = useRef(0);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState("");
  const reduced = useReducedMotion();

  function select(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf") || (file.type && file.type !== "application/pdf")) {
      setError("Ese formato no es PDF. Selecciona un documento con extensión .pdf."); return;
    }
    if (!file.size || file.size > 20 * 1024 * 1024) {
      setError(file.size ? "El documento supera los 20 MB. Prueba con un PDF más pequeño." : "El documento está vacío. Selecciona otro PDF."); return;
    }
    setError("");
    pendingFocus.current = true;
    onChange({ name: file.name, size: file.size, file });
  }

  return <div ref={host} className={cn("pdf-experience", compact && "pdf-experience-compact")}>
    <motion.div
      animate={{ scale: drag && !reduced ? 1.012 : 1 }}
      transition={{ duration: .22 }}
      className={cn("creation-drop", drag && "is-dragging", value && "document-ready")}
      onDragEnter={e => { e.preventDefault(); dragDepth.current++; setDrag(true); }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
      onDragLeave={e => { e.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDrag(false); }}
      onDrop={e => {
        e.preventDefault(); dragDepth.current = 0; setDrag(false);
        if (e.dataTransfer.files.length !== 1) { setError("Añade un solo documento PDF a la vez."); return; }
        select(e.dataTransfer.files[0]);
      }}
    >
      <div className="drop-border" aria-hidden="true" />
      <input ref={input} id={id} type="file" accept=".pdf,application/pdf" className="sr-only" tabIndex={-1} aria-label="Seleccionar documento PDF" onChange={e => { select(e.target.files?.[0]); e.target.value = ""; }} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={value ? "ready" : "empty"} className="drop-content"
          initial={{ opacity: 0, y: reduced ? 0 : 12, scale: reduced ? 1 : .98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: reduced ? 0 : -8, scale: reduced ? 1 : .98, transition: { duration: reduced ? 0 : .12 } }}
          transition={{ duration: reduced ? 0 : .28 }}
          onAnimationComplete={definition => {
            if (!pendingFocus.current || typeof definition !== "object" || !("opacity" in definition) || definition.opacity !== 1) return;
            const target = host.current?.querySelector<HTMLElement>(value ? ".ready-actions button, .ready-actions a" : ".select-pdf-action");
            if (target) { target.focus(); pendingFocus.current = false; }
          }}>
          <PDFObject active={drag} ready={!!value} />
          {value ? <>
            <div className="document-ready-label"><Check size={15} />Documento listo para explorar</div>
            <h3 className="selected-filename">{value.name}</h3>
            <p>{(value.size / 1024 / 1024).toFixed(2)} MB · {value.sample ? "Ejemplo de demostración" : value.persisted?"Guardado privado en tu cuenta":"Seleccionado en tu dispositivo"}</p>
            <div className="ready-actions">{action}<Button variant="ghost" onClick={() => { pendingFocus.current = true; onChange(null); setError(""); }} aria-label={`Quitar ${value.name}`}><X size={16} />Quitar</Button></div>
            <span className="local-caption"><LockKeyhole size={13} />{value.persisted?"Archivo privado. Quitar la selección no elimina el trabajo guardado.":"Selección local. No se ha subido ningún archivo."}</span>
            <span className="acceptance-sweep" aria-hidden="true" />
          </> : <>
            <h3>{drag ? "Suéltalo. Aquí empieza algo nuevo." : "Aquí empieza la transformación."}</h3>
            <p>{drag ? "Tu documento está en el lugar correcto." : "Arrastra tu PDF y dale una nueva forma de enseñar."}</p>
            <Button className="select-pdf-action" onClick={() => input.current?.click()} aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}><Upload size={17} />Seleccionar PDF<ArrowUpRight size={17} /></Button>
            <small id={`${id}-help`}>PDF · Máximo 20 MB · Un documento a la vez</small>
          </>}
        </motion.div>
      </AnimatePresence>
    </motion.div>
    <AnimatePresence>{error && <motion.div className="pdf-error" id={`${id}-error`} role="alert" initial={{ opacity: 0, y: reduced ? 0 : -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><CircleAlert size={18} /><p>{error}</p><button type="button" onClick={() => { setError(""); input.current?.click(); }}>Elegir otro</button></motion.div>}</AnimatePresence>
    <span className="sr-only" role="status">{value ? `Documento seleccionado: ${value.name}. Selección local, sin envío.` : "Ningún documento seleccionado."}</span>
  </div>;
}
