# Verificación de la entrega

Entorno: Node.js v26.13.0, npm 11.20.0, Next.js 16.4.2, React 19.3.1. Se fijó una versión activa y mantenida de Next.js; la política oficial sitúa 16.x en Active LTS.

Instalación limpia reproducida con npm ci --ignore-scripts --no-audit --no-fund.

- npm run typecheck: correcto.
- npm test: correcto, 3 pruebas aprobadas.
- npm run build: correcto, compilación optimizada, verificación de tipos y generación estática completadas.

Las pruebas automatizadas son verificaciones básicas de catálogo de planteles, dirección inicial y activación de RLS de tickets. No equivalen a pruebas integrales de Auth, permisos, Gmail, Pub/Sub, encuestas ni notificaciones.
