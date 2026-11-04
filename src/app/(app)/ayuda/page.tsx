import Link from 'next/link';
import { access } from '@/lib/auth';
import { PRIORITY_LABEL, PRIORITY_ORDER, REQUESTER_STATUS_LABEL, STATUS_LABEL, STATUS_ORDER, type Priority, type Status } from '@/lib/dashboard';
import type { Role } from '@/lib/types';
import { Icon, type IconName } from '@/components/Icon';
import { StatusChip } from '@/components/dashboard';

type Step = { icon: IconName; title: string; text: string; href?: string; cta?: string };

const STEPS: Record<'solicitante' | 'agente' | 'direccion', Step[]> = {
  solicitante: [
    { icon: 'plus', title: 'Pide soporte', text: 'Pulsa «Pedir soporte», escribe qué pasa, elige el plantel y qué tan urgente es. Recibirás un folio (por ejemplo UDL-1A2B3C4D).', href: '/tickets/nuevo', cta: 'Pedir soporte' },
    { icon: 'hand', title: 'Un agente lo toma', text: 'Un integrante de soporte toma tu solicitud. Verás su nombre y foto, y te llegará un aviso con sonido.' },
    { icon: 'message', title: 'Conversen en el ticket', text: 'Todo se platica dentro del ticket. Si ves «Requiere tu respuesta», soporte necesita un dato tuyo: respóndelo y tu solicitud sigue avanzando sola.' },
    { icon: 'checkCircle', title: 'Recibe la solución', text: 'Cuando se resuelve, verás qué se hizo en el recuadro verde «Solución aplicada».' },
    { icon: 'star', title: 'Califica la atención', text: 'Elige de 1 a 5 estrellas. Tu opinión ayuda a mejorar el servicio.' },
  ],
  agente: [
    { icon: 'inbox', title: 'Revisa los disponibles', text: '«Disponibles para tomar» muestra los tickets que nadie atiende, ordenados por urgencia.', href: '/tickets?abiertos=1&asignado=sin', cta: 'Ver disponibles' },
    { icon: 'hand', title: 'Toma el ticket', text: 'Pulsa «Tomar ticket»: queda a tu nombre, pasa a «En proceso» y el solicitante recibe un aviso.' },
    { icon: 'message', title: 'Atiende y conversa', text: 'Responde en el ticket. Usa «Respuestas rápidas» para mensajes comunes y «Nota interna» para lo que el solicitante no debe ver.' },
    { icon: 'hourglass', title: '¿Te falta información?', text: 'Cambia el estado a «Esperando al solicitante» y escribe qué necesitas. Cuando responda, el ticket regresa solo a atención.' },
    { icon: 'checkCircle', title: 'Resuelve con la solución', text: 'Al marcarlo «Resuelto» escribe qué hiciste. El solicitante lo verá y podrá calificarte.' },
    { icon: 'alert', title: '¿Necesitas apoyo?', text: '«Escalar a dirección» envía el caso a tu director con el motivo (compras, autorizaciones, otra área).' },
  ],
  direccion: [
    { icon: 'home', title: 'Revisa el panel', text: 'Indicadores de volumen, vencidos y cumplimiento. Toca cualquier tarjeta o gráfica para ver los tickets.', href: '/', cta: 'Ir al panel' },
    { icon: 'zap', title: 'Atiende escalaciones', text: 'En «Escalaciones» registra seguimientos (puedes reasignar o subir prioridad). Siguen abiertas hasta que las cierres o se resuelva el ticket.', href: '/escalaciones', cta: 'Ver escalaciones' },
    { icon: 'users', title: 'Reasigna cuando haga falta', text: 'Desde el ticket, en «Gestionar», puedes asignarlo a otro agente. Los agentes no pueden reasignar.' },
    { icon: 'chart', title: 'Mide y descarga', text: '«Reportes» muestra tendencias y desempeño; descarga todo en Excel con los filtros aplicados.', href: '/reportes', cta: 'Ver reportes' },
    { icon: 'star', title: 'Escucha a los usuarios', text: '«Opiniones» reúne las calificaciones; filtra por estrellas para dar seguimiento a las bajas.', href: '/opiniones', cta: 'Ver opiniones' },
  ],
};

const STATUS_HELP: Record<Status, { staff: string; requester: string }> = {
  nuevo: { staff: 'Recién creado; nadie lo ha tomado.', requester: 'Recibimos tu solicitud; pronto un agente la tomará.' },
  abierto: { staff: 'Pendiente de atención.', requester: 'Tu solicitud está en la fila de atención.' },
  en_progreso: { staff: 'Un agente lo está atendiendo.', requester: 'Un agente está trabajando en ello.' },
  en_espera: { staff: 'Soporte espera un dato del solicitante. Vuelve a atención cuando responde.', requester: 'Soporte necesita un dato tuyo. Responde en el ticket para continuar.' },
  resuelto: { staff: 'Se aplicó una solución (registrada en el ticket).', requester: 'Ya quedó; revisa la solución y califica la atención.' },
  cerrado: { staff: 'Terminado.', requester: 'Terminado.' },
};

const SLA_HINT: Record<Priority, string> = {
  urgente: 'Detiene clases o la operación de un área',
  alta: 'Afecta a varias personas o un servicio importante',
  media: 'Afecta el trabajo de una persona',
  baja: 'Consulta o mejora sin urgencia',
};
const DEFAULT_SLA: Record<Priority, { first: number; resolve: number }> = { urgente: { first: 1, resolve: 4 }, alta: { first: 4, resolve: 24 }, media: { first: 8, resolve: 48 }, baja: { first: 24, resolve: 72 } };
const hours = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : h >= 48 ? `${Math.round(h / 24)} días` : `${h} h`);

