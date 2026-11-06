# Seguridad
Las páginas y API privadas requieren sesión. Las operaciones de workspace verifican propiedad docente y usan RLS y buckets privados. Mantener las migraciones y permisos revisados; no aplicar cambios remotos sin autorización.
WORKSPACE_SIGNING_KEY protege la integridad de preparaciones canónicas. Debe ser privada y estable entre reinicios. Las claves públicas de Supabase no sustituyen autorización. Nunca usar service-role en el navegador. No registrar documentos, contraseñas ni tokens.
Probar aislamiento entre dos docentes, recuperación de sesión y descargas protegidas antes de producción.
