# Despliegue institucional en hosting compartido

Estado: **PENDIENTE DE ACCESO**. Preparación local; no se ha subido nada ni modificado hosting, DNS, Supabase u Ollama. No se dispone de URL del panel, subdominio ni credenciales institucionales. Compatibilidad sin determinar.

## Compatibilidad y requisitos encontrados

| Comprobación | Requisito de esta aplicación | Hosting institucional |
|---|---|---|
| Panel | Identificar cPanel/Plesk/otro y Node.js App/Application Manager/Passenger | Pendiente |
| Runtime | Node >=24 según package.json; Next 16.4.3, React 19.3.0 | Pendiente |
| Ejecución | Proceso Node gestionado por proveedor; reinicios y arranque tras inactividad | Pendiente |
| Instalación | npm y lockfile; SSH/terminal o instalación/build del panel | Pendiente |
| Recursos | Medir RAM/CPU/disco/procesos durante build, extracción, ZIP y concurrencia | Pendiente; no hay mínimo medido |
| HTTP | Timeout total e inactivo de todas las capas, WAF y proxy | Pendiente |
| Cargas | Al menos 21 MiB de cuerpo multipart; PDF máximo 20 MiB | Pendiente |
| Red | HTTPS saliente 443 a Supabase y gateway IA; DNS y CA válidas | Pendiente |
| Configuración | Variables privadas, logs restringidos, directorio temporal y .next escribibles | Pendiente |
| Dominio | Subdominio completo, raíz de aplicación, certificado y renovación SSL | Pendiente |

Pedir al administrador estos datos, versión de Passenger y límites numéricos (no solo “Node soportado”), acceso de cuenta mediante canal seguro y autorización delimitada para publicar. No se necesita root. Si solo hay FTP, confirmar si el panel instala dependencias y gestiona Node; FTP por sí solo no demuestra compatibilidad.

El servidor usa Proxy de autenticación (`src/proxy.ts`), rutas dinámicas y API de extracción, IA, persistencia y descarga. No es exportable como sitio estático completo. PDF y ZIP usan memoria: no estimar RAM solo con el tamaño del PDF. Debe probarse el documento máximo y concurrencia acordada.

## Arquitectura y decisión

**A, condicional:** navegador → HTTPS institucional/proxy del proveedor → Node Next en producción → Supabase actual y gateway Ollama autorizado. Preferir `npm start` si el gestor admite comandos. Si exige archivo de inicio Passenger, usar `passenger.cjs`, preparado con la API de custom server de la documentación incluida en Next 16.4.3. Crea un solo servidor; Passenger controla su socket. No requiere PM2, Docker, Nginx propio ni cambios globales. No combinar este archivo con `output: standalone`.

**B, si falta Node >=24, procesos gestionados o límites suficientes:** conservar el subdominio y ejecutar Next completo en un servicio Node autorizado con límites comprobados. Una opción a evaluar es alojarlo junto al VPS externo existente, solo si su responsable autoriza recursos, aislamiento y operación; alternativamente, un servicio administrado Node que admita los tiempos requeridos. Solicitar al administrador el registro DNS que indique ese servicio y configurar allí el certificado del subdominio. No hay proveedor contratado ni cambio DNS autorizado. No migrar a PHP ni eliminar SSR, API o IA.

### Solicitudes largas

`AI_TIMEOUT_MS` permite hasta 600000 ms **por intento**; algunas operaciones pueden realizar dos intentos y varias llamadas secuenciales. `/api/intelligence` devuelve JSON al terminar: el streaming interno de Ollama no mantiene activa por sí solo la respuesta al navegador. Medir duración de cada flujo completo, picos, arranque frío y concurrencia. El menor timeout de proxy, Passenger, gateway y plataforma debe superar el flujo completo con margen. También comprobar cancelación y reintentos.

Si el proveedor no puede garantizarlo, el escenario A queda bloqueado. Solución sin alterar funcionalidades: ejecutar Next en infraestructura autorizada con tiempos adecuados (B). Una cola duradera con worker y consulta de estado sería un cambio arquitectónico separado, no implementado ni necesario si B satisface los límites. No bajar tiempos ni cambiar modelos/prompts para aparentar compatibilidad.

