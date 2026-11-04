import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { access } from '@/lib/auth';
import { PRIORITY_LABEL, PRIORITY_ORDER, relativeTime, type Priority } from '@/lib/dashboard';
import { hasServiceRole, serviceClient } from '@/lib/supabase/admin';
import { sendMail, smtpConfigured } from '@/lib/notify';
import { Icon } from '@/components/Icon';
import { Empty } from '@/components/dashboard';

type Policy = Record<Priority, { first: number; resolve: number }>;
type Log = { id: string; event: string; recipient: string; subject: string | null; status: string; error: string | null; created_at: string };

const DEFAULT_POLICY: Policy = { urgente: { first: 1, resolve: 4 }, alta: { first: 4, resolve: 24 }, media: { first: 8, resolve: 48 }, baja: { first: 24, resolve: 72 } };
const back = (kind: 'ok' | 'error', msg: string): never => redirect(`/admin?${kind}=${encodeURIComponent(msg)}`);
const EVENT_LABEL: Record<string, string> = {
  ticket_creado: 'Ticket nuevo', ticket_recibido: 'Confirmación', ticket_asignado: 'Asignación', comentario: 'Mensaje',
  estado: 'Cambio de estado', ticket_resuelto: 'Resuelto', escalacion: 'Escalación', escalacion_atendida: 'Escalación atendida', prueba: 'Prueba',
};

