# Configuración Supabase
Configurar NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, APP_URL y WORKSPACE_SIGNING_KEY mediante un entorno privado. El repositorio no incluye credenciales.
Revisar supabase/migrations antes de aplicarlas al proyecto autorizado. Configurar el origen público y callbacks Auth de confirmación y recuperación, verificar entrega de correo y cookies HTTPS. Conservar RLS y Storage privado.
Los checks remotos son opt-in y requieren credenciales proporcionadas por canal seguro. No ejecutar migraciones ni pruebas que escriban datos sin autorización.
