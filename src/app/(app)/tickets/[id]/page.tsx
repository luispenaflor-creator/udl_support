import Link from 'next/link';
import { notFound } from 'next/navigation';
import { access } from '@/lib/auth';
import { campusNames } from '@/lib/campuses';
import {
  AGENT_CATEGORIES, PRIORITY_LABEL, UNCLASSIFIED, formatDuration, PRIORITY_ORDER, STATUS_LABEL, TRANSITIONS, isClosed, relativeTime, slaText,
  type Priority, type Status, type TicketRow,
} from '@/lib/dashboard';
import { requesterEscalation } from '@/lib/escalation';
import { ESC_STATUS_CHIP, ESC_STATUS_LABEL, isOpenEscalation, type EscStatus, type EscUpdate } from '@/lib/escalationView';
import { EscTimeline } from '@/components/EscTimeline';
import { Icon } from '@/components/Icon';
import { PriorityChip, SlaBar, StatusChip } from '@/components/dashboard';
import { AgentCard, Avatar, StarInput, Stars } from '@/components/people';
import { QuickReplies } from '@/components/QuickReplies';
import { ManageForm, RequesterEscalate } from '@/components/TicketForms';
import { addComment, classifyTicket, editTicket, escalateTicket, manageTicket, rateTicket, takeTicket } from './actions';

type Person = { id: string; full_name: string; role: string; job_title?: string | null; avatar_url?: string | null; campus?: string | null };
type Comment = { id: string; author_id: string; body: string; visibility: string | null; created_at: string };
type EventRow = { id: string; actor_id: string | null; event_type: string; payload: Record<string, unknown> | null; created_at: string };
type Escalation = { id: string; requested_by: string; requester_role: string; reason: string; status: EscStatus; response: string | null; attended_by: string | null; attended_at: string | null; created_at: string };

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const FIELD: Record<string, string> = { subject: 'asunto', description: 'descripción', category: 'categoría', priority: 'prioridad', campus: 'plantel', area: 'salón/área' };

