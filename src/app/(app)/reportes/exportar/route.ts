import { type NextRequest } from 'next/server';
import { access } from '@/lib/auth';
import { allCampusNames, campusNames } from '@/lib/campuses';
import { periodStart } from '@/lib/dashboard';
import { loadOpinions } from '@/lib/opinions';
import { loadReportData } from '@/lib/reportData';
import { newWorkbook, xlsxResponse } from '@/lib/xlsx';
import { buildFullReport } from '@/lib/exports';

export async function GET(req: NextRequest) {
  const ctx = await access(['agente', 'directivo', 'administrador']);
  const { s, p } = ctx;
  const sp = req.nextUrl.searchParams;
  const lockedCampus = p.role === 'directivo' && p.campus ? (p.campus as string) : null;
  const campuses = await allCampusNames(s);
  const campus = lockedCampus ?? (campuses.includes(sp.get('campus') ?? '') ? sp.get('campus')! : null);
  const period = periodStart(sp.get('periodo') ?? '90');

  const { rows, trendRows, surveys, agents, error, truncated } = await loadReportData(s, { campus, since: period.since });
  if (error) return Response.json({ error: 'No se pudo generar el reporte' }, { status: 500 });
  const ids = new Set(rows.map((t) => t.id));
  // Las opiniones con comentario solo se incluyen para quien puede consultar el apartado de Opiniones.
  const opinions = p.role === 'agente' ? [] : (await loadOpinions(ctx, { periodo: period.key, campus: campus ?? undefined })).all.filter((o) => ids.has(o.ticket_id));

  const wb = newWorkbook();
  buildFullReport(wb, {
    rows, trendRows, surveys, agents, opinions, campuses: await campusNames(s),
    filters: [
      ['Periodo', period.label],
      ['Plantel', campus ?? 'Todos los planteles'],
      ['Alcance', p.role === 'agente' ? 'Tickets asignados a quien descarga y sin asignar' : lockedCampus ? `Plantel del perfil (${lockedCampus})` : 'Institucional'],
      ['Generado por', `${p.full_name} (${p.role})`],
      ...(truncated ? [['Aviso', 'Se incluyen los 20,000 tickets más recientes del periodo'] as [string, string]] : []),
    ],
  });
  if (p.role === 'administrador') {
    await s.from('audit_logs').insert({ actor_id: ctx.user.id, action: 'reporte_exportado', entity_type: 'tickets', entity_id: null, metadata: { periodo: period.key, campus, filas: rows.length } });
  }
  return xlsxResponse(wb, `reporte-udl-${period.key}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
