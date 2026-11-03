// Reglas de escalación. Sin dependencias para poder probarse con Node directamente.
import type { Priority, Status } from './dashboard';

// Urgente sin agente asignado: el solicitante puede escalar a los 15 minutos de crear el ticket.
export const URGENT_UNASSIGNED_MIN = 15;
// Después, o para las demás prioridades, una escalación por intervalo mientras el ticket siga abierto.
export const ESCALATION_INTERVAL_MIN: Record<Priority, number> = { urgente: 60, alta: 120, media: 240, baja: 480 };
export const MIN_REASON = 10;

type T = { status: Status; priority: Priority; created_at: string; assignee_id: string | null };

export function requesterEscalation(t: T, lastEscalationAt: string | null, now = Date.now()): { allowed: boolean; availableAt: number | null; rule: string } {
  if (t.status === 'resuelto' || t.status === 'cerrado') return { allowed: false, availableAt: null, rule: 'El ticket ya está resuelto o cerrado.' };
  const first = !lastEscalationAt;
  const urgentFast = first && t.priority === 'urgente' && !t.assignee_id;
  const waitMin = urgentFast ? URGENT_UNASSIGNED_MIN : ESCALATION_INTERVAL_MIN[t.priority];
  const base = new Date(lastEscalationAt ?? t.created_at).getTime();
  const availableAt = base + waitMin * 60_000;
  const every = ESCALATION_INTERVAL_MIN[t.priority] / 60;
  const rule = urgentFast
    ? `Urgente sin agente: puedes escalar a los ${URGENT_UNASSIGNED_MIN} minutos de creado.`
    : `Prioridad ${t.priority}: puedes escalar cada ${every} ${every === 1 ? 'hora' : 'horas'} mientras siga abierto.`;
  return { allowed: now >= availableAt, availableAt, rule };
}

export function waitText(ms: number): string {
  const m = Math.ceil(ms / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
