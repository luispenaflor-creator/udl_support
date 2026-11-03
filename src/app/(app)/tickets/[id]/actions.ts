'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { notifyTicket } from '@/lib/notify';
import { access } from '@/lib/auth';
import { allCampusNames } from '@/lib/campuses';
import { CATEGORIES, PRIORITY_ORDER, canTransition, type Status } from '@/lib/dashboard';
import { MIN_REASON, requesterEscalation, waitText } from '@/lib/escalation';

const CLOSING: Status[] = ['resuelto', 'cerrado'];
const back = (id: string, kind: 'ok' | 'error', msg: string): never => redirect(`/tickets/${id}?${kind}=${encodeURIComponent(msg)}`);
const done = (id: string, msg: string): never => {
  revalidatePath(`/tickets/${id}`);
  revalidatePath('/', 'layout');
  return back(id, 'ok', msg);
};

export async function addComment(id: string, f: FormData) {
  const { s, user, p } = await access();
  const body = String(f.get('body') ?? '').trim();
  if (body.length < 2) back(id, 'error', 'Escribe un mensaje');
  const internal = p.role !== 'solicitante' && f.get('internal') === 'on';
  const { error } = await s.from('ticket_comments').insert({ ticket_id: id, author_id: user.id, body, visibility: internal ? 'internal' : 'public' });
  if (error) back(id, 'error', 'No se pudo enviar el mensaje');
  // Las notas internas no se notifican por correo.
  if (!internal) after(() => notifyTicket('comentario', id, { actorId: user.id, message: body }));
  // Si el solicitante responde a un ticket "Esperando al solicitante", la base lo regresa a atención (trigger);
  // se revalida todo el layout para actualizar los contadores del menú.
  revalidatePath('/', 'layout');
}

// El agente toma un ticket sin asignar: queda a su nombre y pasa a "En proceso".
export async function takeTicket(id: string) {
  const { s, user } = await access(['agente']);
  const { data: t } = await s.from('tickets').select('status,assignee_id').eq('id', id).single();
  if (!t) back(id, 'error', 'El ticket no existe');
  if (t!.assignee_id) back(id, 'error', 'Otro agente ya tomó este ticket');
  if (CLOSING.includes(t!.status)) back(id, 'error', 'El ticket ya está cerrado');
  const { data: upd, error } = await s.from('tickets')
    .update({ assignee_id: user.id, status: 'en_progreso', updated_at: new Date().toISOString() })
    .eq('id', id).is('assignee_id', null).select('id');
  if (error || !upd?.length) back(id, 'error', 'No se pudo tomar el ticket; puede que otro agente lo haya tomado');
  await s.from('ticket_events').insert({ ticket_id: id, actor_id: user.id, event_type: 'asignacion', payload: { asignacion: { de: null, a: user.id }, estado: { de: t!.status, a: 'en_progreso' }, origen: 'tomado' } });
  after(() => notifyTicket('ticket_asignado', id, { actorId: user.id }));
  done(id, 'Tomaste el ticket. Ahora está En proceso.');
}

/**
 * Cambio de estado y asignación.
 * - Directivo/administración: estado y (re)asignación a cualquier agente.
 * - Agente: solo estado de sus propios tickets; no puede asignar ni reasignar.
 * Pasar a Resuelto/Cerrado exige describir la solución aplicada.
 */