## Archivos y publicación (solo tras autorización)

1. Registrar versión, copia de release anterior y configuración privada; elegir una carpeta de release fuera de `public_html`. Mantener el árbol de aplicación fuera de la raíz estática pública y publicar mediante el gestor Node.
2. Transferir fuente versionada necesaria: `src/`, `public/`, `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs` y `passenger.cjs` si aplica. Incluir cualquier otro archivo de configuración requerido por el build. No subir `.git`, `.env.local` del PC, `.cache`, pruebas, logs ni credenciales. No copiar `node_modules` de Windows a Linux.
3. En entorno Linux compatible y con Node >=24: `npm ci`, `npm run lint`, `npm run build`. El build necesita devDependencies. Si el hosting no puede compilar, construir un artefacto en Linux compatible autorizado con las mismas versiones y validar allí dependencias; el build Windows local solo es evidencia local.
4. Configurar variables del panel antes del build y del arranque. Conservar `public/`, `.next/` completo y dependencias de ejecución. No usar exportación estática ni `npm run dev`. No podar dependencias hasta verificar el arranque y la resolución de la configuración TypeScript en ese entorno.
5. Registrar aplicación en raíz `/` del subdominio, modo producción, directorio de release y versión Node correcta. Inicio: `npm start` o archivo `passenger.cjs`. No iniciar ambos. No añadir reglas `.htaccess` globales; usar solo los controles del panel disponibles para esa cuenta.
6. El administrador asigna dominio y SSL al gestor. Confirmar cadena, renovación, redirección HTTP→HTTPS y conservación de Host/protocolo original. Excluir páginas privadas y API de caché compartida/CDN; preservar `Set-Cookie` y `Cache-Control: private, no-store`.
7. Reiniciar mediante el panel; revisar logs y ejecutar la matriz de aceptación. No desviar tráfico definitivo hasta verificar los bloqueos IA y autenticación.

## Variables y Supabase

| Variable | Producción |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | Asignado por gestor; Passenger intercepta listen |
| `APP_URL` | Origen exacto `https://<subdominio>` sin ruta |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave pública del proyecto actual; configurar privadamente |
| `WORKSPACE_SIGNING_KEY` | 32 bytes aleatorios, 64 caracteres hex minúsculos; persistente entre releases/reinicios |
| `AI_PROVIDER` | `ollama` |
| `AI_BASE_URL` | Actualmente solo admite loopback HTTP; ver bloqueo siguiente |
| Resto `AI_*`, `OLLAMA_*` | Conservar configuración privada actual y modelos/prompts; ver `.env.example` |

No se requiere service_role ni contraseña PostgreSQL para la aplicación. Nunca poner secretos bajo `NEXT_PUBLIC_*`. No imprimir valores del panel ni copiar `.env` a documentación. Mantener la clave de firma estable para no invalidar artefactos existentes.

Tras autorización específica, en Supabase Auth revisar Site URL con el origen institucional y allowlist exacta del callback `/auth/callback` con los valores `next` usados por registro y recuperación (`/restablecer`). Verificar los enlaces realmente emitidos, incluidas sus consultas codificadas; evitar comodines amplios. Conservar confirmación de correo y revisar plantilla de correo/SMTP y entrega. Probar sesión SSR, renovación de cookies, logout, confirmación y recuperación bajo HTTPS. No cambiar RLS, permisos, tablas, buckets ni migraciones. Estado remoto de Auth/SMTP no inspeccionado.

## Ollama: bloqueo confirmado en código

`src/lib/content/ollama-provider.server.ts` solo acepta HTTP en `127.0.0.1`, `localhost` o `::1`, sin ruta, y llama `/api/tags` y `/api/chat` sin Authorization. `AI_API_KEY` actualmente **no se envía por este adaptador**. Por tanto, configurar una URL HTTPS no basta.

Opciones pendientes de acceso y autorización:

