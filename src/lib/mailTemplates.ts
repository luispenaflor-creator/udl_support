// Plantillas de correo (HTML con estilos en línea para clientes de correo + texto plano). Sin dependencias.

export type MailEvent =
  | 'ticket_creado' | 'ticket_recibido' | 'ticket_asignado' | 'comentario' | 'estado'
  | 'ticket_resuelto' | 'escalacion' | 'escalacion_atendida' | 'prueba';

export type MailTicket = { id: string; folio: string; subject: string; campus: string; priority: string; status: string };

const PRIORITY: Record<string, string> = { urgente: 'Urgente', alta: 'Alta', media: 'Media', baja: 'Baja' };
const STATUS: Record<string, string> = { nuevo: 'Nuevo', abierto: 'Abierto', en_progreso: 'En proceso', en_espera: 'En espera', resuelto: 'Resuelto', cerrado: 'Cerrado' };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

type Copy = { subject: string; title: string; intro: string; cta: string };

function copy(event: MailEvent, t: MailTicket | null, name: string, actor: string): Copy {
  const f = t ? `${t.folio}` : '';
  switch (event) {
    case 'ticket_recibido': return { subject: `[${f}] Recibimos tu solicitud`, title: 'Recibimos tu solicitud', intro: `Hola ${name}, tu ticket quedó registrado. Te avisaremos por este medio cuando un agente lo tome.`, cta: 'Ver mi ticket' };
    case 'ticket_creado': return { subject: `[${f}] Nuevo ticket ${PRIORITY[t!.priority] ?? ''} · ${t!.campus}`, title: 'Nuevo ticket disponible', intro: `Hola ${name}, ${actor} registró una solicitud en ${t!.campus} que está disponible para tomar.`, cta: 'Revisar y tomar' };
    case 'ticket_asignado': return { subject: `[${f}] Ticket asignado`, title: 'Ticket asignado', intro: `Hola ${name}, el ticket quedó asignado y ya está en atención.`, cta: 'Abrir ticket' };
    case 'comentario': return { subject: `[${f}] Nuevo mensaje de ${actor}`, title: 'Tienes un mensaje nuevo', intro: `Hola ${name}, ${actor} escribió en el ticket:`, cta: 'Responder' };
    case 'estado': if (t!.status === 'en_espera') return { subject: `[${f}] Necesitamos tu respuesta para continuar`, title: 'Soporte necesita tu respuesta', intro: `Hola ${name}, ${actor} necesita información tuya para continuar con tu solicitud:`, cta: 'Responder' };
      return { subject: `[${f}] Cambio de estado: ${STATUS[t!.status] ?? t!.status}`, title: `Tu ticket está ${STATUS[t!.status]?.toLowerCase() ?? t!.status}`, intro: `Hola ${name}, ${actor} actualizó el estado de tu solicitud.`, cta: 'Ver ticket' };
    case 'ticket_resuelto': return { subject: `[${f}] Tu solicitud fue resuelta`, title: 'Solicitud resuelta', intro: `Hola ${name}, ${actor} marcó tu ticket como resuelto. Esto fue lo que se realizó:`, cta: 'Calificar la atención' };
    case 'escalacion': return { subject: `[${f}] Ticket escalado · requiere atención de dirección`, title: 'Ticket escalado', intro: `Hola ${name}, ${actor} escaló este ticket. Motivo:`, cta: 'Atender escalación' };
    case 'escalacion_atendida': return { subject: `[${f}] Seguimiento de dirección a tu escalación`, title: 'Seguimiento de tu escalación', intro: `Hola ${name}, ${actor} registró seguimiento en la escalación:`, cta: 'Ver ticket' };
    case 'prueba': return { subject: 'Prueba de correo · UDL Support', title: 'El correo funciona', intro: `Hola ${name}, este es un mensaje de prueba enviado desde la configuración de UDL Support.`, cta: 'Abrir UDL Support' };
  }
}