export async function manageTicket(id: string, f: FormData) {
  const { s, user, p } = await access(['agente', 'directivo', 'administrador']);
  const supervisor = p.role === 'directivo' || p.role === 'administrador';
  const { data: cur } = await s.from('tickets').select('status,assignee_id,resolved_at').eq('id', id).single();
  if (!cur) back(id, 'error', 'El ticket no existe');
  if (!supervisor && cur!.assignee_id !== user.id) back(id, 'error', 'Solo puedes gestionar los tickets que tomaste');

  const status = String(f.get('status')) as Status;
  if (!canTransition(cur!.status, status)) back(id, 'error', 'Ese cambio de estado no está permitido');

  let assignee: string | null = cur!.assignee_id;
  if (supervisor) {
    const raw = String(f.get('assignee_id') ?? '');
    if (raw) {
      const { data: a } = await s.from('profiles').select('id').eq('id', raw).eq('role', 'agente').maybeSingle();
      if (!a) back(id, 'error', 'Solo se puede asignar a perfiles con rol agente');
      assignee = a!.id;
    } else assignee = null;
  }

  const closing = CLOSING.includes(status) && !CLOSING.includes(cur!.status);
  const resolution = String(f.get('resolution') ?? '').trim();
  if (closing && resolution.length < 10) back(id, 'error', 'Describe qué se realizó para resolverlo (mínimo 10 caracteres)');
  if (closing && !assignee) back(id, 'error', 'Asigna un agente antes de resolver o cerrar el ticket');
  // "En espera" = soporte espera al solicitante: hay que decirle qué se necesita de él.
  const asking = status === 'en_espera' && cur!.status !== 'en_espera';
  const question = String(f.get('question') ?? '').trim();
  if (asking && question.length < 10) back(id, 'error', 'Escribe qué necesitas que responda el solicitante (mínimo 10 caracteres)');
  // La pregunta se guarda ANTES de cambiar el estado: el trigger que reanuda el ticket cuando el solicitante
  // escribe solo actúa en "en_espera"; así no la confunde con una respuesta (p. ej. si quien gestiona es también el solicitante).
  if (asking) {
    const { error: qe } = await s.from('ticket_comments').insert({ ticket_id: id, author_id: user.id, body: `Necesitamos tu respuesta: ${question}`, visibility: 'public' });
    if (qe) back(id, 'error', 'No se pudo enviar la pregunta');
  }

  const patch: Record<string, unknown> = {
    status, assignee_id: assignee, updated_at: new Date().toISOString(),
    resolved_at: CLOSING.includes(status) ? cur!.resolved_at ?? new Date().toISOString() : null,
  };
  if (closing) patch.resolution_notes = resolution;
  const { error } = await s.from('tickets').update(patch).eq('id', id);
  if (error) back(id, 'error', /resolution_notes/.test(error.message) ? 'Falta ejecutar la migración 202611050001 en Supabase' : 'No tienes permiso para este cambio');

  // La solución queda visible para el solicitante en la conversación.
  if (closing) await s.from('ticket_comments').insert({ ticket_id: id, author_id: user.id, body: `Solución aplicada: ${resolution}`, visibility: 'public' });
  const changes: Record<string, unknown> = {};
  if (cur!.status !== status) changes.estado = { de: cur!.status, a: status };
  if (cur!.assignee_id !== assignee) changes.asignacion = { de: cur!.assignee_id, a: assignee };
  if (closing) changes.solucion = true;
  if (Object.keys(changes).length) await s.from('ticket_events').insert({ ticket_id: id, actor_id: user.id, event_type: 'actualizacion', payload: changes });
  after(async () => {
    if (assignee && cur!.assignee_id !== assignee) await notifyTicket('ticket_asignado', id, { actorId: user.id });
    if (closing) await notifyTicket('ticket_resuelto', id, { actorId: user.id, message: resolution });
    else if (cur!.status !== status) await notifyTicket('estado', id, { actorId: user.id, message: asking ? question : null });
  });
  done(id, closing ? 'Ticket resuelto. La solución se compartió con el solicitante.'
    : asking ? 'Pregunta enviada. El ticket espera la respuesta del solicitante.' : 'Cambios guardados.');
}

