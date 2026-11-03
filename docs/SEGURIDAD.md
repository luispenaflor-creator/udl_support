# Seguridad y pendientes

La migración activa RLS y separa lectura por solicitante y personal en tablas principales. No publiques SUPABASE_SERVICE_ROLE_KEY ni tokens OAuth en variables públicas. El alta y asignación segura de perfiles requiere procedimiento administrativo confiable. Antes de producción, revisar políticas con usuarios de cada rol, añadir control de cambio de roles, verificación JWT Pub/Sub, token OAuth cifrado, rate limiting, respaldo, política de retención de archivos, antivirus, CSP y auditoría completa.
