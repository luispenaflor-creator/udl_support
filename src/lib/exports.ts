// SOLO SERVIDOR. Contenido de las descargas Excel (tickets, reporte completo y opiniones).
import type ExcelJS from 'exceljs';
import {
  CATEGORIES, PERIODS, PRIORITY_LABEL, PRIORITY_ORDER, SLA_LABEL, STATUS_LABEL, STATUS_ORDER,
  agentRanking, countBy, monthlyTrend, sla, summarize,
  type Agent, type Priority, type Status, type SurveyRow, type TicketFilter, type TicketRow,
} from './dashboard';
import { XL, addDataSheet, addSummarySheet, type Col } from './xlsx';
import type { Opinion, OpinionFilter, Person } from './opinions';

const H = 3_600_000;
const periodLabel = (k?: string) => PERIODS.find((x) => x.key === k)?.label ?? 'Todo';
const pct = (v: number | null) => (v === null ? '—' : `${v} %`);
const hours = (ms: number | null) => (ms === null ? '—' : `${(ms / H).toFixed(1)} h`);

export function describeTicketFilter(f: TicketFilter, agentName?: string): [string, string][] {
  return [
    ['Periodo', periodLabel(f.periodo)],
    ['Plantel', f.campus ?? 'Todos'],
    ['Estado', f.estado ? f.estado.split(',').map((x) => STATUS_LABEL[x as Status]).join(', ') : f.abiertos ? 'Solo abiertos' : 'Todos'],
    ['Prioridad', f.prioridad ? PRIORITY_LABEL[f.prioridad as Priority] : 'Todas'],
    ['Categoría', f.categoria ?? 'Todas'],
    ['SLA', f.sla === 'vencido' ? 'Vencidos' : f.sla === 'riesgo' ? 'Por vencer' : 'Todos'],
    ['Asignación', f.asignado === 'sin' ? 'Sin asignar' : f.asignado === 'mio' ? 'Asignados a quien descarga' : f.agente ? `Agente: ${agentName ?? 'seleccionado'}` : 'Todas'],
    ['Búsqueda', f.q ?? '—'],
  ];
}

const TICKET_COLS: Col[] = [
  { header: 'Folio', key: 'folio', width: 15 },
  { header: 'Asunto', key: 'subject', width: 42, type: 'text' },
  { header: 'Estado', key: 'status', width: 14 },
  { header: 'Prioridad', key: 'priority', width: 12 },
  { header: 'Categoría', key: 'category', width: 13 },
  { header: 'Plantel', key: 'campus', width: 14 },
  { header: 'Salón / área', key: 'area', width: 18, type: 'text' },
  { header: 'Agente', key: 'agent', width: 26 },
  { header: 'SLA', key: 'sla', width: 14 },
  { header: 'Creado', key: 'created', width: 18, type: 'date' },
  { header: 'Vence', key: 'due', width: 18, type: 'date' },
  { header: 'Resuelto', key: 'resolved', width: 18, type: 'date' },
  { header: 'Asignado', key: 'assigned', width: 18, type: 'date' },
  { header: 'Horas para resolver', key: 'hours', width: 14, type: 'hours' },
  { header: 'Horas de solución (desde asignación)', key: 'solve', width: 16, type: 'hours' },
  { header: 'Calificación', key: 'score', width: 13, type: 'stars' },
];

export function addTicketsSheet(wb: ExcelJS.Workbook, rows: TicketRow[], names: Map<string, string>, scores = new Map<string, number>()) {
  return addDataSheet(wb, {
    name: 'Tickets', title: 'Detalle de tickets', cols: TICKET_COLS,
    rows: rows.map((t) => {
      const s = sla(t).state;
      return {
        folio: t.folio, subject: t.subject, status: STATUS_LABEL[t.status], priority: PRIORITY_LABEL[t.priority], category: t.category, campus: t.campus, area: t.area ?? '',
        agent: t.assignee_id ? names.get(t.assignee_id) ?? 'Asignado' : 'Sin asignar', sla: SLA_LABEL[s], slaState: s,
        created: t.created_at, due: t.resolution_due_at, resolved: t.resolved_at,
        assigned: t.assigned_at ?? null,
        hours: t.resolved_at ? (new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()) / H : null,
        solve: t.resolved_at && t.assigned_at ? Math.max(0, new Date(t.resolved_at).getTime() - new Date(t.assigned_at).getTime()) / H : null,
        score: scores.get(t.id) ?? null, prio: t.priority,
      };
    }),
    highlight: [
      { key: 'sla', color: (r) => (r.slaState === 'vencido' || r.slaState === 'incumplido' ? XL.red : r.slaState === 'riesgo' ? XL.amber : r.slaState === 'cumplido' ? XL.green : null) },
      { key: 'priority', color: (r) => (r.prio === 'urgente' ? XL.red : r.prio === 'alta' ? XL.amber : null) },
    ],
  });
}

