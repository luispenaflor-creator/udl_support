# UDL Support

Mesa de ayuda institucional Universidad de Londres. Next.js/TypeScript, Supabase Auth/PostgreSQL/Storage/RLS y Vercel.

Incluye cuatro perfiles (solicitante, agente, directivo, administrador), ocho planteles, tickets, comentarios, folio, prioridades, panel, resumen de SLA, reportes básicos y correo inicial configurable mesadeayuda@udlondres.com. SQL incluye auditoría, eventos, encuestas, ingestión, push y adjuntos.

## Inicio local

Sigue la guía [Primer inicio en Windows](docs/INICIO_PASO_A_PASO.md). Requiere Node.js 20.9 o posterior. Crea tu proyecto Supabase, ejecuta la migración SQL, crea un usuario administrador, llena NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en .env.local. Después ejecuta npm ci y npm run dev; abre http://localhost:3000.

## GitHub y Vercel

Crea un repositorio GitHub. En carpeta ejecuta git init, git add ., git commit -m "UDL Support inicial", git branch -M main, git remote add origin URL_DEL_REPOSITORIO, git push -u origin main. En vercel.com importa el repositorio mediante Add New Project. Configura variables NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY y NEXT_PUBLIC_APP_URL; nunca expongas la service role key al navegador. Pulsa Deploy. Añade el dominio Vercel a Supabase Authentication URL Configuration. Valida las cuentas de cada perfil.

## Limitaciones

Gmail API, Gmail Watch/History, Google Cloud Pub/Sub, envío de correo, OAuth, push real, encuestas y carga de adjuntos no están completos ni activos. Las credenciales y autorizaciones externas siguen pendientes. El correo configurable del panel no autoriza por sí mismo una cuenta Google. SLA usa horas corridas; reportes son básicos. Requiere revisión técnica y de seguridad antes de producción. Consulta docs/GOOGLE_WORKSPACE.md y docs/SEGURIDAD.md.