async function saveGeneral(f: FormData) {
  'use server';
  const { s, user } = await access(['administrador']);
  const email = String(f.get('email') ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back('error', 'Correo de recepción inválido');
  const { error } = await s.from('app_settings').update({ support_email: email }).eq('id', 1);
  if (error) back('error', error.message);
  await s.from('audit_logs').insert({ actor_id: user.id, action: 'configuracion_actualizada', entity_type: 'app_settings', entity_id: '1', metadata: { support_email: email } });
  back('ok', 'Correo de recepción guardado.');
}

async function saveSla(f: FormData) {
  'use server';
  const { s, user } = await access(['administrador']);
  const policy = {} as Policy;
  for (const p of PRIORITY_ORDER) {
    const first = Number(f.get(`${p}_first`)), resolve = Number(f.get(`${p}_resolve`));
    if (!(first >= 0.25 && first <= 720 && resolve >= 0.5 && resolve <= 2160)) back('error', `Revisa las horas de prioridad ${PRIORITY_LABEL[p].toLowerCase()}`);
    if (first > resolve) back('error', `En ${PRIORITY_LABEL[p].toLowerCase()} la primera respuesta no puede ser mayor que la resolución`);
    policy[p] = { first, resolve };
  }
  const { error } = await s.from('app_settings').update({ sla_policy: policy, first_response_hours: Math.round(policy.media.first), resolution_hours: Math.round(policy.media.resolve) }).eq('id', 1);
  if (error) back('error', /sla_policy/.test(error.message) ? 'Falta ejecutar la migración 202611060001 en Supabase' : error.message);
  await s.from('audit_logs').insert({ actor_id: user.id, action: 'configuracion_actualizada', entity_type: 'app_settings', entity_id: '1', metadata: { sla_policy: policy } });
  revalidatePath('/admin');
  back('ok', 'Plazos de SLA guardados. Aplican a tickets nuevos y a los que cambien de prioridad.');
}

async function testMail() {
  'use server';
  const { p } = await access(['administrador']);
  if (!smtpConfigured()) back('error', 'Configura SMTP_HOST, SMTP_USER y SMTP_PASS en el servidor antes de probar');
  const r = await sendMail({ to: p, event: 'prueba', ticket: null, actorName: p.full_name });
  if (r.status !== 'enviado') back('error', `No se pudo enviar: ${r.error}`);
  back('ok', `Correo de prueba enviado a ${p.email}. Revisa tu bandeja (y la carpeta de spam).`);
}

// Envía un aviso a la propia cuenta por el mismo camino que los reales (tabla notifications + tiempo real).
async function testNotice() {
  'use server';
  const { p } = await access(['administrador']);
  const db = serviceClient();
  if (!db) back('error', 'Los avisos requieren SUPABASE_SERVICE_ROLE_KEY en el servidor');
  const { error } = await db!.from('notifications').insert({
    user_id: p.id, event: 'prueba', title: 'Aviso de prueba', link: '/admin',
    body: 'Si escuchaste un sonido y ves este recuadro, los avisos en tiempo real funcionan.',
  });
  if (error) back('error', /notifications/.test(error.message) ? 'Falta ejecutar la migración 202611080001 en Supabase' : error.message);
  back('ok', 'Aviso de prueba enviado. Debe sonar y aparecer en la campana.');
}

export default async function Admin({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const { s } = await access(['administrador']);
  const [{ data: c }, { data: logRaw, error: logErr }] = await Promise.all([
    s.from('app_settings').select('*').eq('id', 1).single(),
    s.from('notification_log').select('*').order('created_at', { ascending: false }).limit(25),
  ]);
  const policy: Policy = { ...DEFAULT_POLICY, ...((c?.sla_policy as Policy | undefined) ?? {}) };
  const slaReady = Boolean(c && 'sla_policy' in c);
  const logs = (logRaw ?? []) as Log[];
  const smtp = smtpConfigured();
  const service = hasServiceRole();

  return (
    <div className="dash">
      <header className="page-head reveal"><div><h1>Configuración</h1><p className="muted">Parámetros generales, plazos de servicio y correo saliente</p></div></header>
      {sp.ok && <p className="flash ok" role="status"><Icon name="checkCircle" size={18} />{sp.ok}</p>}
      {sp.error && <p className="flash err" role="alert"><Icon name="alert" size={18} />{sp.error}</p>}

      <div className="grid-main">
        <section className="glass panel reveal span-2" style={{ '--d': '60ms' } as React.CSSProperties}>
          <header className="panel-head"><h2><Icon name="timer" size={18} />SLA por prioridad</h2><span className="muted small-print">Horas corridas · se calculan al crear el ticket</span></header>
          {!slaReady && <p className="note-box"><Icon name="alert" size={16} /><span>Ejecuta la migración <code>202611060001_sla_prioridad_notificaciones.sql</code> para activar plazos por prioridad.</span></p>}
          <form action={saveSla} className="form" style={{ maxWidth: 'none' }}>
            <div className="sla-table" role="table" aria-label="Plazos por prioridad">
              <div className="sla-row head" role="row"><span role="columnheader">Prioridad</span><span role="columnheader">Primera respuesta (h)</span><span role="columnheader">Resolución (h)</span></div>
              {PRIORITY_ORDER.map((p) => (
                <div key={p} className="sla-row" role="row">
                  <span role="cell" className={`chip pr-${p}`}>{PRIORITY_LABEL[p]}</span>
                  <label role="cell"><span className="sr-only">Primera respuesta {PRIORITY_LABEL[p]}</span><input type="number" name={`${p}_first`} min={0.25} max={720} step={0.25} required defaultValue={policy[p].first} /></label>
                  <label role="cell"><span className="sr-only">Resolución {PRIORITY_LABEL[p]}</span><input type="number" name={`${p}_resolve`} min={0.5} max={2160} step={0.5} required defaultValue={policy[p].resolve} /></label>
                </div>
              ))}
            </div>
            <p className="muted small-print">Si cambia la prioridad de un ticket (por ejemplo al escalarlo), sus plazos se recalculan desde la fecha de creación. Los tickets existentes conservan sus plazos.</p>
            <button disabled={!slaReady}><Icon name="check" size={16} />Guardar plazos</button>
          </form>
        </section>

        <section className="glass panel reveal" style={{ '--d': '120ms' } as React.CSSProperties}>
          <header className="panel-head"><h2><Icon name="mail" size={18} />Correo saliente</h2>
            <span className={`chip ${smtp && service ? 'sla-ok' : 'sla-riesgo'}`}><Icon name={smtp && service ? 'check' : 'hourglass'} size={13} />{smtp && service ? 'Configurado' : 'Pendiente'}</span>
          </header>
          <ul className="check-list">
            <li className={smtp ? 'ok' : ''}><Icon name={smtp ? 'checkCircle' : 'circle'} size={16} />Servidor SMTP {smtp ? `· ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}` : '(SMTP_HOST, SMTP_USER, SMTP_PASS)'}</li>
            <li className={smtp ? 'ok' : ''}><Icon name={smtp ? 'checkCircle' : 'circle'} size={16} />Remitente: {process.env.MAIL_FROM || (smtp ? process.env.SMTP_USER : 'MAIL_FROM')}</li>
            <li className={service ? 'ok' : ''}><Icon name={service ? 'checkCircle' : 'circle'} size={16} />Clave de servicio (destinatarios y bitácora)</li>
          </ul>
          <p className="muted small-print">Avisos: ticket nuevo, asignación, mensajes, cambio de estado, resolución y escalaciones. Las notas internas no se envían. Sin configuración no se manda ningún correo.</p>
          <div className="head-actions">
            <form action={testMail}><button className="small" disabled={!smtp}><Icon name="mail" size={16} />Enviar correo de prueba a mi cuenta</button></form>
            <form action={testNotice}><button className="small ghost-btn" disabled={!service}><Icon name="bell" size={16} />Enviar aviso de prueba</button></form>
          </div>
        </section>

        <section className="glass panel reveal" style={{ '--d': '160ms' } as React.CSSProperties}>
          <header className="panel-head"><h2><Icon name="inbox" size={18} />Recepción</h2></header>
          <form action={saveGeneral} className="form">
            <label>Correo de recepción de solicitudes<input name="email" type="email" required defaultValue={c?.support_email || 'mesadeayuda@udlondres.com'} /></label>
            <p className="muted small-print">Se muestra como contacto institucional. Recibir tickets por correo (Gmail API) sigue pendiente de autorización de Google Workspace.</p>
            <button className="small"><Icon name="check" size={16} />Guardar</button>
          </form>
        </section>

        <section className="glass panel reveal span-2" style={{ '--d': '200ms' } as React.CSSProperties}>
          <header className="panel-head"><h2><Icon name="history" size={18} />Bitácora de correos</h2><span className="muted small-print">Últimos 25 intentos</span></header>
          {logErr ? <Empty icon="alert" title="Bitácora no disponible">Ejecuta la migración 202611060001 para registrar los envíos.</Empty>
            : logs.length === 0 ? <Empty icon="mail" title="Sin envíos todavía">Cada aviso (enviado, fallido u omitido) aparecerá aquí.</Empty> : (
            <ul className="mail-log">
              {logs.map((l) => (
                <li key={l.id}>
                  <span className={`chip ${l.status === 'enviado' ? 'sla-ok' : l.status === 'fallido' ? 'sla-vencido' : 'sla-riesgo'}`}>{l.status}</span>
                  <span className="mail-main"><strong>{EVENT_LABEL[l.event] ?? l.event}</strong><small className="muted">{l.recipient}{l.error ? ` · ${l.error}` : ''}</small></span>
                  <time className="muted small-print">{relativeTime(l.created_at)}</time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
