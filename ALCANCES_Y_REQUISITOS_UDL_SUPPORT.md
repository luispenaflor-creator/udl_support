# UDL Support — alcances, propósito y guía de mejora para Cloud

**Proyecto:** mesa de ayuda de la Universidad de Londres  
**Carpeta de trabajo:** `C:\Proyectos\UDL_Support`  
**Documento preparado:** 2 de noviembre de 2026  
**Destinatario:** Codex Cloud / asistente de desarrollo que continúe el proyecto

## Instrucción principal para Cloud

Trabaja directamente sobre la carpeta existente `C:\Proyectos\UDL_Support`. Inspecciona primero sus archivos y conserva su arquitectura, datos, configuración local y conexión Supabase. Implementa una mejora completa, coherente y funcional del producto y su interfaz; no te limites a entregar una propuesta, una lista de fases o pantallas de demostración. No pidas al usuario que apruebe cada fase ni que repita datos que ya están documentados aquí.

Haz en una sola tarea continua los cambios necesarios, ejecuta pruebas, revisión de tipos y compilación, corrige los errores que encuentres y al final entrega un resumen claro de cambios y pendientes. Si una integración depende de una cuenta o autorización que no está disponible, continúa con el resto del trabajo, deja su configuración preparada y explica exactamente qué falta. Nunca afirmes que un servicio externo está conectado o funcionando sin comprobarlo.

Protege los archivos locales. **No leas, imprimas, reemplaces ni subas `.env.local`; no copies sus secretos a código, capturas, documentación, logs, GitHub o Vercel.** Mantén las claves secretas solo del lado servidor. No borres ni reinicialices la base de datos o los datos existentes. Antes de cambiar políticas de seguridad o ejecutar migraciones, comprueba su efecto y conserva el acceso del administrador actual.

## Propósito del proyecto

UDL Support debe concentrar las solicitudes de soporte tecnológico de los ocho planteles de la Universidad de Londres en una aplicación web. Debe permitir que la comunidad registre solicitudes y consulte su avance, que el equipo de soporte las clasifique y resuelva con seguimiento y SLA, y que directivos y administración puedan supervisar el servicio con información visual y confiable.

El correo inicial para recibir solicitudes es **mesadeayuda@udlondres.com**. La dirección se guarda como configuración de la aplicación y debe poder cambiarse desde el panel de administración. Ese valor, por sí solo, no conecta Gmail ni recibe correos: la integración de correo requiere configuración y autorización de Google Workspace.

## Alcance funcional deseado

### Gestión de solicitudes

- Crear un ticket con folio único, asunto, descripción, categoría, prioridad, plantel, solicitante, fechas y estado.
- Mostrar al solicitante únicamente sus propios tickets y sus comentarios permitidos.
- Permitir a soporte consultar una bandeja de pendientes y asignar tickets a una persona agente; usar una lista de agentes, no pedir al usuario que capture manualmente un UUID.
- Mantener conversación y actividad dentro de cada ticket, con comentarios públicos y notas internas claramente diferenciadas.
- Definir transiciones de estado válidas y conservar quién hizo cada cambio y cuándo.
- Buscar, filtrar y ordenar por folio, asunto, estado, prioridad, categoría, agente, plantel y fecha.
- Adjuntar archivos permitidos con límites de tipo y tamaño; protegerlos con políticas de Storage y autorización por ticket.
- Permitir escalamiento por prioridad, antigüedad, riesgo de vencimiento de SLA y falta de asignación. Cada escalamiento debe quedar registrado.
- Permitir cerrar o resolver solicitudes y, cuando corresponda, enviar una encuesta de satisfacción al solicitante.

### SLA y supervisión

- Configurar tiempos de primera respuesta y resolución desde administración.
- Mostrar fecha límite, tiempo restante y estado del SLA en tarjetas y en el detalle del ticket.
- Distinguir tickets dentro de SLA, próximos a vencer y vencidos; usar texto/icono además del color.
- Definir si los SLA se calculan con horas corridas o con calendario laboral y feriados. Actualmente son horas corridas; Cloud debe conservar esa lógica hasta que se implemente explícitamente un calendario laboral.
- Hacer los cálculos de indicadores con datos reales, filtros visibles y definiciones documentadas; no presentar cifras de ejemplo como datos reales.

