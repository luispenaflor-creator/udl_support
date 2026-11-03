# Notificaciones por correo

UDL Support ya tiene programados los avisos por correo. **Están apagados hasta que configures un servidor SMTP** en las variables del servidor (Vercel o `.env.local`). Mientras no exista configuración, cada aviso se registra como *omitido* en **Configuración → Bitácora de correos**, y no se envía nada.

## Qué se notifica

| Evento | Quién recibe |
|---|---|
| Ticket creado | El solicitante (confirmación) y los agentes del plantel (o todos los agentes si el plantel no tiene) |
| Ticket tomado o asignado | El agente asignado y el solicitante |
| Mensaje público en el ticket | La contraparte: el solicitante si escribe soporte; el agente asignado (o los del plantel) si escribe el solicitante |
| Cambio de estado | El solicitante |
| Ticket resuelto | El solicitante, con la solución aplicada y el enlace para calificar |
| Escalación | Directivos del plantel y administradores |
| Escalación atendida | Quien escaló (agente o solicitante), con la respuesta |

Reglas: nunca se avisa a quien hizo la acción; las **notas internas no se envían**; se respeta la casilla *Recibir avisos por correo* de cada usuario (Usuarios y perfiles) y no se envía a cuentas desactivadas. El envío ocurre después de responder al usuario, para no hacer lenta la app.

## Requisitos

1. **`SUPABASE_SERVICE_ROLE_KEY`** configurada en el servidor (la app la usa para saber a quién avisar y escribir la bitácora).
2. **Migración** `supabase/migrations/202611060001_sla_prioridad_notificaciones.sql` ejecutada.
3. Un **servidor SMTP**. Recomendación: el buzón institucional `mesadeayuda@udlondres.com` de Google Workspace (opción A). Si TI prefiere un servicio de envío, la opción B funciona con el mismo código.

## Opción A (recomendada): Google Workspace con el buzón mesadeayuda@udlondres.com

Lo hace el administrador de Google Workspace de la universidad:

1. Entrar a <https://myaccount.google.com> **con la cuenta mesadeayuda@udlondres.com**.
2. **Seguridad → Verificación en 2 pasos**: activarla (es requisito para el paso 3). Si no aparece, el administrador de Workspace debe permitirla en *Consola de administración → Seguridad → Autenticación*.
3. **Seguridad → Contraseñas de aplicaciones** (o <https://myaccount.google.com/apppasswords>): crear una llamada *UDL Support*. Google muestra una contraseña de 16 letras **una sola vez**: cópiala directo a las variables (no por chat ni correo).
4. Variables del servidor:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=mesadeayuda@udlondres.com
SMTP_PASS=<contraseña de aplicación de 16 letras, sin espacios>
MAIL_FROM="UDL Support <mesadeayuda@udlondres.com>"
```

Límite de Google Workspace: alrededor de **2,000 correos por día** por cuenta. Si la organización bloquea las contraseñas de aplicación, usar la opción B.

## Opción B: servicio de envío transaccional (Resend, SendGrid, Amazon SES, Brevo…)

Útil si TI no permite contraseñas de aplicación o se espera mucho volumen. Ejemplo con Resend:

1. Crear cuenta y agregar el dominio `udlondres.com` (o un subdominio, p. ej. `avisos.udlondres.com`).
2. El área de TI agrega en el DNS los registros que indique el servicio (**SPF y DKIM**). Sin ellos los correos llegan a spam.
3. Crear una clave de API y configurar:

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=<clave de API>
MAIL_FROM="UDL Support <avisos@udlondres.com>"
MAIL_REPLY_TO=mesadeayuda@udlondres.com
```

## Probar

1. Reinicia el servidor (local: `npm run dev`; Vercel: *Redeploy*) para que lea las variables.
2. **Configuración → Correo saliente** debe mostrar *Configurado*.
3. Pulsa **Enviar correo de prueba a mi cuenta**. Revisa tu bandeja y spam.
4. Crea un ticket de prueba: en la **Bitácora de correos** deben aparecer los envíos como *enviado*. Si dice *fallido*, el texto del error indica la causa (usuario/contraseña, puerto, remitente no autorizado).

## Correo de recuperación de contraseña (Supabase Auth)

Es independiente de lo anterior: lo envía Supabase, no la app. Con el servicio integrado de Supabase el límite es muy bajo (unos pocos correos por hora). Para producción, en **Supabase → Authentication → Emails → SMTP Settings** activa *Custom SMTP* con los **mismos datos** (host, puerto, usuario, contraseña y remitente).

## Buenas prácticas

- Configura **DMARC** para el dominio junto con SPF y DKIM (TI).
- No reutilices la contraseña de aplicación en otro sistema; si se expone, revócala y crea otra.
- Las respuestas al correo **no** se integran al ticket todavía (eso es la integración Gmail API, pendiente). El pie de cada correo lo indica.
