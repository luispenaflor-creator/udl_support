import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { access } from '@/lib/auth';
import { notifyTicket } from '@/lib/notify';
import { PRIORITY_LABEL, PRIORITY_ORDER, relativeTime, type Priority, type TicketRow } from '@/lib/dashboard';
import { ESC_STATUS_CHIP, ESC_STATUS_LABEL, type EscStatus, type EscUpdate } from '@/lib/escalationView';
import { Icon } from '@/components/Icon';
import { EscTimeline } from '@/components/EscTimeline';
import { Empty, PriorityChip, SlaBar, StatusChip } from '@/components/dashboard';
import { Avatar } from '@/components/people';

type Esc = {
  id: string; ticket_id: string; requested_by: string; requester_role: string; reason: string; status: EscStatus;
  attended_at: string | null; closed_at: string | null; closed_by: string | null; created_at: string;
  tickets: TicketRow;
};
type Person = { id: string; full_name: string; job_title?: string | null; avatar_url?: string | null; campus?: string | null; role?: string; active?: boolean };
type Search = { estado?: string; origen?: string; ok?: string; error?: string };
const FILTERS = ['pendiente', 'en_seguimiento', 'cerrada', 'todas'] as const;
const FILTER_LABEL: Record<(typeof FILTERS)[number], string> = { pendiente: 'Pendientes', en_seguimiento: 'En seguimiento', cerrada: 'Cerradas', todas: 'Todas' };

// Tipado como string para que supabase-js no intente inferir el join.
const SELECT: string = '*,tickets!inner(id,folio,subject,status,priority,campus,category,assignee_id,requester_id,created_at,updated_at,resolution_due_at,resolved_at)';
const COUNT_SELECT: string = 'id,tickets!inner(campus)';
const back = (kind: 'ok' | 'error', msg: string, estado?: string): never =>
  redirect(`/escalaciones?${estado ? `estado=${estado}&` : ''}${kind}=${encodeURIComponent(msg)}`);

/**
 * Seguimiento de una escalación. Cada envío deja una entrada en la bitácora y, si se pide, reasigna o cambia prioridad.
 * - intent "seguimiento": la escalación queda En seguimiento (sigue visible y abierta).
 * - intent "cerrar": se cierra con una nota final. También se cierra sola al resolver el ticket.
 */