- Gateway HTTPS autenticado en infraestructura del responsable del VPS, con certificado válido, token privado, límites de tamaño/concurrencia/tasa y timeout compatible; Ollama queda en loopback/red privada. Hace falta conocer URL, contrato de autenticación y autoridad para configurarlo. Después adaptar únicamente transporte/validación de URL y cabeceras, impedir redirecciones que filtren credenciales y probar rechazo sin token. No cambiar prompts/modelos.
- Next junto a Ollama en infraestructura autorizada: usar `http://127.0.0.1:11434` en ese servidor y conservar el adaptador actual. Comprobar recursos compartidos y permisos; no depende del PC.
- Túnel gestionado en el hosting solo si el proveedor lo admite expresamente y garantiza supervisión/reinicio; no asumirlo como solución.

No abrir 11434 al público ni publicar un endpoint sin autenticación/TLS. No se ha habilitado ninguna conexión remota. Antes de aceptar: medir tags y generación real desde producción, arranque frío, carga concurrente, rechazo no autorizado y recuperación tras reinicio sin Windows. No registrar texto de PDFs, tokens ni respuestas sensibles en logs.

## Validación, diagnóstico y operación

Registrar cada fila como PASS/FAIL/PENDIENTE y evidencia del subdominio; una landing funcional no completa la entrega:

| Prueba | Evidencia requerida en producción |
|---|---|
| HTTPS y Next | Landing, logo/favicon, assets y rutas dinámicas, arranque producción y reinicio gestionado |
| Auth | Registro, correo confirmado, login, dashboard, logout, recuperación y renovación de sesión |
| PDF e IA | Carga/extracción, PDF máximo, generación real de las cuatro actividades, latencia/concurrencia y errores recuperables |
| Edición y datos | Edición, autosave, recarga, recuperación e historial en sesión nueva |
| Aislamiento | Dos docentes; acceso cruzado a IDs/documentos/descargas rechazado |
| SCORM 1.2 | ZIP de Quiz, Ruleta, Timeline y Simulation; manifest, recursos e integridad; importación y ejecución en LMS de prueba |
| Independencia | Repetir generación con túnel Windows cerrado y tras reinicio de aplicación |

Consultar stdout/stderr y log del panel de acceso restringido. 413: comparar límites del WAF/proxy y 21 MiB; 502/503: proceso, build y variables; 504: timeout de cada capa; fallo IA inmediato: validación loopback actual o gateway; login en bucle: origen, cookies, allowlist y caché. No activar logs con secretos/documentos para diagnosticar. Medir RAM/CPU y duración sin contenido educativo.

Actualizaciones: nuevo directorio de release, mismas versiones/lockfile, build Linux, checks, mismas variables y firma; cambiar destino en el panel y reiniciar. Rollback: volver al directorio previo y reiniciar con su configuración compatible; conservar el release fallido para diagnóstico restringido. No ejecutar migraciones ni restaurar datos Supabase como parte del rollback de código.

Limitaciones: Passenger solo preparado localmente hasta probarlo en el panel real; capacidad, DNS/SSL, conectividad, Supabase Auth y aceptación completa pendientes. El gateway seguro no está implementado porque faltan endpoint y contrato autorizados.

Validación local (2026-11-06): `npm run build` PASS (TypeScript, rutas y Proxy incluidos); `npm test` 320 PASS, 15 SKIP, 0 FAIL. `node --check passenger.cjs` PASS. Arranque `node passenger.cjs` con build de producción: `/inicio` HTTP 200 y `/api/workspace` anónimo HTTP 401; proceso de comprobación detenido después. Esto no prueba Passenger, SSL ni servicios remotos. `npm run lint` global fue interrumpido tras varios minutos sin finalizar; no se declara PASS. No se ejecutó aceptación mediante subdominio, Auth remoto, generación IA real ni LMS institucional.

## Referencias

- Next local: `node_modules/next/dist/docs/01-app/02-guides/custom-server.md` y `self-hosting.md` (versión instalada).
- [cPanel Node.js](https://docs.cpanel.net/knowledge-base/web-services/how-to-install-a-node.js-application/) — disponibilidad depende del proveedor.
- [Passenger: reverse port binding](https://www.phusionpassenger.com/library/indepth/nodejs/reverse_port_binding.html).
- [Supabase: redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
