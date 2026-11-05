// Filtros de la lista de tickets compartidos entre la página y la exportación CSV.
import {
  CATEGORIES, PERIODS, PRIORITY_ORDER, STATUS_ORDER, periodStart, sla, urgencyQueue,
  type Status, type TicketFilter, type TicketRow,
} from './dashboard';
import type { access } from './auth';
import { fetchAll } from './fetchAll';

type Ctx = Awaited<ReturnType<typeof access>>;

export const TICKET_COLS = 'id,folio,subject,status,priority,campus,category,created_at,updated_at,resolution_due_at,resolved_at,assignee_id,requester_id,assigned_at,area';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Solo se aceptan valores conocidos; cualquier otro parámetro se ignora.
export function parseFilter(raw: TicketFilter, ctx: { role: string; campus: string | null; campuses: readonly string[] }) {
  const staff = ctx.role !== 'solicitante';
  const lockedCampus = ctx.role === 'directivo' && ctx.campus ? ctx.campus : null;
  const estados = (raw.estado ?? '').split(',').filter((x): x is Status => (STATUS_ORDER as string[]).includes(x));
  const f: TicketFilter = {
    estado: estados.join(',') || undefined,
    prioridad: (PRIORITY_ORDER as string[]).includes(raw.prioridad ?? '') ? raw.prioridad : undefined,
    categoria: (CATEGORIES as readonly string[]).includes(raw.categoria ?? '') ? raw.categoria : undefined,
    campus: lockedCampus ?? (ctx.campuses.includes(raw.campus ?? '') ? raw.campus : undefined),
    sla: raw.sla === 'vencido' || raw.sla === 'riesgo' ? raw.sla : undefined,
    asignado: staff && (raw.asignado === 'sin' || raw.asignado === 'mio') ? raw.asignado : undefined,
    agente: staff && UUID.test(raw.agente ?? '') ? raw.agente : undefined,
    abiertos: raw.abiertos === '1' ? '1' : undefined,
    periodo: PERIODS.some((x) => x.key === raw.periodo) ? raw.periodo : undefined,
    q: (raw.q ?? '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().slice(0, 60) || undefined,
  };
  return { f, estados, staff, lockedCampus };
}

export async function queryTickets(ctx: Ctx, f: TicketFilter, limit: number) {
  const { s, p, user } = ctx;
  const estados = (f.estado ?? '').split(',').filter(Boolean);
  const build = () => {
    let q = s.from('tickets').select(TICKET_COLS).order('created_at', { ascending: false }).order('id');
    if (p.role === 'solicitante') q = q.eq('requester_id', user.id);
    if (estados.length) q = q.in('status', estados);
    if (f.abiertos || f.sla) q = q.not('status', 'in', '(resuelto,cerrado)');
    if (f.prioridad) q = q.eq('priority', f.prioridad);
    if (f.categoria) q = q.eq('category', f.categoria);
    if (f.campus) q = q.eq('campus', f.campus);
    if (f.asignado === 'sin') q = q.is('assignee_id', null);
    if (f.asignado === 'mio') q = q.eq('assignee_id', user.id);
    if (f.agente) q = q.eq('assignee_id', f.agente);
    if (f.periodo) { const since = periodStart(f.periodo).since; if (since) q = q.gte('created_at', since); }
    if (f.q) q = q.or(`subject.ilike.%${f.q}%,folio.ilike.%${f.q}%`);
    return q;
  };
  // Paginado: la API devuelve máximo 1,000 filas por petición.
  const { data, error, truncated } = await fetchAll<TicketRow>((a, b) => build().range(a, b), limit);
  let rows = data;
  if (f.sla) rows = urgencyQueue(rows.filter((t) => sla(t).state === f.sla));
  return { rows, error, truncated };
}
