// Datos de Reportes (página y descarga Excel), paginados para no perder filas por el límite de 1,000 de la API.
import type { access } from './auth';
import type { Agent, SurveyRow, TicketRow } from './dashboard';
import { fetchAll } from './fetchAll';
import { TICKET_COLS } from './ticketQuery';

type Db = Awaited<ReturnType<typeof access>>['s'];
const MAX = 20000;

export async function loadReportData(s: Db, opts: { campus: string | null; since: string | null }) {
  const tickets = (since: string | null) => (a: number, b: number) => {
    let q = s.from('tickets').select(TICKET_COLS).order('created_at', { ascending: false }).order('id');
    if (opts.campus) q = q.eq('campus', opts.campus);
    if (since) q = q.gte('created_at', since);
    return q.range(a, b);
  };
  // La tendencia siempre cubre 6 meses calendario, sin importar el periodo elegido.
  const now = new Date();
  const trendSince = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();
  const [main, trend, surveys, { data: agents }] = await Promise.all([
    fetchAll<TicketRow>(tickets(opts.since), MAX),
    fetchAll<TicketRow>(tickets(trendSince), MAX),
    fetchAll<SurveyRow>((a, b) => s.from('surveys').select('ticket_id,score').not('score', 'is', null).order('ticket_id').range(a, b), MAX),
    s.from('profiles').select('*').eq('role', 'agente').order('full_name'),
  ]);
  const ids = new Set(main.data.map((t) => t.id));
  return {
    rows: main.data,
    trendRows: trend.data,
    surveys: surveys.data.filter((x) => ids.has(x.ticket_id)),
    agents: (agents ?? []) as Agent[],
    error: main.error,
    truncated: main.truncated,
  };
}