function breakdown(rows: TicketRow[], campuses: readonly string[]) {
  const total = rows.length || 1;
  const sec = <K extends string>(title: string, key: (t: TicketRow) => K, order: readonly K[], label: (k: K) => string) => ({
    title, head: [title.charAt(4).toUpperCase() + title.slice(5), 'Tickets', 'Abiertos', '% del total'],
    rows: countBy(rows, key, order).map((d) => [label(d.key), d.value, rows.filter((t) => key(t) === d.key && t.status !== 'resuelto' && t.status !== 'cerrado').length, `${Math.round((d.value / total) * 100)} %`]),
  });
  return [
    sec('Por estado', (t) => t.status, STATUS_ORDER, (k) => STATUS_LABEL[k]),
    sec('Por prioridad', (t) => t.priority, PRIORITY_ORDER, (k) => PRIORITY_LABEL[k]),
    sec('Por categoría', (t) => t.category, CATEGORIES as readonly string[], (k) => k),
    sec('Por plantel', (t) => t.campus, campuses, (k) => k),
  ];
}

/** Reporte completo: Resumen + Tickets + Agentes + Opiniones. */
export function buildFullReport(wb: ExcelJS.Workbook, opts: {
  rows: TicketRow[]; trendRows: TicketRow[]; surveys: SurveyRow[]; agents: Agent[]; filters: [string, string][];
  opinions: Opinion[]; campuses: readonly string[];
}) {
  const { rows, surveys, agents } = opts;
  const sum = summarize(rows);
  const avg = surveys.length ? surveys.reduce((a, s) => a + (s.score ?? 0), 0) / surveys.length : null;
  const trend = monthlyTrend(opts.trendRows);
  const ranking = agentRanking(rows, surveys, agents);
  addSummarySheet(wb, {
    title: 'Reporte de la mesa de ayuda',
    filters: opts.filters,
    kpis: [
      ['Tickets del periodo', sum.total],
      ['Abiertos', sum.open, `${sum.overdue} vencidos · ${sum.atRisk} por vencer`],
      ['Resueltos o cerrados', sum.closed],
      ['Sin asignar', sum.unassigned],
      ['Cumplimiento SLA', pct(sum.slaPct), 'Resueltos dentro del plazo (horas corridas)'],
      ['Tiempo promedio de solución', hours(sum.avgSolveMs), 'Desde que se asigna a un agente hasta que lo resuelve'],
      ['Tiempo promedio total', hours(sum.avgResolutionMs), 'Desde la creación del ticket hasta resolverlo'],
      ['Satisfacción promedio', avg === null ? '—' : `${avg.toFixed(2)} / 5`, `${surveys.length} evaluaciones`],
    ],
    sections: [
      ...breakdown(rows, opts.campuses),
      { title: 'Tendencia de 6 meses', head: ['Mes', 'Creados', 'Resueltos', 'Diferencia'], rows: trend.map((m) => [m.label, m.created, m.resolved, m.resolved - m.created]) },
    ],
  });
  const names = new Map(agents.map((a) => [a.id, a.full_name]));
  addTicketsSheet(wb, rows, names, new Map(surveys.filter((s) => s.score).map((s) => [s.ticket_id, s.score as number])));
  addDataSheet(wb, {
    name: 'Agentes', title: 'Desempeño por agente', tabColor: 'FFD97706',
    cols: [
      { header: 'Lugar', key: 'rank', width: 8, type: 'int' },
      { header: 'Agente', key: 'name', width: 26 },
      { header: 'Puesto', key: 'job', width: 34 },
      { header: 'Plantel', key: 'campus', width: 14 },
      { header: 'Puntaje', key: 'points', width: 10, type: 'int' },
      { header: 'Satisfacción', key: 'avg', width: 13 },
      { header: 'Evaluaciones', key: 'ratings', width: 13, type: 'int' },
      { header: 'Asignados', key: 'assigned', width: 11, type: 'int' },
      { header: 'Resueltos', key: 'resolved', width: 11, type: 'int' },
      { header: 'Abiertos', key: 'open', width: 10, type: 'int' },
      { header: 'Vencidos', key: 'overdue', width: 10, type: 'int' },
      { header: 'SLA', key: 'sla', width: 9, type: 'pct' },
      { header: 'Horas promedio', key: 'hours', width: 14, type: 'hours' },
    ],
    rows: ranking.map((a, i) => ({
      rank: i + 1, name: a.full_name, job: a.job_title ?? '', campus: a.campus ?? '', points: a.points,
      avg: a.avgScore === null ? null : Number(a.avgScore.toFixed(2)), ratings: a.ratings, assigned: a.assigned, resolved: a.resolved,
      open: a.open, overdue: a.overdue, sla: a.slaPct === null ? null : a.slaPct / 100, hours: a.avgResolutionMs === null ? null : a.avgResolutionMs / H,
    })),
  });
  addOpinionsSheet(wb, opts.opinions, new Map(agents.map((a) => [a.id, a])), new Map());
}

