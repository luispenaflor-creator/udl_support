import Link from 'next/link';
import { access } from '@/lib/auth';
import type { Role } from '@/lib/types';
import { allCampusNames, campusNames } from '@/lib/campuses';
import {
  CATEGORIES, PERIODS, PRIORITY_LABEL, PRIORITY_ORDER, REQUESTER_STATUS_LABEL, STATUS_LABEL, STATUS_ORDER, FILTER_KEYS,
  isClosed, relativeTime, ticketsUrl,
  type Priority, type Status, type TicketFilter,
} from '@/lib/dashboard';
import { parseFilter, queryTickets } from '@/lib/ticketQuery';
import { Icon } from '@/components/Icon';
import { Empty, PriorityChip, SlaBar, StatusChip } from '@/components/dashboard';
import { Avatar } from '@/components/people';

const LIMIT = 300;

type Person = { id: string; full_name: string; job_title?: string | null; avatar_url?: string | null };

export default async function Tickets({ searchParams }: { searchParams: Promise<TicketFilter> }) {
  const raw = await searchParams;
  const ctx = await access();
  const { s, p } = ctx;
  const role = p.role as Role;
  const CAMPUS = await campusNames(s);
  const { f, estados, staff, lockedCampus } = parseFilter(raw, { role, campus: p.campus, campuses: await allCampusNames(s) });
  const { rows, error } = await queryTickets(ctx, f, LIMIT);
  // El solicitante ve los estados desde su punto de vista ("Requiere tu respuesta").
  const LABEL = staff ? STATUS_LABEL : REQUESTER_STATUS_LABEL;

  const ids = [...new Set(rows.map((t) => t.assignee_id).concat(f.agente ?? null).filter(Boolean))] as string[];
  const { data: peopleRaw } = ids.length ? await s.from('profiles').select('*').in('id', ids) : { data: [] };
  const people = new Map(((peopleRaw ?? []) as Person[]).map((x) => [x.id, x]));
  // Lista de agentes para el filtro (solo personal de soporte).
  const { data: agentsRaw } = staff ? await s.from('profiles').select('id,full_name,active').eq('role', 'agente').order('full_name') : { data: [] };
  const agentOptions = ((agentsRaw ?? []) as (Person & { active?: boolean })[]).filter((a) => a.active !== false || a.id === f.agente);

  // Chips de filtros activos con enlace para quitarlos.
  const labelFor = (k: keyof TicketFilter, v: string): string => {
    switch (k) {
      case 'estado': return 'Estado: ' + v.split(',').map((x) => LABEL[x as Status]).join(' o ');
      case 'prioridad': return 'Prioridad: ' + PRIORITY_LABEL[v as Priority];
      case 'categoria': return 'Categoría: ' + v;
      case 'campus': return 'Plantel: ' + v;
      case 'sla': return v === 'vencido' ? 'SLA vencido' : 'SLA por vencer';
      case 'asignado': return v === 'sin' ? 'Sin asignar' : 'Asignados a mí';
      case 'agente': return 'Agente: ' + (people.get(v)?.full_name ?? 'seleccionado');
      case 'abiertos': return 'Solo abiertos';
      case 'periodo': return 'Periodo: ' + (PERIODS.find((x) => x.key === v)?.label ?? v);
      case 'q': return `Búsqueda: “${v}”`;
    }
  };
  const active = FILTER_KEYS.filter((k) => f[k] && !(k === 'campus' && lockedCampus));
  const agentFocus = f.agente ? people.get(f.agente) : null;

  return (
    <div className="dash">
      <header className="page-head reveal">
        <div>
          <h1>Tickets</h1>
          <p className="muted">{error ? 'No se pudo cargar la lista.' : `${rows.length}${rows.length === LIMIT ? '+' : ''} ${rows.length === 1 ? 'ticket' : 'tickets'}`}{lockedCampus && ` · Plantel ${lockedCampus}`}</p>
        </div>
        <div className="head-actions">
          {/* Descarga lo mismo que se ve, con los filtros actuales; respeta los permisos del perfil. */}
          {rows.length > 0 && <a className="button excel" href={ticketsUrl(f).replace('/tickets', '/tickets/exportar')} download><Icon name="download" />Descargar Excel</a>}
          <Link className="button" href="/tickets/nuevo"><Icon name="plus" />Crear ticket</Link>
        </div>
      </header>

      {agentFocus && (
        <section className="glass agent-focus reveal">
          <Avatar name={agentFocus.full_name} src={agentFocus.avatar_url} size={64} className="ring" />
          <div><small className="muted">Tickets de</small><strong>{agentFocus.full_name}</strong><span className="job"><Icon name="briefcase" size={13} />{agentFocus.job_title ?? 'Agente de soporte'}</span></div>
        </section>
      )}

      <form className="glass filter-form reveal" style={{ '--d': '60ms' } as React.CSSProperties} action="/tickets">
        <label className="search">
          <Icon name="search" size={18} />
          <span className="sr-only">Buscar por folio o asunto</span>
          <input name="q" placeholder="Buscar por folio o asunto…" defaultValue={f.q} />
        </label>
        <label><span className="sr-only">Estado</span>
          <select name="estado" defaultValue={estados.join(',')}>
            <option value="">Todos los estados</option>
            {estados.length > 1 && <option value={estados.join(',')}>{estados.map((x) => LABEL[x]).join(' o ')}</option>}
            {STATUS_ORDER.map((x) => <option key={x} value={x}>{LABEL[x]}</option>)}
          </select>
        </label>
        <label><span className="sr-only">Prioridad</span>
          <select name="prioridad" defaultValue={f.prioridad ?? ''}>
            <option value="">Todas las prioridades</option>
            {PRIORITY_ORDER.map((x) => <option key={x} value={x}>{PRIORITY_LABEL[x]}</option>)}
          </select>
        </label>
        <label><span className="sr-only">Categoría</span>
          <select name="categoria" defaultValue={f.categoria ?? ''}>
            <option value="">Todas las categorías</option>
            {CATEGORIES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        {staff && !lockedCampus && (
          <label><span className="sr-only">Plantel</span>
            <select name="campus" defaultValue={f.campus ?? ''}>
              <option value="">Todos los planteles</option>
              {CAMPUS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
        )}
        {staff && (
          <label><span className="sr-only">Agente</span>
            <select name="agente" defaultValue={f.agente ?? ''}>
              <option value="">Todos los agentes</option>
              {agentOptions.map((a) => <option key={a.id} value={a.id}>{a.full_name}{a.active === false ? ' (inactivo)' : ''}</option>)}
            </select>
          </label>
        )}
        {/* Conserva filtros que no tienen control visible (los que llegan desde el panel). */}
        {(['sla', 'asignado', 'abiertos', 'periodo'] as const).map((k) => f[k] && <input key={k} type="hidden" name={k} value={f[k]} />)}
        <button className="small"><Icon name="filter" size={16} />Filtrar</button>
      </form>

      {active.length > 0 && (
        <div className="active-filters reveal" style={{ '--d': '100ms' } as React.CSSProperties}>
          {active.map((k) => (
            <Link key={k} href={ticketsUrl({ ...f, [k]: undefined })} className="active-chip" aria-label={`Quitar filtro ${labelFor(k, f[k]!)}`}>
              {labelFor(k, f[k]!)}<Icon name="x" size={14} />
            </Link>
          ))}
          <Link href="/tickets" className="link-more">Limpiar filtros</Link>
        </div>
      )}

      {error ? (
        <section className="glass panel"><Empty icon="alert" title="No pudimos cargar los tickets">Intenta de nuevo en unos momentos.</Empty></section>
      ) : rows.length === 0 ? (
        <section className="glass panel reveal">
          <Empty icon="search" title="No hay tickets con estos filtros">
            Quita algún filtro o <Link href="/tickets/nuevo" className="link-more">crea un ticket nuevo</Link>.
          </Empty>
        </section>
      ) : (
        <ul className="ticket-list">
          {rows.map((t, i) => {
            const agent = t.assignee_id ? people.get(t.assignee_id) : null;
            return (
              <li key={t.id} className="reveal" style={{ '--d': `${Math.min(i, 12) * 35 + 120}ms` } as React.CSSProperties}>
                <Link href={`/tickets/${t.id}`} className="list-row glass-soft interactive">
                  <div className="tr-main">
                    <span className="folio">{t.folio} · {t.campus}{t.area ? ` · ${t.area}` : ''}{staff ? ` · ${t.category}` : ''}</span>
                    <strong>{t.subject}</strong>
                    <div className="tr-meta start"><StatusChip status={t.status} audience={staff ? 'staff' : 'solicitante'} /><PriorityChip priority={t.priority} /></div>
                  </div>
                  {!isClosed(t) ? <SlaBar ticket={t} /> : <span className="muted small-print">Resuelto {relativeTime(t.resolved_at ?? t.updated_at)}</span>}
                  <div className="row-agent">
                    {agent ? <><Avatar name={agent.full_name} src={agent.avatar_url} size={34} /><span><strong>{agent.full_name}</strong><small>{agent.job_title ?? 'Soporte'}</small></span></>
                      : <span className="muted small-print">{t.assignee_id ? 'Asignado' : 'Sin asignar'}</span>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
