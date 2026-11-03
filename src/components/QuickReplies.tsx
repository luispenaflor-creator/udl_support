'use client';

import { Icon } from './Icon';

// Respuestas frecuentes del personal. {nombre} se sustituye por el nombre del solicitante.
const REPLIES = [
  { label: 'Acuse de recibo', text: 'Hola {nombre}, recibimos tu solicitud y ya la estamos revisando. Te avisaremos por este medio en cuanto tengamos novedades.' },
  { label: 'Pedir más información', text: 'Hola {nombre}, para avanzar necesitamos algunos datos adicionales: ¿podrías indicarnos el equipo o aula afectada y, si es posible, adjuntar una captura del mensaje de error?' },
  { label: 'Visita programada', text: 'Hola {nombre}, programamos una visita técnica para revisar el problema en sitio. Te confirmaremos el horario antes de acudir.' },
  { label: 'Solución aplicada', text: 'Hola {nombre}, aplicamos la solución y el servicio ya debería funcionar con normalidad. ¿Nos confirmas que todo quedó bien?' },
  { label: 'Cierre por falta de respuesta', text: 'Hola {nombre}, al no recibir respuesta damos por resuelta la solicitud. Si el problema persiste, responde a este ticket y lo reabriremos.' },
];

export function QuickReplies({ target, name }: { target: string; name: string }) {
  return (
    <label className="quick-replies">
      <Icon name="zap" size={15} />
      <span className="sr-only">Insertar respuesta rápida</span>
      <select
        defaultValue=""
        onChange={(e) => {
          const r = REPLIES[Number(e.target.value)];
          const box = document.getElementById(target) as HTMLTextAreaElement | null;
          if (r && box) {
            box.value = r.text.replaceAll('{nombre}', name.split(' ')[0] || '');
            box.focus();
          }
          e.target.value = '';
        }}
      >
        <option value="" disabled>Respuestas rápidas…</option>
        {REPLIES.map((r, i) => <option key={r.label} value={i}>{r.label}</option>)}
      </select>
    </label>
  );
}
