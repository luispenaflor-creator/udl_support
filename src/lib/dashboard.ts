// Lógica pura de indicadores del panel. Sin dependencias de Supabase para poder probarse.
// SLA: horas corridas (sin calendario laboral), igual que la base de datos.

export type Status = 'nuevo' | 'abierto' | 'en_progreso' | 'en_espera' | 'resuelto' | 'cerrado';
export type Priority = 'baja' | 'media' | 'alta' | 'urgente';
export type SlaState = 'ok' | 'riesgo' | 'vencido' | 'cumplido' | 'incumplido';

export type TicketRow = {
  id: string;
  folio: string;
  subject: string;
  status: Status;
  priority: Priority;
  campus: string;
  category: string;
  created_at: string;
  updated_at: string | null;
  resolution_due_at: string | null;
  resolved_at: string | null;
  assignee_id: string | null;
  requester_id: string;
  assigned_at?: string | null; // primera asignación a un agente
  area?: string | null;        // salón o área dentro del plantel
};

export const STATUS_ORDER: Status[] = ['nuevo', 'abierto', 'en_progreso', 'en_espera', 'resuelto', 'cerrado'];
export const PRIORITY_ORDER: Priority[] = ['urgente', 'alta', 'media', 'baja'];
// "Por clasificar" es el valor inicial: el solicitante no elige categoría, la asigna el agente.
export const UNCLASSIFIED = 'Por clasificar';
export const CATEGORIES = ['Hardware', 'Software', 'Red', 'Correo', 'Accesos', 'Audio y video', 'Otro', UNCLASSIFIED] as const;
// Categorías que el agente puede elegir al clasificar.
export const AGENT_CATEGORIES = CATEGORIES.filter((c) => c !== UNCLASSIFIED);

// Fallas comunes que el solicitante elige como asunto. "Otro" le permite escribirlo.
export const COMMON_ISSUES = [
  'Transmisión de laptop a pantalla', 'Laptop Hyflex', 'Micrófono Hyflex', 'Control Hyflex', 'Pantalla Hyflex',
  'Problemas con Zoom', 'Problemas de conexión a Internet', 'Problemas con mi equipo de cómputo', 'Problemas con Sure',
  'Instalación de Software', 'Problemas con mi impresora',
] as const;
export const OTHER_ISSUE = 'Otro';
// En Home Office no hay salón: la ubicación es opcional.
export const HOME_OFFICE = 'Home Office';

export const STATUS_LABEL: Record<Status, string> = {
  nuevo: 'Nuevo',
  abierto: 'Abierto',
  en_progreso: 'En proceso',
  // "En espera" significa que soporte necesita una respuesta del solicitante para continuar.
  en_espera: 'Esperando al solicitante',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
};

// Misma información desde el punto de vista del solicitante: deja claro si la acción es suya.
export const REQUESTER_STATUS_LABEL: Record<Status, string> = {
  nuevo: 'Recibido',
  abierto: 'Abierto',
  en_progreso: 'En proceso',
  en_espera: 'Requiere tu respuesta',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  urgente: 'Urgente',
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
};

export const SLA_LABEL: Record<SlaState, string> = {
  ok: 'En tiempo',
  riesgo: 'Por vencer',
  vencido: 'Vencido',
  cumplido: 'Cumplido',
  incumplido: 'Fuera de SLA',
};

const PRIORITY_WEIGHT: Record<Priority, number> = { urgente: 4, alta: 3, media: 2, baja: 1 };

// Un ticket está "por vencer" cuando le queda 25 % o menos de su ventana de resolución.
export const RISK_FRACTION = 0.25;

export const isClosed = (t: Pick<TicketRow, 'status'>) => t.status === 'resuelto' || t.status === 'cerrado';

export function sla(t: TicketRow, now = Date.now()): { state: SlaState; remainingMs: number; elapsedPct: number } {
  if (!t.resolution_due_at) return { state: 'ok', remainingMs: Infinity, elapsedPct: 0 };
  const start = new Date(t.created_at).getTime();
  const due = new Date(t.resolution_due_at).getTime();
  const total = Math.max(due - start, 1);
  if (isClosed(t)) {
    const end = t.resolved_at ? new Date(t.resolved_at).getTime() : now;
    return { state: end <= due ? 'cumplido' : 'incumplido', remainingMs: due - end, elapsedPct: Math.min(100, ((end - start) / total) * 100) };
  }
  const remainingMs = due - now;
  const elapsedPct = Math.min(100, Math.max(0, ((now - start) / total) * 100));
  if (remainingMs <= 0) return { state: 'vencido', remainingMs, elapsedPct: 100 };
  if (remainingMs <= total * RISK_FRACTION) return { state: 'riesgo', remainingMs, elapsedPct };
  return { state: 'ok', remainingMs, elapsedPct };
}

