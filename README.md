# SCORM Studio

Estudio web para transformar documentos PDF en actividades educativas editables y paquetes SCORM 1.2. El docente revisa fuentes, contenido y evaluación antes de exportar.

## Actividades

- **Quiz:** preguntas, opciones, explicaciones y referencias al documento.
- **Ruleta:** retos educativos organizados en segmentos interactivos.
- **Línea de tiempo:** secuencias y recorridos conceptuales; evaluación cuando las fuentes permiten establecer un orden.
- **Simulación:** escenarios y decisiones con criterios, feedback y resultados respaldados por fuentes.

Incluye extracción de PDF, preparación determinista, motor híbrido, edición, persistencia privada, revisiones, recuperación e historial. La calidad pedagógica requiere revisión docente; la validez técnica del paquete no sustituye su aceptación en el LMS de destino.

## Tecnologías y requisitos

Next.js 16, React, TypeScript, Tailwind CSS, Supabase Auth/PostgreSQL/Storage y Ollama remoto privado. Los paquetes SCORM incluyen su propio runtime de navegador.

Requiere Node.js **24 o superior**, npm, Supabase configurado y acceso autorizado a IA. Las versiones reproducibles están en `package-lock.json`.

## Instalación local

```sh
npm ci
```

Copiar `.env.example` a `.env.local` y configurar privadamente:

| Variables | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | URL y clave pública de Supabase |
| `APP_URL` | Origen exacto de la aplicación y enlaces Auth |
| `WORKSPACE_SIGNING_KEY` | 32 bytes aleatorios como 64 caracteres hexadecimales minúsculos; conservar entre reinicios |
| `AI_PROVIDER`, `AI_BASE_URL` | Proveedor y dirección accesible desde el servidor |
| `AI_MODEL`, `AI_FALLBACK_MODEL` | Modelos instalados; conservar configuración del proyecto |
| `AI_TIMEOUT_MS`, `AI_HEALTH_TIMEOUT_MS`, `OLLAMA_*` | Presupuestos y contexto; consultar `.env.example` |

No versionar secretos ni `.env.local`. Nunca poner claves secretas/service-role bajo `NEXT_PUBLIC_*`.

En Windows, antes de ejecutar herramientas PowerShell:

```powershell
. .\scripts\use-d-workspace.ps1
```

El script dirige temporales al workspace en D: sin modificar perfiles globales.

```sh
npm run dev
```

Abrir `http://localhost:3000`. Para comprobar producción:

```sh
npm run build
npm start
```

## Supabase y Ollama

Revisar `supabase/migrations/` antes de aplicarlas al entorno autorizado; no ejecutar cambios remotos automáticamente. Configurar Site URL, callbacks y recuperación. Mantener RLS, aislamiento docente y Storage privado. Ver [seguridad](docs/SECURITY_MODEL.md) y [configuración Supabase](docs/SUPABASE_SETUP.md).

Ollama se consume desde el servidor. El adaptador actual acepta únicamente HTTP loopback y no envía API key. En desarrollo puede usarse un túnel privado autorizado; producción debe funcionar sin depender del PC. Un gateway HTTPS autenticado requiere adaptar el transporte a su contrato antes de usarlo. No exponer Ollama sin controles ni cambiar modelos/prompts por restricciones de alojamiento. Ver [proveedor Ollama](docs/OLLAMA_PROVIDER.md).

## Verificación

```sh
npm run lint
npm run build
npm test
npm run test:integration
```

Los mocks no demuestran conexión real con Supabase u Ollama. Los checks remotos y de navegador requieren sus entornos autorizados; reportar pruebas omitidas. No incluir salidas generadas ni documentos privados en Git.

## Despliegue

Requiere Next.js completo: SSR, Proxy Auth, API, PDF y ZIP. Una exportación estática no conserva estas capacidades. Verificar Node, memoria, cargas, HTTPS y tiempos completos de IA.

No se ha confirmado compatibilidad de Hostinger Premium ni del hosting institucional. La [guía de hosting compartido](docs/SHARED_HOSTING_DEPLOYMENT.md) detalla requisitos, Passenger opcional, alternativa Node externa, diagnóstico y rollback. Publicar este repositorio no despliega la aplicación.

## Documentación

- [Arquitectura](docs/ARCHITECTURE.md)
- [Motor SCORM](docs/SCORM_ENGINE.md)
- [Motor híbrido](docs/HYBRID_EDUCATIONAL_ENGINE.md)
- [Evaluación respaldada por fuentes](docs/EDUCATIONAL_ASSESSMENT_DEPTH.md)

Los informes de fases documentan pruebas históricas y limitaciones; no garantizan el estado actual de servicios remotos ni aceptación en producción.
