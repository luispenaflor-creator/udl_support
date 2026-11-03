# Publicar UDL Support (GitHub + Vercel + Supabase)

Guía para pasar de la computadora local a una URL pública para pruebas con usuarios reales.

## 1. Base de datos: migraciones

En **Supabase → SQL Editor** deben estar ejecutadas, en este orden (todas se pueden repetir sin dañar datos, salvo la inicial):

1. `202610310001_initial.sql`
2. `202611020001_api_role_grants.sql`
3. `202611030001_perfil_agente_y_encuestas.sql`
4. `202611040001_usuarios_activos.sql`
5. `202611050001_planteles_escalaciones_asignacion.sql`
6. `202611060001_sla_prioridad_notificaciones.sql`
7. `202611060002_service_role_grants.sql` (permisos del servidor; sin ella no funcionan las notificaciones)
8. `202611070001_seguimiento_escalaciones_y_espera.sql` (seguimiento de escalaciones y reanudación al responder el solicitante)

Después revisa en **Configuración → SLA por prioridad** que los plazos sean los acordados con la institución.

## 2. Quitar los datos de demostración

1. Ejecuta `supabase/dev/limpiar_tickets_demo.sql` en el SQL Editor. Al final ambos conteos deben quedar en `0`.
2. Borra la carpeta `supabase/dev/` del proyecto (ya no se necesita).
3. Las ilustraciones de `public/avatars/` pueden quedarse: sirven como fotos de ejemplo al dar de alta agentes.

## 3. Subir el código a GitHub (repositorio privado)

1. Instala Git (una sola vez) y **cierra y vuelve a abrir la terminal**:

```bash
winget install --id Git.Git -e --source winget
```

2. Configura tu nombre y correo para los commits (una sola vez):

```bash
git config --global user.name "Tu Nombre"
```
```bash
git config --global user.email "tu-correo@udlondres.com"
```

3. Crea una cuenta en <https://github.com> (si no tienes) y un repositorio **privado** en <https://github.com/new>, sin README.
4. En la terminal, dentro de `C:\Proyectos\UDL_Support`:

```bash
git init
```
```bash
git add .
```
```bash
git commit -m "UDL Support: versión para pruebas"
```
```bash
git branch -M main
```
```bash
git remote add origin https://github.com/TU_USUARIO/udl-support.git
```
```bash
git push -u origin main
```

Antes del commit, comprueba con `git status` que **no** aparezca `.env.local` (el `.gitignore` lo excluye).

## 4. Crear el proyecto en Vercel

1. <https://vercel.com/new> → **Import** el repositorio. Vercel detecta Next.js; no cambies los comandos.
2. En **Environment Variables** agrega (para *Production* y *Preview*):

| Variable | Valor | Visibilidad |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase | pública |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | clave `sb_publishable_…` | pública |
| `NEXT_PUBLIC_APP_URL` | la URL final, p. ej. `https://udl-support.vercel.app` (sin `/` al final) | pública |
| `SUPABASE_SERVICE_ROLE_KEY` | clave secreta (`sb_secret_…` o `service_role`) | **solo servidor** |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | ver `docs/CORREO.md` | **solo servidor** |

   Si aún no tienes el correo listo, omite las `SMTP_*`: la app funciona y los avisos quedan como *omitidos*.
3. **Deploy**. Al terminar, si la URL asignada es distinta a la que pusiste en `NEXT_PUBLIC_APP_URL`, corrígela y vuelve a desplegar (*Deployments → … → Redeploy*).

## 5. Autorizar la URL en Supabase

**Supabase → Authentication → URL Configuration**:

- **Site URL**: `https://TU-URL.vercel.app`
- **Redirect URLs**: agrega `https://TU-URL.vercel.app/**`

Sin esto, los enlaces de recuperación de contraseña regresan a `localhost`.

Una vez configurada `SUPABASE_SERVICE_ROLE_KEY`, en **Authentication → Sign In / Providers** desactiva **Allow new users to sign up**: así solo el administrador crea cuentas (la app ya no necesita el registro público). Las cuentas sin perfil no pueden usar la app, pero conviene cerrar esa puerta.

Recomendado: **Authentication → Emails → SMTP Settings** con el mismo SMTP del correo (ver `docs/CORREO.md`), para que la recuperación de contraseña no tenga el límite bajo del servicio integrado.

## 6. Primeros usuarios

1. Entra con tu cuenta de administrador en la URL publicada.
2. **Administración → Planteles**: confirma el catálogo.
3. **Usuarios y perfiles → Dar de alta**: crea directivos y agentes con su plantel y puesto. Con la clave de servicio configurada la cuenta queda lista para entrar; comparte la contraseña temporal por un canal seguro.
4. Los solicitantes también se dan de alta ahí (no existe registro público).

## 7. Lista de verificación después de publicar

- [ ] Iniciar sesión y cerrar sesión con cada perfil (solicitante, agente, directivo, administrador).
- [ ] Recuperación de contraseña: el correo llega y el enlace abre la URL publicada.
- [ ] Solicitante crea ticket → aparece en *Disponibles para tomar* del agente.
- [ ] Agente toma el ticket (pasa a *En proceso*), responde y lo resuelve con solución.
- [ ] Solicitante califica la atención; la opinión aparece en **Opiniones**.
- [ ] Escalación de agente y de solicitante → aparecen en **Escalaciones** y se atienden.
- [ ] Descargas de Excel (Tickets, Reportes, Opiniones) se abren correctamente.
- [ ] **Configuración → Correo saliente**: correo de prueba recibido; la bitácora muestra *enviado*.
- [ ] Un directivo con plantel asignado solo ve datos de su plantel.

## Pendientes conocidos

- **Gmail entrante** (crear tickets respondiendo correos), **push** y **adjuntos** no están activos.
- El tiempo de espera de escalación del solicitante se valida en el servidor de la app, no en la base de datos.
- `npm audit` reporta avisos de severidad moderada en dependencias internas de `exceljs` (empaquetado del archivo). No afectan datos de usuarios, pero conviene revisarlos periódicamente.
- Supabase plan gratuito: el proyecto se pausa tras 7 días sin uso y tiene límites de base de datos y correo; para operación institucional considera un plan de pago y respaldos.
