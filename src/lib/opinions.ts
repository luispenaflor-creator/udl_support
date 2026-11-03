// Opiniones (encuestas de cierre) para directivos y administración. Compartido por la página y la descarga Excel.
import { PERIODS, matchesStars, periodStart } from './dashboard';
import type { access } from './auth';
import { fetchAll } from './fetchAll';

type Ctx = Awaited<ReturnType<typeof access>>;

export type OpinionFilter = { estrellas?: string; periodo?: string; campus?: string; agente?: string; comentario?: string };
export type Opinion = {
  ticket_id: string; score: number; comment: string | null; submitted_at: string | null; requester_id: string;
  tickets: { id: string; folio: string; subject: string; campus: string; category: string; priority: string; assignee_id: string | null; resolved_at: string | null };
};
export type Person = { id: string; full_name: string; job_title?: string | null; avatar_url?: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMIT = 10000;
// Tipado como string para que el analizador de tipos de supabase-js no intente inferir el join (lo hace demasiado profundo).
const SELECT: string = 'ticket_id,score,comment,submitted_at,requester_id,tickets!inner(id,folio,subject,campus,category,priority,assignee_id,resolved_at)';

export function parseOpinionFilter(raw: OpinionFilter, ctx: { role: string; campus: string | null; campuses: readonly string[] }) {
  const lockedCampus = ctx.role === 'directivo' && ctx.campus ? ctx.campus : null;
  const f: OpinionFilter = {
    estrellas: ['1', '2', '3', '4', '5', 'bajas'].includes(raw.estrellas ?? '') ? raw.estrellas : undefined,
    periodo: PERIODS.some((x) => x.key === raw.periodo) ? raw.periodo : undefined,
    campus: lockedCampus ?? (ctx.campuses.includes(raw.campus ?? '') ? raw.campus : undefined),
    agente: UUID.test(raw.agente ?? '') ? raw.agente : undefined,
    comentario: raw.comentario === '1' ? '1' : undefined,
  };
  return { f, lockedCampus };
}

export { matchesStars };

/**
 * Devuelve todas las opiniones según periodo, plantel, agente y comentario. El filtro de estrellas se aplica
 * aparte (`visible`) para que la distribución siga mostrando todos los niveles.
 */
export async function loadOpinions(ctx: Ctx, f: OpinionFilter) {
  const { s, p } = ctx;
  const build = () => {
    let q = s.from('surveys').select(SELECT).not('score', 'is', null).order('submitted_at', { ascending: false }).order('ticket_id');
    if (f.periodo) { const since = periodStart(f.periodo).since; if (since) q = q.gte('submitted_at', since); }
    if (f.campus) q = q.eq('tickets.campus', f.campus);
    if (f.agente) q = q.eq('tickets.assignee_id', f.agente);
    return q;
  };
  const { data, error, truncated } = await fetchAll<Opinion>((a, b) => build().range(a, b), LIMIT);
  const all = data.filter((o) => !f.comentario || Boolean(o.comment?.trim()));
  const visible = all.filter((o) => matchesStars(o.score, f.estrellas));

  const { data: agentsRaw } = await s.from('profiles').select('*').eq('role', 'agente').order('full_name');
  const agents = (agentsRaw ?? []) as Person[];
  // Nombre del solicitante solo para administración; el directivo supervisa sin datos personales.
  let requesters = new Map<string, Person>();
  if (p.role === 'administrador') {
    const ids = [...new Set(visible.map((o) => o.requester_id))].slice(0, 500);
    const { data: req } = ids.length ? await s.from('profiles').select('id,full_name,job_title,avatar_url').in('id', ids) : { data: [] };
    requesters = new Map(((req ?? []) as Person[]).map((x) => [x.id, x]));
  }
  return { all, visible, agents, requesters, error, truncated };
}

export function opinionStats(list: Opinion[]) {
  const n = list.length;
  const dist = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: list.filter((o) => o.score === stars).length }));
  const avg = n ? list.reduce((a, o) => a + o.score, 0) / n : null;
  const pct = (k: number) => (n ? Math.round((k / n) * 100) : null);
  return {
    n, avg, dist,
    happy: pct(list.filter((o) => o.score >= 4).length),
    unhappy: pct(list.filter((o) => o.score <= 2).length),
    withComment: list.filter((o) => o.comment?.trim()).length,
  };
}