export function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  if (h >= 48) return `${Math.round(h / 24)} d`;
  if (h >= 1) return `${h} h ${m} min`;
  return `${m} min`;
}

export function slaText(t: TicketRow, now = Date.now()): string {
  const s = sla(t, now);
  if (s.state === 'vencido') return `Vencido hace ${formatDuration(s.remainingMs)}`;
  if (s.state === 'cumplido') return 'Resuelto dentro del SLA';
  if (s.state === 'incumplido') return 'Resuelto fuera del SLA';
  if (!Number.isFinite(s.remainingMs)) return 'Sin fecha límite';
  return `Quedan ${formatDuration(s.remainingMs)}`;
}

// Cola priorizada: vencidos primero, luego por vencer, luego prioridad y fecha límite más cercana.
export function urgencyQueue(rows: TicketRow[], now = Date.now()): TicketRow[] {
  const rank: Record<SlaState, number> = { vencido: 0, riesgo: 1, ok: 2, incumplido: 3, cumplido: 3 };
  return rows
    .filter((t) => !isClosed(t))
    .sort((a, b) => {
      const sa = sla(a, now), sb = sla(b, now);
      return rank[sa.state] - rank[sb.state]
        || PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]
        || sa.remainingMs - sb.remainingMs;
    });
}

export function countBy<K extends string>(rows: TicketRow[], key: (t: TicketRow) => K, order: readonly K[]): { key: K; value: number }[] {
  const map = new Map<K, number>(order.map((k) => [k, 0]));
  for (const t of rows) {
    const k = key(t);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].map(([k, value]) => ({ key: k, value }));
}

export function summarize(rows: TicketRow[], now = Date.now()) {
  const open = rows.filter((t) => !isClosed(t));
  const closed = rows.filter(isClosed);
  const states = open.map((t) => sla(t, now).state);
  const onTime = closed.filter((t) => sla(t, now).state === 'cumplido').length;
  const resolvedWithDate = closed.filter((t) => t.resolved_at);
  const avgResolutionMs = resolvedWithDate.length
    ? resolvedWithDate.reduce((acc, t) => acc + (new Date(t.resolved_at!).getTime() - new Date(t.created_at).getTime()), 0) / resolvedWithDate.length
    : null;
  // Tiempo de solución: desde que se asigna a un agente hasta que lo resuelve.
  const solved = resolvedWithDate.filter((t) => t.assigned_at);
  const avgSolveMs = solved.length
    ? solved.reduce((acc, t) => acc + Math.max(0, new Date(t.resolved_at!).getTime() - new Date(t.assigned_at!).getTime()), 0) / solved.length
    : null;
  return {
    total: rows.length,
    open: open.length,
    closed: closed.length,
    overdue: states.filter((s) => s === 'vencido').length,
    atRisk: states.filter((s) => s === 'riesgo').length,
    unassigned: open.filter((t) => !t.assignee_id).length,
    // null cuando todavía no hay tickets cerrados: no se inventa un porcentaje.
    slaPct: closed.length ? Math.round((onTime / closed.length) * 100) : null,
    avgResolutionMs,
    avgSolveMs,
    solvedCount: solved.length,
  };
}

export const PERIODS = [
  { key: '7', label: '7 días', days: 7 },
  { key: '30', label: '30 días', days: 30 },
  { key: '90', label: '90 días', days: 90 },
  { key: 'todo', label: 'Todo', days: null },
] as const;

export function periodStart(key: string | undefined, now = Date.now()): { key: string; label: string; since: string | null } {
  const p = PERIODS.find((x) => x.key === key) ?? PERIODS[1];
  return { key: p.key, label: p.label, since: p.days ? new Date(now - p.days * 86_400_000).toISOString() : null };
}

// Siguiente paso visible para el solicitante: quién tiene la acción pendiente.
export function nextStep(status: Status): { who: 'soporte' | 'tu' | 'nadie'; text: string } {
  switch (status) {
    case 'nuevo': return { who: 'soporte', text: 'Soporte revisará tu solicitud' };
    case 'abierto':
    case 'en_progreso': return { who: 'soporte', text: 'Soporte está trabajando en ello' };
    case 'en_espera': return { who: 'tu', text: 'Soporte te pidió información: responde para continuar' };
    case 'resuelto': return { who: 'tu', text: 'Confirma que la solución funcionó' };
    default: return { who: 'nadie', text: 'Solicitud cerrada' };
  }
}