async function followUp(f: FormData) {
  'use server';
  const { s, user } = await access(['directivo', 'administrador']);
  const id = String(f.get('id'));
  const closing = f.get('intent') === 'cerrar';
  const note = String(f.get('note') ?? '').trim();
  if (note.length < 5) back('error', closing ? 'Escribe la conclusión para cerrar la escalación' : 'Escribe la nota de seguimiento');
  const { data: e } = await s.from('ticket_escalations').select('ticket_id,requester_role,requested_by,status,attended_at').eq('id', id).single();
  if (!e) back('error', 'La escalación no existe');
  if (e!.status === 'cerrada') back('error', 'Esa escalación ya está cerrada');
  const ticketId = e!.ticket_id;

  const { data: t } = await s.from('tickets').select('assignee_id,priority,status').eq('id', ticketId).single();
  const patch: Record<string, unknown> = {};
  const changes: Record<string, unknown> = {};
  const log: { kind: EscUpdate['kind']; note: string }[] = [];

  const newAgent = String(f.get('assignee_id') ?? '');
  if (newAgent && newAgent !== t?.assignee_id) {
    const { data: a } = await s.from('profiles').select('id,full_name').eq('id', newAgent).eq('role', 'agente').maybeSingle();
    if (!a) back('error', 'Solo se puede asignar a perfiles con rol agente');
    patch.assignee_id = newAgent;
    changes.asignacion = { de: t?.assignee_id ?? null, a: newAgent };
    log.push({ kind: 'reasignacion', note: `Reasignado a ${a!.full_name}` });
    if (t?.status === 'nuevo' || t?.status === 'abierto') { patch.status = 'en_progreso'; changes.estado = { de: t.status, a: 'en_progreso' }; }
  }
  const prio = String(f.get('priority') ?? '');
  if (prio && prio !== t?.priority && (PRIORITY_ORDER as string[]).includes(prio)) {
    patch.priority = prio;
    changes.edicion = { priority: { de: t?.priority, a: prio } };
    log.push({ kind: 'prioridad', note: `Prioridad: ${PRIORITY_LABEL[t!.priority as Priority]} → ${PRIORITY_LABEL[prio as Priority]}` });
  }
  if (Object.keys(patch).length) {
    const { error } = await s.from('tickets').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', ticketId);
    if (error) back('error', 'No se pudo actualizar el ticket');
  }
  log.push({ kind: closing ? 'cierre' : 'seguimiento', note });

  const { error: le } = await s.from('escalation_updates').insert(log.map((l) => ({ escalation_id: id, ticket_id: ticketId, author_id: user.id, ...l })));
  if (le) back('error', /escalation_updates/.test(le.message) ? 'Falta ejecutar la migración 202611070001 en Supabase' : 'No se pudo registrar el seguimiento');
  const now = new Date().toISOString();
  const { error } = await s.from('ticket_escalations').update({
    status: closing ? 'cerrada' : 'en_seguimiento',
    attended_by: e!.attended_at ? undefined : user.id, attended_at: e!.attended_at ?? now, response: note,
    ...(closing ? { closed_at: now, closed_by: user.id } : {}),
  }).eq('id', id);
  if (error) back('error', 'No se pudo actualizar la escalación');

  // La nota llega al ticket: pública si escaló el solicitante, interna si fue un agente.
  const fromRequester = e!.requester_role === 'solicitante';
  await s.from('ticket_comments').insert({
    ticket_id: ticketId, author_id: user.id, visibility: fromRequester ? 'public' : 'internal',
    body: `${closing ? 'Dirección cerró la escalación' : 'Seguimiento de dirección a la escalación'}: ${note}`,
  });
  await s.from('ticket_events').insert({ ticket_id: ticketId, actor_id: user.id, event_type: closing ? 'escalacion_cerrada' : 'escalacion_seguimiento', payload: { ...changes, escalacion: { estado: closing ? 'cerrada' : 'en_seguimiento' } } });
  after(async () => {
    await notifyTicket('escalacion_atendida', ticketId, { actorId: user.id, message: note, recipientId: e!.requested_by });
    if (patch.assignee_id) await notifyTicket('ticket_asignado', ticketId, { actorId: user.id });
  });
  revalidatePath('/', 'layout');
  back('ok', closing ? 'Escalación cerrada. Queda en el historial.' : 'Seguimiento registrado. La escalación sigue abierta.', closing ? 'cerrada' : 'en_seguimiento');
}

