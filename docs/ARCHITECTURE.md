# Arquitectura
Next.js App Router sirve páginas, Proxy de sesión y API. React mantiene la edición. Los módulos de src/lib separan extracción PDF, preparación determinista, generación IA, validación, persistencia y empaquetado SCORM.
Las cuatro actividades se registran en src/lib/activities/registry.ts. Las rutas privadas verifican sesión y propiedad; Supabase almacena datos y archivos privados. No publicar PDFs ni borradores reales en Git.
