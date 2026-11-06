<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Regla persistente del desarrollador: trabajar en D:

- En este equipo, mantener todo el trabajo en `D:\Development\Proyectos\scorm-studio`.
- Archivos nuevos, cachés, temporales, logs, capturas, perfiles de navegador de QA y ZIP de prueba deben escribirse en D:, nunca deliberadamente en C:.
- Antes de ejecutar herramientas en PowerShell: `. .\scripts\use-d-workspace.ps1`. Esto configura solo el proceso actual; no cambia perfiles globales ni Ollama.
- NPM usa la caché local de `.npmrc`; las pruebas fijan sus temporales dentro de `.cache/tmp` del proyecto. Ambas carpetas están ignoradas por Git.
- Las herramientas/skills instaladas en C: pueden leerse, pero dirigir sus salidas y temporales a D:. No instalar, descargar o generar artefactos en C: por comodidad.
- No limpiar perfiles reales, documentos o cachés globales sin autorización. Los registros internos del sistema/herramienta fuera del control del proyecto no justifican escribir archivos de trabajo en C:.