### Notificaciones y seguimiento

- Preparar notificaciones de creación, asignación, comentario, cambio de estado, escalamiento y vencimiento de SLA.
- Diferenciar correo transaccional, notificación push y recepción de mensajes entrantes.
- Mantener preferencias y destinatarios configurables; registrar intentos y fallos para poder diagnosticar entregas.
- No enviar correos ni push hasta configurar y probar el proveedor correspondiente.

### Auditoría y reportes

- Registrar cambios de configuración, asignaciones, transiciones, escalaciones, comentarios internos y acciones administrativas.
- Incluir reportes por estado, prioridad, categoría, plantel, agente, cumplimiento SLA, volumen y tiempos de resolución.
- Permitir filtros por periodo y campus, y exportación cuando esté implementada.
- Respetar el ámbito del perfil al consultar o exportar datos.

## Perfiles y responsabilidades

Los perfiles previstos en la base son `solicitante`, `agente`, `directivo` y `administrador`.

| Perfil | Funciones que debe ofrecer | Ámbito esperado |
|---|---|---|
| **Solicitante** | Crear solicitudes, consultar el avance de sus tickets, responder y adjuntar evidencia permitida, recibir notificaciones y contestar encuestas de cierre. | Solo sus propios tickets y la información pública asociada. |
| **Agente** | Ver su bandeja de trabajo y solicitudes sin asignar; tomar o asignar tickets; cambiar estados permitidos; comunicarse con solicitantes y dejar notas internas; vigilar SLA y escalar casos. | Tickets asignados o disponibles para atención, conforme a las reglas institucionales. |
| **Directivo** | Consultar dashboards y reportes, revisar carga, SLA y tendencias de su campus, y dar seguimiento de supervisión. | **Por campus** según su perfil, salvo que la institución autorice expresamente un alcance global. |
| **Administrador** | Administrar perfiles, roles, campus, configuración, correo de soporte, SLA, catálogos y parámetros globales; revisar auditoría y salud de integraciones. | Todos los campus y configuración institucional. |

### Diferencias entre el objetivo y el comportamiento actual

- La aplicación ya define los cuatro perfiles y las reglas RLS existentes permiten a `directivo` y `administrador` consultar tickets de todos los planteles. La tabla de perfiles tiene `campus`, pero las políticas actuales no aplican separación de datos para directivos por campus. **Revisar y ajustar RLS antes de producción** para aplicar el ámbito esperado, manteniendo una excepción global solo para administración.
- La base restringe al solicitante a sus tickets. La interfaz permite al personal cambiar estado y capturar el ID del agente manualmente; reemplazar esto con controles guiados y una lista de agentes autorizados.
- El menú de configuración existe para administradores, pero aún no hay un módulo de administración de usuarios completo.
- No asumir que las políticas SQL actuales cubren automáticamente toda función futura. Cada endpoint, acción de servidor, consulta y operación de Storage debe validar rol, campus y pertenencia al ticket.

## Dashboards y estilo visual solicitado

Los dashboards son una prioridad. Deben ser **muy visuales e intuitivos**, con tarjetas claras, jerarquía visual y acciones fáciles de encontrar. Evita una pantalla que sea solo una tabla o un conjunto de números sin contexto.

### Panel de solicitante

- Tarjetas: tickets abiertos, esperando respuesta, resueltos y accesos recientes.
- Acción principal visible: **Crear ticket**.
- Lista visual de solicitudes recientes con folio, asunto, estado, prioridad y última actualización.
- Indicador sencillo del siguiente paso o de quién tiene la acción pendiente.

### Panel de agente

- Tarjetas: sin asignar, asignados a mí, próximos a vencer SLA y vencidos.
- Gráfica de tickets por estado y prioridad; cola priorizada por urgencia y vencimiento.
- Filtros rápidos por campus, categoría y agente, de acuerdo con los permisos.
- Acción visible para tomar/asignar ticket y continuar la conversación.

### Panel de directivo

