// SOLO SERVIDOR. Notificaciones por correo (SMTP) de los eventos de tickets.
// - No envía nada si SMTP no está configurado: registra el intento como "omitido".
// - Usa la clave de servicio para leer destinatarios y escribir la bitácora; sin ella no hace nada.
// - Se invoca con after() para no retrasar la respuesta al usuario.
import nodemailer from 'nodemailer';
import { serviceClient } from './supabase/admin';
import { siteUrl } from './siteUrl';
import { inAppText, renderMail, type MailEvent, type MailTicket } from './mailTemplates';

type Profile = { id: string; email: string; full_name: string; role: string; campus: string | null; active?: boolean; notify_email?: boolean };

export const smtpConfigured = () => Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim());
const appUrl = siteUrl;

function transport() {
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}
const from = () => process.env.MAIL_FROM || `UDL Support <${process.env.SMTP_USER}>`;

/** Envía un correo y lo registra en notification_log. Devuelve el estado final. */
export async function sendMail(opts: { to: Profile; event: MailEvent; ticket: MailTicket | null; actorName: string; message?: string | null }) {
  const db = serviceClient();
  const { subject, html, text } = renderMail({ event: opts.event, ticket: opts.ticket, recipientName: opts.to.full_name, actorName: opts.actorName, message: opts.message, appUrl: appUrl() });
  let status: 'enviado' | 'fallido' | 'omitido' = 'omitido';
  let error: string | null = null;
  if (!smtpConfigured()) {
    error = 'SMTP no configurado';
  } else {
    try {
      await transport().sendMail({ from: from(), to: `${opts.to.full_name} <${opts.to.email}>`, subject, html, text, replyTo: process.env.MAIL_REPLY_TO || undefined });
      status = 'enviado';
    } catch (e) {
      status = 'fallido';
      error = e instanceof Error ? e.message.slice(0, 500) : 'Error desconocido';
    }
  }
  await db?.from('notification_log').insert({ event: opts.event, ticket_id: opts.ticket?.id ?? null, recipient: opts.to.email, subject, status, error });
  return { status, error };
}

/**
 * Notifica un evento de ticket a quien corresponda (nunca a quien realizó la acción):
 * - ticket_creado: confirmación al solicitante y aviso a agentes del plantel (o a todos si el plantel no tiene).
 * - ticket_asignado: agente asignado y solicitante.
 * - comentario (público): la contraparte (solicitante ↔ agente; si no hay agente, agentes del plantel).
 * - estado / ticket_resuelto: solicitante.
 * - escalacion: directivos del plantel y administradores.
 * - escalacion_atendida: quien escaló (`recipientId`).
 */
export async function notifyTicket(event: Exclude<MailEvent, 'ticket_recibido' | 'prueba'>, ticketId: string, opts: { actorId: string; message?: string | null; recipientId?: string }) {
  const db = serviceClient();
  if (!db) { console.warn(`[notify] ${event}: falta SUPABASE_SERVICE_ROLE_KEY; no se notificó`); return; }
  try {
    const { data: t } = await db.from('tickets').select('id,folio,subject,campus,priority,status,requester_id,assignee_id').eq('id', ticketId).single();
    if (!t) return;
    const { data: actor } = await db.from('profiles').select('full_name').eq('id', opts.actorId).maybeSingle();
    const actorName = actor?.full_name ?? 'UDL Support';
    const byId = async (id: string | null) => (id ? ((await db.from('profiles').select('*').eq('id', id).maybeSingle()).data as Profile | null) : null);
    const agentsOf = async (campus: string) => {
      const { data } = await db.from('profiles').select('*').eq('role', 'agente');
      const all = (data ?? []) as Profile[];
      const local = all.filter((a) => a.campus === campus);
      return local.length ? local : all;
    };

    // `mail: false` = solo aviso dentro de la app (p. ej. supervisión de tickets nuevos, para no saturar correos).
    const send: { to: Profile; event: MailEvent; mail: boolean }[] = [];
    const add = (p: Profile | null | undefined, ev: MailEvent = event, mail = true) => { if (p) send.push({ to: p, event: ev, mail }); };

    if (event === 'ticket_creado') {
      add(await byId(t.requester_id), 'ticket_recibido');
      for (const a of await agentsOf(t.campus)) add(a);
      const { data } = await db.from('profiles').select('*').in('role', ['directivo', 'administrador']);
      for (const d of (data ?? []) as Profile[]) if (d.role === 'administrador' || !d.campus || d.campus === t.campus) add(d, event, false);
    } else if (event === 'ticket_asignado') {
      add(await byId(t.assignee_id)); add(await byId(t.requester_id));
    } else if (event === 'comentario') {
      if (opts.actorId === t.requester_id) {
        if (t.assignee_id) add(await byId(t.assignee_id)); else for (const a of await agentsOf(t.campus)) add(a);
      } else add(await byId(t.requester_id));
    } else if (event === 'estado' || event === 'ticket_resuelto') {
      add(await byId(t.requester_id));
    } else if (event === 'escalacion') {
      const { data } = await db.from('profiles').select('*').in('role', ['directivo', 'administrador']);
      for (const d of (data ?? []) as Profile[]) if (d.role === 'administrador' || !d.campus || d.campus === t.campus) add(d);
    } else if (event === 'escalacion_atendida') {
      add(await byId(opts.recipientId ?? null));
    }

    // Sin duplicados, sin quien hizo la acción y solo cuentas activas.
    const seen = new Set<string>();
    const targets = send.filter(({ to }) => {
      if (to.id === opts.actorId || seen.has(to.id) || to.active === false) return false;
      seen.add(to.id);
      return true;
    });
    const ticket: MailTicket = { id: t.id, folio: t.folio, subject: t.subject, campus: t.campus, priority: t.priority, status: t.status };

    // 1) Aviso dentro de la app (campana, sonido y notificación emergente en tiempo real).
    if (targets.length) {
      const link = event === 'escalacion' ? '/escalaciones' : `/tickets/${t.id}`;
      const { error } = await db.from('notifications').insert(targets.map(({ to, event: ev }) => ({
        user_id: to.id, ticket_id: t.id, event: ev, link, ...inAppText({ event: ev, ticket, actorName, message: opts.message }),
      })));
      if (error) console.error(`[notify] aviso en app ${event}:`, error.message);
    }
    // 2) Correo, si la persona lo tiene habilitado.
    for (const { to, event: ev, mail } of targets) {
      if (!mail || to.notify_email === false || !to.email) continue;
      await sendMail({ to, event: ev, ticket, actorName, message: opts.message });
    }
  } catch (e) {
    console.error(`[notify] ${event} ${ticketId}:`, e);
  }
}