export default async function Detail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const id = (await params).id;
  const flash = await searchParams;
  const { s, user, p } = await access();
  const { data: t } = await s.from('tickets').select('*').eq('id', id).single();
  if (!t || (p.role === 'solicitante' && t.requester_id !== user.id)) notFound();
  const ticket = t as TicketRow & { description: string; resolution_notes?: string | null };
  const staff = p.role !== 'solicitante';
  const supervisor = p.role === 'directivo' || p.role === 'administrador';
  const isRequester = ticket.requester_id === user.id;
  const isMine = ticket.assignee_id === user.id;
  const closed = isClosed(ticket);

  const [{ data: commentsRaw }, { data: survey }, { data: agentsRaw }, { data: eventsRaw }, { data: escRaw }] = await Promise.all([
    s.from('ticket_comments').select('*').eq('ticket_id', id).order('created_at'),
    s.from('surveys').select('score,comment,submitted_at').eq('ticket_id', id).maybeSingle(),
    supervisor ? s.from('profiles').select('*').eq('role', 'agente').order('full_name') : Promise.resolve({ data: [] }),
    staff ? s.from('ticket_events').select('*').eq('ticket_id', id).order('created_at', { ascending: false }).limit(15) : Promise.resolve({ data: [] }),
    s.from('ticket_escalations').select('*').eq('ticket_id', id).order('created_at', { ascending: false }),
  ]);
  const comments = (commentsRaw ?? []) as Comment[];
  const events = (eventsRaw ?? []) as EventRow[];
  const agents = ((agentsRaw ?? []) as (Person & { active?: boolean })[]).filter((a) => a.active !== false);
  const escalations = (escRaw ?? []) as Escalation[];
  // Bitácora de seguimiento (la RLS solo muestra al solicitante la de sus propias escalaciones).
  const { data: escUpdRaw } = escalations.length
    ? await s.from('escalation_updates').select('*').eq('ticket_id', id).order('created_at')
    : { data: [] };
  const escUpdates = (escUpdRaw ?? []) as EscUpdate[];

  // También los agentes a quienes se asignó en el historial, para mostrar su nombre.
  const assignedInHistory = events.map((e) => (e.payload as { asignacion?: { a?: string | null } } | null)?.asignacion?.a ?? null);
  const ids = [...new Set([ticket.requester_id, ticket.assignee_id, ...comments.map((c) => c.author_id), ...events.map((e) => e.actor_id), ...assignedInHistory, ...escalations.flatMap((e) => [e.requested_by, e.attended_by]), ...escUpdates.map((u) => u.author_id)].filter(Boolean))] as string[];
  const { data: peopleRaw } = await s.from('profiles').select('*').in('id', ids);
  const people = new Map(((peopleRaw ?? []) as Person[]).map((x) => [x.id, x]));
  const agent = ticket.assignee_id ? people.get(ticket.assignee_id) ?? null : null;
  const requester = people.get(ticket.requester_id);
  const canRate = isRequester && closed && !survey && Boolean(ticket.assignee_id);
  const campuses = staff ? await campusNames(s) : [];

  // Escalación disponible para el solicitante y para el agente asignado.
  const myLast = escalations.find((e) => e.requested_by === user.id) ?? null;
  const reqRule = p.role === 'solicitante' && !closed ? requesterEscalation(ticket, myLast?.created_at ?? null) : null;
  const agentPending = p.role === 'agente' && Boolean(myLast && isOpenEscalation(myLast.status));
  // Cuando soporte espera una respuesta del solicitante, se le muestra qué se le pidió (último mensaje público del personal).
  const waitingOnRequester = isRequester && ticket.status === 'en_espera';
  const publicDesc = [...comments].reverse().filter((c) => c.visibility !== 'internal');
  const lastStaffAsk = waitingOnRequester
    ? publicDesc.find((c) => c.body.startsWith('Necesitamos tu respuesta:')) ?? publicDesc.find((c) => c.author_id !== ticket.requester_id) ?? null
    : null;

  const options = [ticket.status, ...TRANSITIONS[ticket.status]].map((x) => ({ value: x, label: x === ticket.status ? `${STATUS_LABEL[x]} (actual)` : STATUS_LABEL[x] }));
  const id1 = id;

  return (
    <div className="dash">
      <Link href="/tickets" className="link-more back"><Icon name="arrowRight" size={16} className="flip" />Volver a tickets</Link>
      {flash.ok && <p className="flash ok" role="status"><Icon name="checkCircle" size={18} />{flash.ok}</p>}
      {flash.error && <p className="flash err" role="alert"><Icon name="alert" size={18} />{flash.error}</p>}

      <header className="glass ticket-head reveal">
        <div>
          <span className="folio">{ticket.folio} · {ticket.campus}{ticket.area ? ` · ${ticket.area}` : ''}{staff ? ` · ${ticket.category}` : ''}</span>
          <h1>{ticket.subject}</h1>
          <div className="tr-meta start">
            <StatusChip status={ticket.status} audience={staff ? 'staff' : 'solicitante'} /><PriorityChip priority={ticket.priority} />
            {escalations.some((e) => isOpenEscalation(e.status)) && <span className="chip sla-vencido"><Icon name="alert" size={13} />Escalado</span>}
          </div>
        </div>
        <div className="head-sla"><small className="muted">SLA de resolución · vence {fmt(ticket.resolution_due_at)}</small><SlaBar ticket={ticket} /></div>
      </header>

      {/* Acción principal del agente: tomar el ticket si nadie lo tiene. */}
      {p.role === 'agente' && !ticket.assignee_id && !closed && (
        <section className="glass take-banner reveal">
          <div><strong>Este ticket está disponible</strong><span className="muted">Al tomarlo quedará a tu nombre y pasará a En proceso.</span></div>
          <form action={takeTicket.bind(null, id1)}><button className="cta"><Icon name="hand" size={18} />Tomar ticket</button></form>
        </section>
      )}

      {/* Solicitante: soporte necesita su respuesta para continuar. */}
      {waitingOnRequester && (
        <section className="glass reply-banner reveal">
          <span className="reply-icon"><Icon name="hand" size={22} /></span>
          <div>
            <strong>Soporte necesita tu respuesta para continuar</strong>
            {lastStaffAsk
              ? <p>“{lastStaffAsk.body.replace(/^Necesitamos tu respuesta:\s*/, '')}” <small className="muted">— {people.get(lastStaffAsk.author_id)?.full_name ?? 'Soporte'}, {relativeTime(lastStaffAsk.created_at)}</small></p>
              : <p className="muted">Revisa la conversación y responde abajo.</p>}
            <small className="muted">Cuando respondas, el ticket regresa automáticamente a atención.</small>
          </div>
          <a href="#compose-body" className="button small"><Icon name="message" size={16} />Responder</a>
        </section>
      )}

      <div className="detail-grid">
        <div className="detail-main">
          <section className="glass panel reveal" style={{ '--d': '60ms' } as React.CSSProperties}>
            <header className="panel-head"><h2><Icon name="ticket" size={18} />Descripción</h2></header>
            <div className="author-line">
              <Avatar name={requester?.full_name} src={requester?.avatar_url} size={36} />
              <span><strong>{requester?.full_name ?? (isRequester ? 'Tú' : 'Solicitante')}</strong><small>{requester?.job_title ?? 'Solicitante'} · {fmt(ticket.created_at)}</small></span>
            </div>
            <p className="description">{ticket.description}</p>
          </section>

          {ticket.resolution_notes && (
            <section className="glass panel solution reveal" style={{ '--d': '90ms' } as React.CSSProperties}>
              <header className="panel-head"><h2><Icon name="checkCircle" size={18} />Solución aplicada</h2>{ticket.resolved_at && <span className="muted small-print">{fmt(ticket.resolved_at)}</span>}</header>
              <p className="description">{ticket.resolution_notes}</p>
            </section>
          )}

          <section className="glass panel reveal" style={{ '--d': '120ms' } as React.CSSProperties}>
            <header className="panel-head"><h2><Icon name="message" size={18} />Conversación</h2><span className="muted small-print">{comments.length} {comments.length === 1 ? 'mensaje' : 'mensajes'}</span></header>
            {comments.length === 0 && <p className="muted">Aún no hay mensajes. Escribe abajo para continuar la conversación.</p>}
            <ul className="thread">
              {comments.map((c) => {
                const who = people.get(c.author_id);
                const internal = c.visibility === 'internal';
                return (
                  <li key={c.id} className={`msg${c.author_id === user.id ? ' mine' : ''}${internal ? ' internal' : ''}${c.body.startsWith('Solución aplicada:') ? ' solution-msg' : ''}`}>
                    <Avatar name={who?.full_name} src={who?.avatar_url} size={34} />
                    <div className="bubble">
                      <span className="msg-head"><strong>{who?.full_name ?? 'Usuario'}</strong>{internal && <span className="chip sla-riesgo"><Icon name="eyeOff" size={12} />Nota interna</span>}<small>{relativeTime(c.created_at)}</small></span>
                      <p>{c.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <form action={addComment.bind(null, id1)} className="form compose">
              <label><span className="sr-only">Mensaje</span><textarea id="compose-body" name="body" required minLength={2} placeholder="Escribe un mensaje…" /></label>
              <div className="compose-actions">
                {staff && <QuickReplies target="compose-body" name={requester?.full_name ?? ''} />}
                {staff && <label className="check"><input type="checkbox" name="internal" />Nota interna (no la ve el solicitante)</label>}
                <button className="small"><Icon name="message" size={16} />Enviar</button>
              </div>
            </form>
          </section>
        </div>

        <aside className="detail-side">
          <section className="glass panel reveal" style={{ '--d': '80ms' } as React.CSSProperties}>
            <AgentCard agent={agent} />
          </section>

          {(canRate || survey) && (
            <section className={`glass panel reveal${canRate ? ' rate-panel' : ''}`} style={{ '--d': '140ms' } as React.CSSProperties}>
              <header className="panel-head"><h2><Icon name="star" size={18} />Evaluación de la atención</h2></header>
              {canRate ? (
                <form action={rateTicket.bind(null, id1)} className="form">
                  <p className="muted small-print">Tu opinión ayuda a mejorar el servicio y se refleja en el ranking de agentes.</p>
                  <StarInput />
                  <label>Comentario (opcional)<textarea name="comment" maxLength={500} placeholder="¿Qué tal fue la atención?" style={{ minHeight: 80 }} /></label>
                  <button><Icon name="check" size={16} />Enviar evaluación</button>
                </form>
              ) : survey && (
                <div className="survey-done">
                  <Stars value={survey.score} size={20} />
                  {survey.comment && <p>“{survey.comment}”</p>}
                  <small className="muted">{isRequester ? 'Gracias por tu evaluación' : 'Evaluado por el solicitante'} · {relativeTime(survey.submitted_at)}</small>
                </div>
              )}
            </section>
          )}

          <section className="glass panel reveal" style={{ '--d': '200ms' } as React.CSSProperties}>
            <header className="panel-head"><h2><Icon name="list" size={18} />Detalles</h2></header>
            <dl className="facts">
              <dt>Estado</dt><dd>{STATUS_LABEL[ticket.status]}</dd>
              <dt>Prioridad</dt><dd>{PRIORITY_LABEL[ticket.priority]}</dd>
              <dt>Plantel</dt><dd>{ticket.campus}</dd>
              <dt>Salón / área</dt><dd>{ticket.area || '—'}</dd>
              {staff && <><dt>Categoría</dt><dd>{ticket.category}</dd></>}
              <dt>SLA</dt><dd>{slaText(ticket)}</dd>
              <dt>Creado</dt><dd>{fmt(ticket.created_at)}</dd>
              <dt>Actualizado</dt><dd>{relativeTime(ticket.updated_at ?? ticket.created_at)}</dd>
              {ticket.assigned_at && <><dt>Asignado</dt><dd>{fmt(ticket.assigned_at)}</dd></>}
              {ticket.resolved_at && <><dt>Resuelto</dt><dd>{fmt(ticket.resolved_at)}</dd></>}
              {ticket.resolved_at && ticket.assigned_at && <><dt>Tiempo de solución</dt><dd>{formatDuration(Math.max(0, new Date(ticket.resolved_at).getTime() - new Date(ticket.assigned_at).getTime()))}</dd></>}
            </dl>
          </section>

          {/* El solicitante no elige categoría: la asigna quien atiende. Es obligatoria para resolver. */}
          {(supervisor || (p.role === 'agente' && isMine)) && ticket.category === UNCLASSIFIED && (
            <section className="glass panel classify-panel reveal" style={{ '--d': '200ms' } as React.CSSProperties}>
              <header className="panel-head"><h2><Icon name="filter" size={18} />Clasifica este ticket</h2></header>
              <p className="muted small-print">El solicitante no elige categoría. Asígnala tú; se requiere para resolverlo y alimenta los reportes.</p>
              <form action={classifyTicket.bind(null, id1)} className="classify-form">
                <label><span className="sr-only">Categoría</span>
                  <select name="category" required defaultValue="">
                    <option value="" disabled>Elige una categoría</option>
                    {AGENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <button className="small"><Icon name="check" size={16} />Guardar categoría</button>
              </form>
            </section>
          )}

          {/* Gestión: directivo/administración siempre; el agente solo en los tickets que tomó (sin asignar a otros). */}
          {(supervisor || (p.role === 'agente' && isMine)) && (
            <section className="glass panel reveal" style={{ '--d': '240ms' } as React.CSSProperties}>
              <header className="panel-head"><h2><Icon name="settings" size={18} />Gestionar</h2></header>
              <ManageForm action={manageTicket.bind(null, id1)} options={options} current={ticket.status}
                canAssign={supervisor} assignee={ticket.assignee_id}
                agents={agents.map((a) => ({ id: a.id, label: `${a.full_name}${a.campus ? ` · ${a.campus}` : ''}` }))} />
              {!supervisor && <p className="muted small-print">La reasignación la hace dirección. Si necesitas apoyo, escala el ticket.</p>}
            </section>
          )}

          {/* Escalación */}
          {!closed && (p.role === 'solicitante' || (p.role === 'agente' && isMine)) && (
            <section className="glass panel escalate-panel reveal" style={{ '--d': '270ms' } as React.CSSProperties}>
              <header className="panel-head"><h2><Icon name="alert" size={18} />Escalar ticket</h2></header>
              {p.role === 'agente' ? (
                agentPending ? (
                  <p className="muted small-print"><Icon name="hourglass" size={13} /> Escalaste este ticket {relativeTime(myLast!.created_at)} · {ESC_STATUS_LABEL[myLast!.status]}. Podrás volver a escalar cuando dirección cierre esta escalación.</p>
                ) : (
                  <form action={escalateTicket.bind(null, id1)} className="form">
                    <p className="muted small-print">Envía el ticket a tu director cuando necesites autorización, recursos o apoyo de otra área.</p>
                    <label>¿Por qué lo escalas?<textarea name="reason" required minLength={10} maxLength={1000} placeholder="Ej. Requiere compra de refacción; el equipo está fuera de garantía." /></label>
                    <button className="escalate"><Icon name="alert" size={16} />Escalar a dirección</button>
                  </form>
                )
              ) : reqRule && (
                <RequesterEscalate action={escalateTicket.bind(null, id1)} availableAt={reqRule.availableAt ?? 0} rule={reqRule.rule} />
              )}
            </section>
          )}

          {escalations.length > 0 && (
            <section className="glass panel reveal" style={{ '--d': '300ms' } as React.CSSProperties}>
              <header className="panel-head"><h2><Icon name="history" size={18} />Escalaciones</h2>{supervisor && <Link href="/escalaciones" className="link-more">Bandeja<Icon name="arrowRight" size={14} /></Link>}</header>
              <ul className="esc-list">
                {escalations.map((e) => {
                  const log = escUpdates.filter((u) => u.escalation_id === e.id);
                  return (
                    <li key={e.id} className={`esc-item ${e.status}`}>
                      <span className="esc-head">
                        <strong>{people.get(e.requested_by)?.full_name ?? (e.requester_role === 'solicitante' ? 'Solicitante' : 'Agente')}</strong>
                        <span className={`chip ${ESC_STATUS_CHIP[e.status] ?? 'sla-ok'}`}>{ESC_STATUS_LABEL[e.status] ?? e.status}</span>
                      </span>
                      <small className="muted">{e.requester_role === 'solicitante' ? 'Solicitante' : 'Agente'} · {relativeTime(e.created_at)}</small>
                      <p>“{e.reason}”</p>
                      {log.length > 0
                        ? <EscTimeline updates={log} people={people} />
                        : e.status === 'pendiente' && <small className="muted"><Icon name="hourglass" size={12} /> Esperando respuesta de dirección</small>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {(supervisor || (p.role === 'agente' && isMine)) && (
            <section className="glass panel reveal" style={{ '--d': '320ms' } as React.CSSProperties}>
              <details className="edit-ticket">
                <summary className="panel-head"><h2><Icon name="edit" size={18} />Editar ticket</h2><Icon name="chevDown" size={18} className="chev" /></summary>
                <form action={editTicket.bind(null, id1)} className="form">
                  {p.role === 'administrador' && <>
                    <label>Asunto<input name="subject" required minLength={5} maxLength={180} defaultValue={ticket.subject} /></label>
                    <label>Descripción<textarea name="description" required minLength={10} defaultValue={ticket.description} style={{ minHeight: 100 }} /></label>
                  </>}
                  <label>Categoría
                    <select name="category" defaultValue={ticket.category}>{(ticket.category === UNCLASSIFIED ? [UNCLASSIFIED, ...AGENT_CATEGORIES] : AGENT_CATEGORIES).map((c) => <option key={c} value={c}>{c}</option>)}</select>
                  </label>
                  <label>Prioridad
                    <select name="priority" defaultValue={ticket.priority}>{PRIORITY_ORDER.map((x) => <option key={x} value={x}>{PRIORITY_LABEL[x as Priority]}</option>)}</select>
                  </label>
                  <label>Plantel
                    <select name="campus" defaultValue={ticket.campus}>
                      {(campuses.includes(ticket.campus) ? campuses : [...campuses, ticket.campus]).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <label>Salón / área<input name="area" maxLength={80} defaultValue={ticket.area ?? ''} placeholder="Ej. Aula 204" /></label>
                  <button><Icon name="check" size={16} />Guardar edición</button>
                  {p.role !== 'administrador' && <small className="muted">Asunto y descripción solo los corrige un administrador.</small>}
                </form>
              </details>
            </section>
          )}

          {staff && events.length > 0 && (
            <section className="glass panel reveal" style={{ '--d': '340ms' } as React.CSSProperties}>
              <header className="panel-head"><h2><Icon name="clock" size={18} />Historial</h2></header>
              <ul className="timeline">
                {events.map((e) => {
                  const pl = (e.payload ?? {}) as { estado?: { de: Status; a: Status }; asignacion?: { a: string | null }; edicion?: Record<string, unknown>; escalacion?: unknown; solucion?: boolean };
                  const parts: string[] = [];
                  if (pl.asignacion !== undefined) parts.push(`Asignado a ${pl.asignacion.a ? people.get(pl.asignacion.a)?.full_name ?? 'agente' : 'nadie'}`);
                  if (pl.estado) parts.push(`${STATUS_LABEL[pl.estado.de] ?? pl.estado.de} → ${STATUS_LABEL[pl.estado.a] ?? pl.estado.a}`);
                  if (pl.solucion) parts.push('con solución');
                  if (pl.edicion) parts.push(`Editó ${Object.keys(pl.edicion).map((k) => FIELD[k] ?? k).join(', ')}`);
                  if (pl.escalacion) parts.push('Escaló a dirección');
                  const text = parts.join(' · ') || e.event_type.replaceAll('_', ' ');
                  return <li key={e.id}><span className="dot" /><div><strong>{text}</strong><small>{people.get(e.actor_id ?? '')?.full_name ?? 'Sistema'} · {relativeTime(e.created_at)}</small></div></li>;
                })}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