- Tarjetas: volumen del periodo, abiertos, vencidos, porcentaje de cumplimiento SLA y tiempo promedio de resolución.
- Gráficas comparables por estado, prioridad, categoría y plantel autorizado.
- Filtros de periodo y campus con el alcance mostrado claramente.
- Evitar datos personales que el directivo no necesite para supervisión.

### Panel de administrador

- Tarjetas de salud operativa: solicitudes activas, vencimientos, cobertura por campus, cumplimiento SLA e integraciones configuradas/pendientes.
- Atajos a usuarios, catálogos, SLA, correo de soporte, políticas y auditoría.
- Mostrar con claridad si Gmail, Pub/Sub, correo SMTP o push están pendientes, configurados o probados.

### Reglas visuales y de interacción

- Mantener identidad institucional sobria: azul UDL como color de acción, fondos claros, tarjetas con bordes y sombras ligeras, tipografía legible y espacios consistentes.
- Usar iconos coherentes y etiquetas en español. Estados y prioridades deben tener chips legibles, con color, texto e icono; nunca depender solo del color.
- Incorporar efectos discretos: elevación/sombra al pasar sobre tarjetas, transiciones suaves, animación breve al cargar indicadores y barras de progreso para SLA. Los efectos deben ayudar a entender la interfaz, no distraer.
- Respetar `prefers-reduced-motion`; toda animación debe poder reducirse o desactivarse.
- Diseñar primero para escritorio, pero asegurar uso cómodo en móvil y tablet. Las tarjetas deben reorganizarse con columnas adaptables.
- Incluir estados de carga, vacío, error y éxito; evitar pantallas en blanco y mensajes técnicos para usuarios finales.
- Asegurar navegación con teclado, foco visible, contraste suficiente, etiquetas de formulario y botones con estados disabled/loading.
- Usar gráficas accesibles con valores y leyendas visibles; si se añade una biblioteca, justificarla y mantenerla ligera.
- No agregar datos ficticios en los dashboards. Los resultados vacíos deben explicarse con una invitación a crear o filtrar solicitudes.

## Planteles y catálogos actuales

Planteles incluidos en el tipo y migración: **Centro, Roma, San Ángel, Coapa, Insurgentes, Reforma, Satélite y Zaragoza**.

Categorías disponibles en el formulario actual: **Hardware, Software, Red, Correo, Accesos y Otro**.  
Prioridades actuales: **baja, media, alta y urgente**.  
Estados de base actuales: **nuevo, abierto, en progreso, en espera, resuelto y cerrado**.

## Tecnologías y conexiones actuales

| Componente | Estado comprobado en el proyecto | Observaciones |
|---|---|---|
| **Next.js App Router** | Implementado | Aplicación web, rutas de panel, tickets, administración, reportes y rutas de autenticación. Versión declarada: 16.4.2. |
| **React + TypeScript** | Implementado | React 19.3.1 y TypeScript; estilos propios en `src/app/globals.css`. |
| **Supabase Auth** | Implementado | Inicio de sesión con correo/contraseña, recuperación de contraseña y verificación de sesión/perfil. No guardar contraseñas en la aplicación. |
| **Supabase PostgreSQL** | Implementado | Esquema con perfiles, configuración, tickets, comentarios, eventos, auditoría, encuestas, correo, push y adjuntos. Migraciones en `supabase/migrations/`. |
| **Row Level Security (RLS)** | Implementado en SQL | Hay políticas por perfil. Corregir y probar el alcance por campus para directivos antes de producción. Los privilegios de tabla y las políticas RLS deben mantenerse juntos. |
| **Supabase Storage** | Preparado parcialmente | Se crea el bucket privado `ticket-files` y políticas de lectura/subida; todavía no hay flujo completo de carga desde la interfaz. |
| **Supabase API / variables locales** | Conectado localmente | `.env.local` contiene la URL y clave publicable del proyecto. No copiar sus valores a este documento ni al repositorio. |
| **GitHub** | No confirmado como conectado | La carpeta contiene el código; revisar el estado del repositorio antes de publicarlo. |
| **Vercel** | No confirmado como desplegado | Es el destino previsto, pero no afirmar despliegue activo hasta verificar proyecto, variables y dominio. |
| **Google APIs (`googleapis`)** | Dependencia instalada, integración pendiente | No existe aún flujo OAuth Gmail funcional ni autorización del buzón. |
| **Gmail API, Gmail Watch/History API y Pub/Sub** | Pendientes | Las tablas de configuración/ingestión existen; faltan proyecto Google Cloud, scopes, topic/subscription, endpoint validado, sincronización, renovación de Watch, deduplicación y pruebas. |
| **Correo SMTP de Supabase Auth** | No confirmado como configurado | La entrega de recuperación de contraseña usó el servicio integrado de Supabase, que tiene un límite bajo. SMTP personalizado para `mesadeayuda@udlondres.com` requiere autorización y credenciales de Google Workspace o proveedor SMTP. |
| **Notificaciones de tickets por correo** | Pendientes | No confundirlas con el SMTP transaccional de Supabase Auth ni con Gmail entrante. |
| **Web Push (`web-push`)** | Dependencia instalada, envío pendiente | Faltan claves VAPID, suscripciones de navegador, servicio de envío y pruebas. |
| **Encuestas** | Parcial / esquema solamente | La tabla existe; falta flujo de envío, respuesta, interfaz y reporte. |
| **Escalamiento automático** | Pendiente | No hay cron, cola o proceso programado conectado que escale tickets vencidos. |