// Transiciones de estado permitidas. Reabrir lleva a "abierto".
export const TRANSITIONS: Record<Status, Status[]> = {
  nuevo: ['abierto', 'en_progreso', 'en_espera', 'cerrado'],
  abierto: ['en_progreso', 'en_espera', 'resuelto', 'cerrado'],
  en_progreso: ['abierto', 'en_espera', 'resuelto'],
  en_espera: ['en_progreso', 'resuelto', 'cerrado'],
  resuelto: ['cerrado', 'abierto'],
  cerrado: ['abierto'],
};
export const canTransition = (from: Status, to: Status) => from === to || TRANSITIONS[from].includes(to);

/* ---------- Enlaces a la lista de tickets ---------- */

export type TicketFilter = {
  estado?: string;      // uno o varios separados por coma
  prioridad?: string;
  categoria?: string;
  campus?: string;
  sla?: string;         // 'vencido' | 'riesgo'
  asignado?: string;    // 'sin' | 'mio'
  agente?: string;      // id de agente
  abiertos?: string;    // '1'
  periodo?: string;
  q?: string;
};
export const FILTER_KEYS: (keyof TicketFilter)[] = ['estado', 'prioridad', 'categoria', 'campus', 'sla', 'asignado', 'agente', 'abiertos', 'periodo', 'q'];

export function ticketsUrl(f: TicketFilter): string {
  const q = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = f[k];
    if (v && v !== 'todos') q.set(k, v);
  }
  const s = q.toString();
  return s ? `/tickets?${s}` : '/tickets';
}

/* ---------- Ranking de agentes ---------- */

export type Agent = { id: string; full_name: string; job_title?: string | null; avatar_url?: string | null; campus?: string | null };
export type SurveyRow = { ticket_id: string; score: number | null };
export type AgentStats = Agent & {
  assigned: number; open: number; resolved: number; overdue: number;
  slaPct: number | null; avgScore: number | null; ratings: number; avgResolutionMs: number | null; points: number;
};

// Puntaje 0–100: 45 % satisfacción, 35 % cumplimiento SLA, 20 % volumen resuelto relativo al mejor.
// Sin evaluaciones o sin resueltos se usa un valor neutro (3/5 y 50 %) para no premiar ni castigar.
export function agentRanking(rows: TicketRow[], surveys: SurveyRow[], agents: Agent[], now = Date.now()): AgentStats[] {
  const scoreByTicket = new Map(surveys.filter((s) => s.score).map((s) => [s.ticket_id, s.score as number]));
  const stats = agents.map((a) => {
    const mine = rows.filter((t) => t.assignee_id === a.id);
    const s = summarize(mine, now);
    const scores = mine.map((t) => scoreByTicket.get(t.id)).filter((x): x is number => typeof x === 'number');
    return {
      ...a,
      assigned: mine.length, open: s.open, resolved: s.closed, overdue: s.overdue, slaPct: s.slaPct,
      avgScore: scores.length ? scores.reduce((x, y) => x + y, 0) / scores.length : null,
      ratings: scores.length, avgResolutionMs: s.avgSolveMs ?? s.avgResolutionMs, points: 0,
    };
  });
  const maxResolved = Math.max(1, ...stats.map((s) => s.resolved));
  for (const s of stats) {
    s.points = s.assigned === 0 ? 0 : Math.round(100 * (
      0.45 * ((s.avgScore ?? 3) / 5) + 0.35 * ((s.slaPct ?? 50) / 100) + 0.2 * (s.resolved / maxResolved)
    ));
  }
  return stats.sort((a, b) => b.points - a.points || b.resolved - a.resolved || a.full_name.localeCompare(b.full_name));
}

// Tickets creados y resueltos por mes calendario (últimos `months` meses, incluido el actual).
export function monthlyTrend(rows: TicketRow[], months = 6, now = Date.now()) {
  const d = new Date(now);
  const buckets = Array.from({ length: months }, (_, i) => {
    const m = new Date(d.getFullYear(), d.getMonth() - (months - 1 - i), 1);
    return { key: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`, label: m.toLocaleDateString('es-MX', { month: 'short' }).replace('.', ''), created: 0, resolved: 0 };
  });
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  const keyOf = (iso: string) => { const x = new Date(iso); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };
  for (const t of rows) {
    const c = idx.get(keyOf(t.created_at));
    if (c !== undefined) buckets[c].created++;
    if (t.resolved_at) { const r = idx.get(keyOf(t.resolved_at)); if (r !== undefined) buckets[r].resolved++; }
  }
  return buckets;
}

// Filtro de opiniones: un nivel exacto ('1'…'5') o 'bajas' (1 y 2 estrellas).
export const matchesStars = (score: number, estrellas?: string) =>
  !estrellas || (estrellas === 'bajas' ? score <= 2 : score === Number(estrellas));

export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return '—';
  const diff = now - new Date(iso).getTime();
  if (diff < 60_000) return 'hace un momento';
  return `hace ${formatDuration(diff)}`;
}
