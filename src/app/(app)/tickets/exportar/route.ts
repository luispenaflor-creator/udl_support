import { NextResponse, type NextRequest } from 'next/server';
import { access } from '@/lib/auth';
import { summarize, type TicketFilter } from '@/lib/dashboard';
import { parseFilter, queryTickets } from '@/lib/ticketQuery';
import { allCampusNames } from '@/lib/campuses';
import { newWorkbook, addSummarySheet, xlsxResponse } from '@/lib/xlsx';
import { addTicketsSheet, describeTicketFilter } from '@/lib/exports';

const LIMIT = 5000;

export async function GET(req: NextRequest) {
  const ctx = await access();
  const raw = Object.fromEntries(req.nextUrl.searchParams) as TicketFilter;
  const { f } = parseFilter(raw, { role: ctx.p.role, campus: ctx.p.campus, campuses: await allCampusNames(ctx.s) });
  const { rows, error } = await queryTickets(ctx, f, LIMIT);
  if (error) return NextResponse.json({ error: 'No se pudo generar la exportación' }, { status: 500 });

  // Nombres de agentes visibles para este perfil (la RLS decide cuáles se pueden leer).
  const ids = [...new Set(rows.map((t) => t.assignee_id).concat(f.agente ?? null).filter(Boolean))] as string[];
  const { data: people } = ids.length ? await ctx.s.from('profiles').select('id,full_name').in('id', ids) : { data: [] };
  const names = new Map((people ?? []).map((x: { id: string; full_name: string }) => [x.id, x.full_name]));

  const sum = summarize(rows);
  const wb = newWorkbook();
  addSummarySheet(wb, {
    title: 'Lista de tickets',
    filters: describeTicketFilter(f, f.agente ? names.get(f.agente) : undefined),
    kpis: [
      ['Tickets en la lista', sum.total],
      ['Abiertos', sum.open, `${sum.overdue} vencidos`],
      ['Resueltos o cerrados', sum.closed],
      ['Cumplimiento SLA', sum.slaPct === null ? '—' : `${sum.slaPct} %`],
    ],
    sections: [],
  });
  addTicketsSheet(wb, rows, names);

  // Las exportaciones del administrador (alcance global) quedan en auditoría; la RLS de audit_logs solo admite inserciones suyas.
  if (ctx.p.role === 'administrador') {
    await ctx.s.from('audit_logs').insert({ actor_id: ctx.user.id, action: 'tickets_exportados', entity_type: 'tickets', entity_id: null, metadata: { filtros: f, filas: rows.length } });
  }
  return xlsxResponse(wb, `tickets-udl-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