export default async function Escalations({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { s, p } = await access(['directivo', 'administrador']);
  const lockedCampus = p.role === 'directivo' && p.campus ? (p.campus as string) : null;
  const estado = (FILTERS as readonly string[]).includes(sp.estado ?? '') ? (sp.estado as (typeof FILTERS)[number]) : 'pendiente';
  const origen = sp.origen === 'agente' || sp.origen === 'solicitante' ? sp.origen : undefined;

  let q = s.from('ticket_escalations').select(SELECT).order('created_at', { ascending: estado !== 'cerrada' && estado !== 'todas' }).limit(300);
  if (estado !== 'todas') q = q.eq('status', estado);
  if (origen) q = q.eq('requester_role', origen);
  if (lockedCampus) q = q.eq('tickets.campus', lockedCampus);
  // Conteo por estado para los filtros.
  const countOf = (st: string) => {
    let c = s.from('ticket_escalations').select(COUNT_SELECT, { count: 'exact', head: true }).eq('status', st);
    if (lockedCampus) c = c.eq('tickets.campus', lockedCampus);
    return c;
  };
  const [{ data, error }, { data: agentsRaw }, cp, cs] = await Promise.all([
    q, s.from('profiles').select('*').eq('role', 'agente').order('full_name'), countOf('pendiente'), countOf('en_seguimiento'),
  ]);
  const counts: Partial<Record<string, number>> = { pendiente: cp.count ?? 0, en_seguimiento: cs.count ?? 0 };
  const list = (data ?? []) as unknown as Esc[];
  const agents = ((agentsRaw ?? []) as Person[]).filter((a) => a.active !== false);
  const { data: updRaw } = list.length ? await s.from('escalation_updates').select('*').in('escalation_id', list.map((e) => e.id)).order('created_at') : { data: [] };
  const updates = (updRaw ?? []) as EscUpdate[];
  const ids = [...new Set(list.flatMap((e) => [e.requested_by, e.tickets.assignee_id]).concat(updates.map((u) => u.author_id)).filter(Boolean))] as string[];
  const { data: peopleRaw } = ids.length ? await s.from('profiles').select('*').in('id', ids) : { data: [] };
  const people = new Map(((peopleRaw ?? []) as Person[]).map((x) => [x.id, x]));
  const url = (patch: Search) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ estado: estado === 'pendiente' ? undefined : estado, origen, ...patch })) if (v) qs.set(k, v);
    const str = qs.toString();
    return str ? `/escalaciones?${str}` : '/escalaciones';
  };

  return (
    <div className="dash">
      <header className="page-head reveal">
        <div><h1>Escalaciones</h1><p className="muted">Tickets que agentes o solicitantes enviaron a dirección{lockedCampus ? ` · Plantel ${lockedCampus}` : ''}</p></div>
      </header>
      {sp.ok && <p className="flash ok" role="status"><Icon name="checkCircle" size={18} />{sp.ok}</p>}
      {sp.error && <p className="flash err" role="alert"><Icon name="alert" size={18} />{sp.error}</p>}

      <nav className="glass filters reveal" aria-label="Filtros de escalaciones" style={{ '--d': '60ms' } as React.CSSProperties}>
        <div className="filter-group">
          <span className="filter-label"><Icon name="filter" size={14} />Estado</span>
          {FILTERS.map((k) => (
            <Link key={k} href={url({ estado: k === 'pendiente' ? undefined : k })} className={'filter-chip' + (estado === k ? ' on' : '')}>
              {FILTER_LABEL[k]}{counts[k] ? ` · ${counts[k]}` : ''}
            </Link>
          ))}
        </div>
        <div className="filter-group">
          <span className="filter-label"><Icon name="users" size={14} />Origen</span>
          <Link href={url({ origen: undefined })} className={'filter-chip' + (!origen ? ' on' : '')}>Todos</Link>
          <Link href={url({ origen: 'agente' })} className={'filter-chip' + (origen === 'agente' ? ' on' : '')}>Agentes</Link>
          <Link href={url({ origen: 'solicitante' })} className={'filter-chip' + (origen === 'solicitante' ? ' on' : '')}>Solicitantes</Link>
        </div>
      </nav>

      {error ? (
        <section className="glass panel"><Empty icon="alert" title="No se pudieron cargar las escalaciones">
          {/ticket_escalations|status/.test(error.message) ? 'Falta ejecutar la migración 202611070001 en Supabase.' : 'Intenta de nuevo en unos momentos.'}
        </Empty></section>
      ) : list.length === 0 ? (
        <section className="glass panel reveal"><Empty icon="checkCircle" title={estado === 'pendiente' ? 'No hay escalaciones pendientes' : 'Sin escalaciones en esta vista'}>
          Las escalaciones abiertas siguen en "En seguimiento" hasta cerrarlas o resolver el ticket.
        </Empty></section>
      ) : (
        <ul className="esc-inbox">
          {list.map((e, i) => {
            const who = people.get(e.requested_by);
            const assignee = e.tickets.assignee_id ? people.get(e.tickets.assignee_id) : null;
            const mine = updates.filter((u) => u.escalation_id === e.id);
            return (
              <li key={e.id} className={`glass panel esc-card reveal ${e.status}`} style={{ '--d': `${Math.min(i, 8) * 50 + 100}ms` } as React.CSSProperties}>
                <div className="esc-card-main">
                  <div className="esc-who">
                    <Avatar name={who?.full_name} src={who?.avatar_url} size={40} />
                    <div>
                      <strong>{who?.full_name ?? 'Usuario'}</strong>
                      <small className="muted">{e.requester_role === 'agente' ? 'Agente' : 'Solicitante'} · escaló {relativeTime(e.created_at)}</small>
                    </div>
                    <span className={`chip ${ESC_STATUS_CHIP[e.status]}`}>{ESC_STATUS_LABEL[e.status]}</span>
                  </div>
                  <blockquote className="esc-reason">“{e.reason}”</blockquote>
                  <Link href={`/tickets/${e.tickets.id}`} className="esc-ticket glass-soft interactive">
                    <span className="folio">{e.tickets.folio} · {e.tickets.campus} · {e.tickets.category}</span>
                    <strong>{e.tickets.subject}</strong>
                    <span className="tr-meta start"><StatusChip status={e.tickets.status} /><PriorityChip priority={e.tickets.priority} />
                      <span className="muted small-print"><Icon name="user" size={12} />{assignee?.full_name ?? 'Sin agente'}</span></span>
                    <SlaBar ticket={e.tickets} />
                  </Link>
                  {mine.length > 0 && <EscTimeline updates={mine} people={people} />}
                </div>
                {e.status !== 'cerrada' ? (
                  <form action={followUp} className="form esc-form">
                    <input type="hidden" name="id" value={e.id} />
                    <label>{mine.length ? 'Nueva nota de seguimiento' : 'Respuesta o acción tomada'}
                      <textarea name="note" required minLength={5} maxLength={1000}
                        placeholder={e.requester_role === 'solicitante' ? 'El solicitante verá esta nota en su ticket.' : 'Queda como nota interna en el ticket.'} />
                    </label>
                    <div className="field-grid">
                      <label>Agente
                        <select name="assignee_id" defaultValue="">
                          <option value="">Mantener a {assignee ? assignee.full_name.split(' ')[0] : 'sin agente'}</option>
                          {agents.filter((a) => a.id !== e.tickets.assignee_id).map((a) => <option key={a.id} value={a.id}>Reasignar a {a.full_name}{a.campus ? ` · ${a.campus}` : ''}</option>)}
                        </select>
                      </label>
                      <label>Prioridad
                        <select name="priority" defaultValue={e.tickets.priority}>{PRIORITY_ORDER.map((x) => <option key={x} value={x}>{PRIORITY_LABEL[x]}</option>)}</select>
                      </label>
                    </div>
                    <div className="esc-actions">
                      <button name="intent" value="seguimiento"><Icon name="message" size={16} />Registrar seguimiento</button>
                      <button name="intent" value="cerrar" className="ghost-btn"><Icon name="lock" size={16} />Cerrar escalación</button>
                    </div>
                    <p className="muted small-print">El seguimiento mantiene la escalación abierta. Se cierra al pulsar "Cerrar escalación" o automáticamente cuando el ticket se resuelve.</p>
                  </form>
                ) : (
                  <div className="esc-done">
                    <span className="chip sla-ok"><Icon name="lock" size={12} />Cerrada {relativeTime(e.closed_at)}</span>
                    <small className="muted">por {people.get(e.closed_by ?? '')?.full_name ?? 'el sistema al resolver el ticket'}</small>
                    <Link href={`/tickets/${e.tickets.id}`} className="link-more">Ver ticket<Icon name="arrowRight" size={14} /></Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