export default async function Help() {
  const { s, p } = await access();
  const role = p.role as Role;
  const requester = role === 'solicitante';
  const steps = requester ? STEPS.solicitante : role === 'agente' ? STEPS.agente : STEPS.direccion;
  // El solicitante no puede leer la configuración; se muestran los plazos institucionales por defecto.
  const { data: cfg } = requester ? { data: null } : await s.from('app_settings').select('sla_policy').eq('id', 1).maybeSingle();
  const sla = { ...DEFAULT_SLA, ...((cfg?.sla_policy as typeof DEFAULT_SLA | undefined) ?? {}) };

  return (
    <div className="dash help">
      <header className="hero glass reveal">
        <div className="hero-text">
          <span className="eyebrow"><Icon name="sparkle" size={14} /><span className="eyebrow-text">Guía rápida</span></span>
          <h1>¿Cómo funciona <span className="grad">UDL Support</span>?</h1>
          <p className="muted help-lead">
            {requester
              ? 'Aquí pides ayuda a soporte técnico de la universidad y sigues tu solicitud de principio a fin, sin llamadas ni correos sueltos.'
              : role === 'agente'
                ? 'Aquí recibes las solicitudes de la comunidad, las atiendes y dejas constancia de cada paso.'
                : 'Aquí supervisas el servicio de soporte: escalaciones, tiempos de atención, desempeño y opiniones.'}
          </p>
        </div>
      </header>

      <section className="help-steps">
        {steps.map((st, i) => (
          <article key={st.title} className="glass help-step reveal" style={{ '--d': `${80 + i * 60}ms` } as React.CSSProperties}>
            <span className="step-n">{i + 1}</span>
            <span className="step-icon"><Icon name={st.icon} size={22} /></span>
            <h2>{st.title}</h2>
            <p>{st.text}</p>
            {st.href && <Link href={st.href} className="link-more">{st.cta}<Icon name="arrowRight" size={14} /></Link>}
          </article>
        ))}
      </section>

      <div className="grid-main">
        <section className="glass panel reveal" style={{ '--d': '300ms' } as React.CSSProperties}>
          <header className="panel-head"><h2><Icon name="list" size={18} />Qué significa cada estado</h2></header>
          <ul className="help-states">
            {STATUS_ORDER.map((st) => (
              <li key={st}>
                <StatusChip status={st} audience={requester ? 'solicitante' : 'staff'} />
                <span>{requester ? STATUS_HELP[st].requester : STATUS_HELP[st].staff}</span>
              </li>
            ))}
          </ul>
          {!requester && <p className="muted small-print">El solicitante ve los mismos estados con otras palabras; por ejemplo, «{STATUS_LABEL.en_espera}» le aparece como «{REQUESTER_STATUS_LABEL.en_espera}».</p>}
        </section>

        <section className="glass panel reveal" style={{ '--d': '360ms' } as React.CSSProperties}>
          <header className="panel-head"><h2><Icon name="timer" size={18} />Tiempos de atención</h2></header>
          <ul className="help-sla">
            {PRIORITY_ORDER.map((pr) => (
              <li key={pr}>
                <span className={`chip pr-${pr}`}>{PRIORITY_LABEL[pr]}</span>
                <span><b>Resolución en {hours(sla[pr].resolve)}</b><small>{SLA_HINT[pr]} · primera respuesta en {hours(sla[pr].first)}</small></span>
              </li>
            ))}
          </ul>
          <p className="muted small-print">La barra de color de cada ticket muestra cuánto tiempo queda: verde a tiempo, ámbar por vencer, roja vencido.</p>
        </section>

        <section className="glass panel reveal" style={{ '--d': '420ms' } as React.CSSProperties}>
          <header className="panel-head"><h2><Icon name="bell" size={18} />Avisos</h2></header>
          <ul className="help-list">
            <li><Icon name="bell" size={16} /><span>La <b>campana</b> muestra los cambios de tus tickets: mensajes, asignaciones, estados y escalaciones. El número indica cuántos no has visto.</span></li>
            <li><Icon name="sparkle" size={16} /><span>Cuando algo cambia suena un aviso y aparece un recuadro en la esquina. Puedes apagar el sonido desde la campana.</span></li>
            <li><Icon name="mail" size={16} /><span>Si das permiso al navegador («Avisar aunque esté en otra pestaña»), también te avisará cuando tengas otra ventana abierta.</span></li>
          </ul>
        </section>

        <section className="glass panel reveal" style={{ '--d': '480ms' } as React.CSSProperties}>
          <header className="panel-head"><h2><Icon name="message" size={18} />Preguntas frecuentes</h2></header>
          <dl className="faq">
            {requester ? <>
              <dt>¿Qué prioridad elijo?</dt><dd>Urgente solo si se detienen clases o un área completa. Si solo te afecta a ti, elige Media.</dd>
              <dt>Nadie me atiende, ¿qué hago?</dt><dd>En tu ticket aparece «Escalar ticket». Se activa después de un tiempo según la prioridad y avisa a dirección.</dd>
              <dt>¿Puedo agregar información después?</dt><dd>Sí, escribe en la conversación del ticket; soporte recibe un aviso.</dd>
            </> : <>
              <dt>¿Por qué no puedo asignar un ticket a otro agente?</dt><dd>La reasignación la hace dirección para equilibrar la carga. Si necesitas apoyo, escala el ticket.</dd>
              <dt>¿Qué ve el solicitante?</dt><dd>Los mensajes públicos, el estado, el agente asignado y la solución. Las notas internas no.</dd>
              <dt>¿Cuándo se cierra una escalación?</dt><dd>Cuando dirección la cierra o automáticamente al resolver el ticket. Mientras tanto queda «En seguimiento».</dd>
            </>}
          </dl>
        </section>
      </div>
    </div>
  );
}