// Texto corto para el aviso dentro de la app (campana y notificación emergente).
export function inAppText(opts: { event: MailEvent; ticket: MailTicket; actorName: string; message?: string | null }): { title: string; body: string } {
  const { event, ticket: t, actorName: a } = opts;
  const msg = opts.message?.replace(/\s+/g, ' ').trim();
  const short = (s: string) => (s.length > 140 ? `${s.slice(0, 137)}…` : s);
  const title: Record<MailEvent, string> = {
    ticket_recibido: 'Recibimos tu solicitud',
    ticket_creado: `Nuevo ticket ${PRIORITY[t.priority]?.toLowerCase() ?? ''} en ${t.campus}`,
    ticket_asignado: `${a} atiende el ticket`,
    comentario: `Mensaje nuevo de ${a}`,
    estado: t.status === 'en_espera' ? 'Soporte necesita tu respuesta' : `Tu ticket está ${STATUS[t.status]?.toLowerCase() ?? t.status}`,
    ticket_resuelto: 'Tu solicitud fue resuelta',
    escalacion: `${a} escaló un ticket`,
    escalacion_atendida: 'Seguimiento de dirección a la escalación',
    prueba: 'Aviso de prueba',
  };
  return { title: `${t.folio} · ${title[event]}`, body: short(msg || t.subject) };
}

export function renderMail(opts: { event: MailEvent; ticket: MailTicket | null; recipientName: string; actorName: string; message?: string | null; appUrl: string }) {
  const { event, ticket, appUrl } = opts;
  const name = opts.recipientName.split(' ')[0] || opts.recipientName;
  const c = copy(event, ticket, name, opts.actorName);
  // Las escalaciones llevan a la bandeja de dirección; lo demás, al ticket.
  const href = event === 'escalacion' ? `${appUrl}/escalaciones` : ticket ? `${appUrl}/tickets/${ticket.id}` : appUrl;
  const message = opts.message?.trim() || null;

  const html = `<!doctype html><html lang="es"><body style="margin:0;padding:0;background:#f4f3f7;font-family:Segoe UI,Arial,sans-serif;color:#1e1b2e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3f7;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e2ec">
<tr><td style="background:#1e1b2e;padding:18px 24px;color:#ffffff;font-size:18px;font-weight:700">UDL <span style="color:#5eead4">Support</span><div style="font-size:12px;font-weight:400;color:#b7b2c4;margin-top:2px">Mesa de ayuda · Universidad de Londres</div></td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 10px;font-size:20px;color:#1e1b2e">${esc(c.title)}</h1>
<p style="margin:0 0 14px;font-size:15px;line-height:1.5">${esc(c.intro)}</p>
${message ? `<div style="margin:0 0 16px;padding:12px 14px;background:#f8f7fb;border-left:4px solid #0d9488;border-radius:6px;font-size:14px;line-height:1.5;white-space:pre-wrap">${esc(message)}</div>` : ''}
${ticket ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 18px;font-size:13px;border:1px solid #e5e2ec;border-radius:8px">
<tr><td style="padding:10px 12px;color:#6b6680">Folio</td><td style="padding:10px 12px;font-weight:600;font-family:Consolas,monospace">${esc(ticket.folio)}</td></tr>
<tr><td style="padding:10px 12px;color:#6b6680;border-top:1px solid #eee">Asunto</td><td style="padding:10px 12px;border-top:1px solid #eee">${esc(ticket.subject)}</td></tr>
<tr><td style="padding:10px 12px;color:#6b6680;border-top:1px solid #eee">Plantel · Prioridad</td><td style="padding:10px 12px;border-top:1px solid #eee">${esc(ticket.campus)} · ${esc(PRIORITY[ticket.priority] ?? ticket.priority)}</td></tr>
<tr><td style="padding:10px 12px;color:#6b6680;border-top:1px solid #eee">Estado</td><td style="padding:10px 12px;border-top:1px solid #eee">${esc(STATUS[ticket.status] ?? ticket.status)}</td></tr>
</table>` : ''}
<a href="${esc(href)}" style="display:inline-block;background:#246bfe;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;font-size:15px">${esc(c.cta)}</a>
</td></tr>
<tr><td style="padding:14px 24px;background:#f8f7fb;color:#6b6680;font-size:12px;line-height:1.5">Recibes este aviso porque participas en este ticket. Para responder, entra a UDL Support; las respuestas a este correo no se registran en el ticket.</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    c.title, '', c.intro, message ? `\n${message}\n` : '',
    ticket ? `Folio: ${ticket.folio}\nAsunto: ${ticket.subject}\nPlantel: ${ticket.campus} · Prioridad: ${PRIORITY[ticket.priority] ?? ticket.priority}\nEstado: ${STATUS[ticket.status] ?? ticket.status}\n` : '',
    `${c.cta}: ${href}`, '', 'UDL Support · Mesa de ayuda Universidad de Londres',
  ].join('\n');

  return { subject: c.subject, html, text };
}