// Corrección de clasificación: agente (en sus tickets), directivo y administración. Asunto y descripción solo administración.
export async function editTicket(id: string, f: FormData) {
  const { s, user, p } = await access(['agente', 'directivo', 'administrador']);
  const { data: cur } = await s.from('tickets').select('subject,description,category,priority,campus,assignee_id').eq('id', id).single();
  if (!cur) back(id, 'error', 'El ticket no existe');
  if (p.role === 'agente' && cur!.assignee_id !== user.id) back(id, 'error', 'Solo puedes editar los tickets que tomaste');
  const next: Record<string, string> = { category: String(f.get('category')), priority: String(f.get('priority')), campus: String(f.get('campus')) };
  if (!(CATEGORIES as readonly string[]).includes(next.category) || !(PRIORITY_ORDER as string[]).includes(next.priority) || !(await allCampusNames(s)).includes(next.campus)) {
    back(id, 'error', 'Categoría, prioridad o plantel no válidos');
  }
  if (p.role === 'administrador') {
    const subject = String(f.get('subject') ?? '').trim(), description = String(f.get('description') ?? '').trim();
    if (subject.length < 5 || subject.length > 180) back(id, 'error', 'El asunto debe tener entre 5 y 180 caracteres');
    if (description.length < 10) back(id, 'error', 'La descripción es demasiado corta');
    next.subject = subject; next.description = description;
  }
  const c = cur as Record<string, string>;
  const changes = Object.fromEntries(Object.entries(next).filter(([k, v]) => c[k] !== v).map(([k, v]) => [k, k === 'description' ? { editada: true } : { de: c[k], a: v }]));
  if (!Object.keys(changes).length) back(id, 'ok', 'Sin cambios');
  const { error } = await s.from('tickets').update({ ...next, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) back(id, 'error', 'No se pudo editar el ticket');
  await s.from('ticket_events').insert({ ticket_id: id, actor_id: user.id, event_type: 'edicion', payload: { edicion: changes } });
  if (p.role === 'administrador') await s.from('audit_logs').insert({ actor_id: user.id, action: 'ticket_editado', entity_type: 'tickets', entity_id: id, metadata: changes });
  done(id, 'Ticket actualizado.');
}

export async function rateTicket(id: string, f: FormData) {
  const { s, user } = await access();
  const score = Number(f.get('score'));
  if (!Number.isInteger(score) || score < 1 || score > 5) back(id, 'error', 'Elige de 1 a 5 estrellas');
  const comment = String(f.get('comment') ?? '').trim().slice(0, 500) || null;
  const { error } = await s.from('surveys').insert({ ticket_id: id, requester_id: user.id, score, comment, submitted_at: new Date().toISOString() });
  if (error) back(id, 'error', 'No se pudo guardar tu evaluación');
  done(id, '¡Gracias por tu evaluación!');
}

/**
 * Escalación.
 * - Agente: escala a su director un ticket que tiene asignado, explicando el motivo. Una pendiente a la vez.
 * - Solicitante: según tiempos de espera por prioridad (src/lib/escalation.ts).
 */
export async function escalateTicket(id: string, f: FormData) {
  const { s, user, p } = await access(['agente', 'solicitante']);
  const reason = String(f.get('reason') ?? '').trim();
  if (reason.length < MIN_REASON) back(id, 'error', `Explica el motivo de la escalación (mínimo ${MIN_REASON} caracteres)`);
  const { data: t } = await s.from('tickets').select('status,priority,created_at,assignee_id,requester_id').eq('id', id).single();
  if (!t) back(id, 'error', 'El ticket no existe');
  if (CLOSING.includes(t!.status)) back(id, 'error', 'El ticket ya está resuelto o cerrado');

  const { data: mine } = await s.from('ticket_escalations').select('created_at,status').eq('ticket_id', id).eq('requested_by', user.id).order('created_at', { ascending: false }).limit(1);
  const last = mine?.[0] ?? null;
  if (p.role === 'agente') {
    if (t!.assignee_id !== user.id) back(id, 'error', 'Solo puedes escalar tickets que tienes asignados');
    if (last && last.status !== 'cerrada') back(id, 'error', 'Ya tienes una escalación abierta para este ticket');
  } else {
    if (t!.requester_id !== user.id) back(id, 'error', 'Solo puedes escalar tus propias solicitudes');
    const rule = requesterEscalation(t!, last?.created_at ?? null);
    if (!rule.allowed) back(id, 'error', `Aún no puedes escalar. Disponible en ${waitText((rule.availableAt ?? 0) - Date.now())}.`);
  }

  const { error } = await s.from('ticket_escalations').insert({ ticket_id: id, requested_by: user.id, requester_role: p.role, reason });
  if (error) back(id, 'error', /ticket_escalations/.test(error.message) ? 'Falta ejecutar la migración 202611050001 en Supabase' : 'No se pudo escalar el ticket');
  if (p.role === 'agente') {
    await s.from('ticket_events').insert({ ticket_id: id, actor_id: user.id, event_type: 'escalacion', payload: { escalacion: { motivo: reason } } });
  }
  after(() => notifyTicket('escalacion', id, { actorId: user.id, message: reason }));
  done(id, p.role === 'agente' ? 'Ticket escalado a dirección.' : 'Escalación enviada. Dirección de soporte dará seguimiento.');
}