export function describeOpinionFilter(f: OpinionFilter, agentName?: string): [string, string][] {
  return [
    ['Estrellas', !f.estrellas ? 'Todas' : f.estrellas === 'bajas' ? '1 y 2 (insatisfechos)' : `${f.estrellas} de 5`],
    ['Periodo', periodLabel(f.periodo)],
    ['Plantel', f.campus ?? 'Todos'],
    ['Agente', f.agente ? agentName ?? 'Seleccionado' : 'Todos'],
    ['Comentario', f.comentario ? 'Solo con comentario escrito' : 'Con y sin comentario'],
  ];
}

export function addOpinionsSheet(wb: ExcelJS.Workbook, list: Opinion[], agents: Map<string, Person>, requesters: Map<string, Person>) {
  const withRequester = requesters.size > 0;
  const cols: Col[] = [
    { header: 'Fecha', key: 'date', width: 18, type: 'date' },
    { header: 'Estrellas', key: 'stars', width: 12, type: 'stars' },
    { header: 'Calificación', key: 'score', width: 12, type: 'int' },
    { header: 'Comentario', key: 'comment', width: 60, type: 'text' },
    { header: 'Folio', key: 'folio', width: 15 },
    { header: 'Asunto', key: 'subject', width: 36, type: 'text' },
    { header: 'Categoría', key: 'category', width: 13 },
    { header: 'Plantel', key: 'campus', width: 14 },
    { header: 'Agente', key: 'agent', width: 26 },
    ...(withRequester ? [{ header: 'Solicitante', key: 'requester', width: 26 } as Col] : []),
  ];
  return addDataSheet(wb, {
    name: 'Opiniones', title: 'Opiniones de usuarios', tabColor: 'FFF59E0B', cols,
    rows: list.map((o) => ({
      date: o.submitted_at, stars: o.score, score: o.score, comment: o.comment?.trim() || '', folio: o.tickets.folio, subject: o.tickets.subject,
      category: o.tickets.category, campus: o.tickets.campus,
      agent: o.tickets.assignee_id ? agents.get(o.tickets.assignee_id)?.full_name ?? 'Agente' : 'Sin agente',
      requester: requesters.get(o.requester_id)?.full_name ?? 'Solicitante',
    })),
    highlight: [{ key: 'score', color: (r) => (Number(r.score) <= 2 ? XL.red : Number(r.score) >= 4 ? XL.green : XL.amber) }],
  });
}

export function opinionsSummarySections(list: Opinion[], agents: Person[]) {
  const n = list.length || 1;
  return [
    { title: 'Distribución por estrellas', head: ['Estrellas', 'Opiniones', '% del total', ''], rows: [5, 4, 3, 2, 1].map((s) => {
      const c = list.filter((o) => o.score === s).length;
      return ['★'.repeat(s), c, `${Math.round((c / n) * 100)} %`, null];
    }) },
    { title: 'Por agente', head: ['Agente', 'Opiniones', 'Promedio', '% 4–5 ★'], rows: agents.map((a) => {
      const mine = list.filter((o) => o.tickets.assignee_id === a.id);
      const avg = mine.length ? mine.reduce((x, o) => x + o.score, 0) / mine.length : null;
      return [a.full_name, mine.length, avg === null ? '—' : Number(avg.toFixed(2)), mine.length ? `${Math.round((mine.filter((o) => o.score >= 4).length / mine.length) * 100)} %` : '—'];
    }) },
  ];
}
