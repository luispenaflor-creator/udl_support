// URL pública de la app para enlaces fuera de una petición (correos).
// Orden: APP_URL (solo servidor, se lee en tiempo de ejecución) → NEXT_PUBLIC_APP_URL → dominio de producción
// que Vercel expone automáticamente → localhost en desarrollo.
// Nota: las variables NEXT_PUBLIC_ se fijan al compilar; si se agregan después en Vercel hay que volver a desplegar.
export function siteUrl(): string {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const url = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || (vercel ? `https://${vercel}` : 'http://localhost:3000');
  return url.replace(/\/$/, '');
}
