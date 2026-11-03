import { type NextRequest } from 'next/server';
import { access } from '@/lib/auth';
import { loadOpinions, opinionStats, parseOpinionFilter, type OpinionFilter } from '@/lib/opinions';
import { allCampusNames } from '@/lib/campuses';
import { newWorkbook, addSummarySheet, xlsxResponse } from '@/lib/xlsx';
import { addOpinionsSheet, describeOpinionFilter, opinionsSummarySections } from '@/lib/exports';

export async function GET(req: NextRequest) {
  const ctx = await access(['directivo', 'administrador']);
  const raw = Object.fromEntries(req.nextUrl.searchParams) as OpinionFilter;
  const { f } = parseOpinionFilter(raw, { role: ctx.p.role, campus: ctx.p.campus, campuses: await allCampusNames(ctx.s) });
  const { visible, agents, requesters, error } = await loadOpinions(ctx, f);
  if (error) return Response.json({ error: 'No se pudo generar el archivo' }, { status: 500 });

  const st = opinionStats(visible);
  const wb = newWorkbook();
  addSummarySheet(wb, {
    title: 'Opiniones de usuarios',
    filters: describeOpinionFilter(f, agents.find((a) => a.id === f.agente)?.full_name),
    kpis: [
      ['Opiniones', st.n],
      ['Calificación promedio', st.avg === null ? '—' : `${st.avg.toFixed(2)} / 5`],
      ['Satisfechos (4–5 ★)', st.happy === null ? '—' : `${st.happy} %`],
      ['Insatisfechos (1–2 ★)', st.unhappy === null ? '—' : `${st.unhappy} %`, 'Conviene darles seguimiento'],
      ['Con comentario escrito', st.withComment],
    ],
    sections: opinionsSummarySections(visible, agents),
  });
  addOpinionsSheet(wb, visible, new Map(agents.map((a) => [a.id, a])), requesters);

  if (ctx.p.role === 'administrador') {
    await ctx.s.from('audit_logs').insert({ actor_id: ctx.user.id, action: 'opiniones_exportadas', entity_type: 'surveys', entity_id: null, metadata: { filtros: f, filas: visible.length } });
  }
  return xlsxResponse(wb, `opiniones-udl-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