### Variables de entorno previstas

Las variables y nombres están en `.env.example`. Las más relevantes son `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL`, credenciales de Google OAuth, tópico Pub/Sub, secreto de ingestión de Gmail y claves VAPID. Las credenciales están pendientes salvo la configuración local ya creada por el propietario. Las variables `SUPABASE_SERVICE_ROLE_KEY`, tokens OAuth y claves privadas deben permanecer exclusivamente en el servidor.

## Funcionalidades visibles hoy

- Login, cierre de sesión y panel protegido por autenticación.
- Panel inicial con resumen de tickets recientes e indicadores básicos.
- Creación de tickets con asunto, categoría, prioridad, campus y descripción.
- Listado y detalle de ticket con comentarios.
- Personal de soporte puede cambiar estado/asignación; la asignación actual pide un ID manual.
- Configuración de correo inicial y horas objetivo de primera respuesta/resolución.
- Reporte básico con conteos, cumplimiento SLA simple y planteles involucrados.
- Pruebas automatizadas básicas y comprobación de tipos disponibles en `package.json`.

## Pendientes prioritarios para continuar el desarrollo

1. Hacer el panel visual por perfil con tarjetas, gráficas sencillas, filtros, estados de carga/vacío/error y diseño adaptable.
2. Corregir asignación para elegir agentes y completar permisos por campus/rol en interfaz, servidor, RLS y Storage.
3. Completar vistas operativas de colas, comentarios internos, historial y transiciones válidas.
4. Mostrar SLA y riesgo de vencimiento de forma visual; decidir con la institución el calendario laboral antes de automatizar.
5. Terminar administración de usuarios y campus, catálogos y auditoría consultable.
6. Implementar adjuntos, encuestas y notificaciones con controles de seguridad.
7. Integrar Gmail API/OAuth, Pub/Sub y Gmail History API después de contar con permisos de Workspace y Google Cloud.
8. Configurar SMTP transaccional por separado; verificar el remitente institucional y los límites del proveedor.
9. Confirmar GitHub/Vercel, definir variables por ambiente, URL de Auth y pruebas en despliegue.

## Validación y entrega esperada de Cloud

- Ejecutar `npm run typecheck`, `npm test` y `npm run build`; detener el servidor local antes del build si mantiene ocupado `.next`.
- Corregir errores que encuentre y añadir pruebas para permisos, flujos de tickets y componentes críticos. No declarar una prueba de integración con Gmail, Pub/Sub, Storage o Vercel si no se ejecutó con credenciales y servicios reales.
- Verificar que el login, recuperación de contraseña, paneles y RLS sigan funcionando después de los cambios.
- Revisar que ningún secreto, token, contraseña, correo personal de pruebas o dato de ejemplo quede expuesto en el cliente o documentación.
- Entregar resumen final en español: archivos modificados, pantallas mejoradas, funciones terminadas, comandos de validación y resultados, conexiones realmente probadas y pendientes que requieren acceso institucional.

