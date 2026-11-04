import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { notifyTicket } from '@/lib/notify';
import { fetchAll } from '@/lib/fetchAll';
import { access } from '@/lib/auth';
import type { Role } from '@/lib/types';
import { allCampusNames, campusNames } from '@/lib/campuses';
import {
  CATEGORIES, PERIODS, PRIORITY_LABEL, PRIORITY_ORDER, STATUS_LABEL, STATUS_ORDER,
  agentRanking, countBy, formatDuration, isClosed, nextStep, periodStart, relativeTime, summarize, ticketsUrl, urgencyQueue,
  type Agent, type SurveyRow, type TicketFilter, type TicketRow,
} from '@/lib/dashboard';
import { Icon } from '@/components/Icon';
import {
  Bars, Donut, Empty, FilterChips, Panel, PRIORITY_COLOR, PriorityChip, STATUS_COLOR, SlaBar, StatCard, StatusChip,
} from '@/components/dashboard';
import { Ranking } from '@/components/people';

const COLS = 'id,folio,subject,status,priority,campus,category,created_at,updated_at,resolution_due_at,resolved_at,assignee_id,requester_id';
const ROW_LIMIT = 20000;

const ROLE_LABEL: Record<Role, string> = {
  solicitante: 'Solicitante', agente: 'Agente de soporte', directivo: 'Directivo', administrador: 'Administrador',
};

type Search = { periodo?: string; campus?: string; categoria?: string };
type Db = Awaited<ReturnType<typeof access>>['s'];

async function takeTicket(form: FormData) {
  'use server';
  // Solo agentes toman tickets; directivo y administración asignan desde el detalle del ticket.
  const { s, user } = await access(['agente']);
  const id = String(form.get('id'));
  const { data: t } = await s.from('tickets').select('status,assignee_id').eq('id', id).single();
  if (!t || t.assignee_id || t.status === 'resuelto' || t.status === 'cerrado') return;
  const status = 'en_progreso';
  const { error } = await s.from('tickets').update({ assignee_id: user.id, status, updated_at: new Date().toISOString() }).eq('id', id).is('assignee_id', null);
  if (error) throw error;
  await s.from('ticket_events').insert({ ticket_id: id, actor_id: user.id, event_type: 'asignacion', payload: { asignacion: { de: null, a: user.id }, estado: t.status !== status ? { de: t.status, a: status } : undefined, origen: 'panel' } });
  after(() => notifyTicket('ticket_asignado', id, { actorId: user.id }));
  revalidatePath('/', 'layout');
}

export default async function Home({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { s, p, user } = await access();
  const role = p.role as Role;

  // Ámbito: el directivo con plantel asignado solo ve ese plantel (la RLS aún no lo restringe; ver docs).
  const lockedCampus = role === 'directivo' && p.campus ? (p.campus as string) : null;
  const CAMPUS = await campusNames(s);
  const campus = lockedCampus ?? (sp.campus && (await allCampusNames(s)).includes(sp.campus) ? sp.campus : 'todos');
  const category = sp.categoria && (CATEGORIES as readonly string[]).includes(sp.categoria) ? sp.categoria : 'todos';
  const usesPeriod = role === 'directivo' || role === 'administrador';
  const period = periodStart(sp.periodo);

  const build = () => {
    let q = s.from('tickets').select(COLS).order('created_at', { ascending: false }).order('id');
    if (role === 'solicitante') q = q.eq('requester_id', user.id);
    if (role !== 'solicitante' && campus !== 'todos') q = q.eq('campus', campus);
    if (role === 'agente' && category !== 'todos') q = q.eq('category', category);
    if (usesPeriod && period.since) q = q.gte('created_at', period.since);
    return q;
  };
  const { data: rows, error, truncated } = await fetchAll<TicketRow>((a, b) => build().range(a, b), ROW_LIMIT);

  const firstName = String(p.full_name ?? '').split(' ')[0] || 'Hola';
  const today = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  const params: Search = { periodo: usesPeriod ? period.key : undefined, campus: lockedCampus ? undefined : campus, categoria: category };
  // Lo que se ve en el panel se abre en la lista de tickets con los mismos filtros.
  const base: TicketFilter = {
    campus: campus !== 'todos' ? campus : undefined,
    periodo: usesPeriod && period.key !== 'todo' ? period.key : undefined,
    categoria: role === 'agente' && category !== 'todos' ? category : undefined,
  };

  return (
    <div className="dash">
      <header className="hero glass reveal">
        <div className="hero-text">
          <span className="eyebrow"><Icon name="sparkle" size={14} /><span className="eyebrow-text">{today}</span></span>
          <h1>Hola, <span className="grad">{firstName}</span></h1>
          <p className="muted">
            <span className="role-pill"><Icon name="user" size={14} />{ROLE_LABEL[role]}</span>
            <span className="scope"><Icon name="building" size={14} />
              {role === 'solicitante' ? 'Tus solicitudes' : campus === 'todos' ? 'Todos los planteles' : `Plantel ${campus}`}
              {lockedCampus && ' (según tu perfil)'}
              {usesPeriod && ` · ${period.label}`}
            </span>
          </p>
        </div>
        <div className="hero-actions">
          <Link className="button cta" href="/tickets/nuevo"><Icon name="plus" />{role === 'solicitante' ? 'Pedir soporte' : 'Crear ticket'}</Link>
          <Link className="link-more" href="/ayuda"><Icon name="sparkle" size={14} />¿Primera vez? Mira cómo funciona</Link>
        </div>
        <div className="hero-orb" aria-hidden="true" />
      </header>

      {role !== 'solicitante' && (
        <nav className="filters glass reveal" aria-label="Filtros del panel" style={{ '--d': '60ms' } as React.CSSProperties}>
          {usesPeriod && <FilterChips label="Periodo" param="periodo" current={period.key} params={params}
            options={PERIODS.map((x) => ({ key: x.key, label: x.label }))} />}
          {!lockedCampus && <FilterChips label="Plantel" param="campus" current={campus} params={params}
            options={[{ key: 'todos', label: 'Todos' }, ...CAMPUS.map((c) => ({ key: c, label: c }))]} />}
          {role === 'agente' && <FilterChips label="Categoría" param="categoria" current={category} params={params}
            options={[{ key: 'todos', label: 'Todas' }, ...CATEGORIES.map((c) => ({ key: c, label: c }))]} />}
        </nav>
      )}

      {error ? (
        <section className="glass panel reveal">
          <Empty icon="alert" title="No pudimos cargar tus indicadores">
            Revisa tu conexión e intenta de nuevo en unos momentos. Si el problema continúa, avisa a la mesa de ayuda.
          </Empty>
        </section>
      ) : (
        <>
          {truncated && (
            <p className="note" role="status"><Icon name="alert" size={14} />Se muestran los {ROW_LIMIT.toLocaleString('es-MX')} tickets más recientes. Usa los filtros para acotar.</p>
          )}
          {role === 'solicitante' && <RequesterView rows={rows} s={s} userId={user.id} />}
          {role === 'agente' && <AgentView rows={rows} userId={user.id} base={base} />}
          {role === 'directivo' && <DirectorView rows={rows} showCampus={campus === 'todos'} base={base} s={s} />}
          {role === 'administrador' && <AdminView rows={rows} s={s} base={base} />}
        </>
      )}
    </div>
  );
}

/* ---------- Solicitante ---------- */

async function RequesterView({ rows, s, userId }: { rows: TicketRow[]; s: Db; userId: string }) {
  const open = rows.filter((t) => !isClosed(t));
  const waiting = rows.filter((t) => t.status === 'en_espera');
  const resolved = rows.filter(isClosed);
  const last = rows.reduce<string | null>((acc, t) => {
    const u = t.updated_at ?? t.created_at;
    return !acc || u > acc ? u : acc;
  }, null);
  const { data: rated } = await s.from('surveys').select('ticket_id').eq('requester_id', userId);
  const ratedIds = new Set((rated ?? []).map((r: { ticket_id: string }) => r.ticket_id));
  const toRate = resolved.filter((t) => t.assignee_id && !ratedIds.has(t.id)).slice(0, 3);

  return (
    <>
      <section className="stats">
        <StatCard label="Abiertos" value={open.length} icon="ticket" tone="blue" hint="En atención por soporte" href={ticketsUrl({ abiertos: '1' })} delay={80} />
        <StatCard label="Soporte espera tu respuesta" value={waiting.length} icon="hand" tone="amber"
          hint={waiting.length ? 'Te pidieron información para continuar' : 'No te han pedido nada'} href={ticketsUrl({ estado: 'en_espera' })} delay={140} />
        <StatCard label="Resueltos" value={resolved.length} icon="checkCircle" tone="green" hint="Resueltos o cerrados" href={ticketsUrl({ estado: 'resuelto,cerrado' })} delay={200} />
        <StatCard label="Última actividad" value={null} text={last ? relativeTime(last) : undefined} icon="clock" tone="violet"
          hint={last ? 'En cualquiera de tus tickets' : 'Sin actividad todavía'} href="/tickets" delay={260} />
      </section>

      {toRate.length > 0 && (
        <Panel title="Califica la atención recibida" icon="star" className="rate-callout" delay={300}>
          <ul className="rate-list">
            {toRate.map((t) => (
              <li key={t.id}><Link href={`/tickets/${t.id}`} className="glass-soft interactive rate-item">
                <span><span className="folio">{t.folio}</span><strong>{t.subject}</strong></span>
                <span className="rate-cta"><Icon name="star" size={16} />Calificar</span>
              </Link></li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Tus solicitudes recientes" icon="list" delay={320}
        action={<Link href="/tickets" className="link-more">Ver todas<Icon name="arrowRight" size={16} /></Link>}>
        {rows.length === 0 ? (
          <Empty icon="ticket" title="Aún no tienes solicitudes">
            Cuando necesites ayuda con equipo, red, correo o accesos, crea un ticket y aquí verás su avance.
            <br /><Link className="button cta small" href="/tickets/nuevo"><Icon name="plus" size={16} />Crear mi primer ticket</Link>
          </Empty>
        ) : (
          <ul className="ticket-list">
            {rows.slice(0, 8).map((t, i) => {
              const step = nextStep(t.status);
              return (
                <li key={t.id} className="reveal" style={{ '--d': `${360 + i * 50}ms` } as React.CSSProperties}>
                  <Link href={`/tickets/${t.id}`} className="ticket-row glass-soft interactive">
                    <div className="tr-main">
                      <span className="folio">{t.folio}</span>
                      <strong>{t.subject}</strong>
                      <span className={`next-step who-${step.who}`}>
                        <Icon name={step.who === 'tu' ? 'hand' : step.who === 'soporte' ? 'users' : 'lock'} size={14} />{step.text}
                      </span>
                    </div>
                    <div className="tr-meta">
                      <StatusChip status={t.status} audience="solicitante" />
                      <PriorityChip priority={t.priority} />
                      <small className="muted">Actualizado {relativeTime(t.updated_at ?? t.created_at)}</small>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}

/* ---------- Agente ---------- */

function AgentView({ rows, userId, base }: { rows: TicketRow[]; userId: string; base: TicketFilter }) {
  const sum = summarize(rows);
  const mine = rows.filter((t) => !isClosed(t) && t.assignee_id === userId);
  const queue = urgencyQueue(rows).slice(0, 8);
  const openRows = rows.filter((t) => !isClosed(t));

  return (
    <>
      <section className="stats">
        <StatCard label="Sin asignar" value={sum.unassigned} icon="inbox" tone="cyan" hint="Disponibles para tomar" href={ticketsUrl({ ...base, abiertos: '1', asignado: 'sin' })} delay={80} />
        <StatCard label="Asignados a mí" value={mine.length} icon="user" tone="blue" hint="Abiertos a tu cargo" href={ticketsUrl({ ...base, abiertos: '1', asignado: 'mio' })} delay={140} />
        <StatCard label="Por vencer SLA" value={sum.atRisk} icon="hourglass" tone="amber" hint="Último 25 % del tiempo" href={ticketsUrl({ ...base, sla: 'riesgo' })} delay={200} />
        <StatCard label="Vencidos" value={sum.overdue} icon="alert" tone="rose" hint={sum.overdue ? 'Requieren atención inmediata' : 'Ninguno vencido'} href={ticketsUrl({ ...base, sla: 'vencido' })} delay={260} />
      </section>

      <div className="grid-main">
        <Panel title="Cola priorizada" icon="flame" className="span-2" delay={320}
          action={<Link href={ticketsUrl({ ...base, abiertos: '1' })} className="link-more">Todos los abiertos<Icon name="arrowRight" size={16} /></Link>}>
          {queue.length === 0 ? (
            <Empty icon="checkCircle" title="Cola despejada">
              No hay tickets abiertos con los filtros actuales. Prueba con otro plantel o categoría.
            </Empty>
          ) : (
            <ul className="ticket-list">
              {queue.map((t, i) => (
                <li key={t.id} className="queue-row glass-soft reveal" style={{ '--d': `${360 + i * 50}ms` } as React.CSSProperties}>
                  <div className="tr-main">
                    <span className="folio">{t.folio} · {t.campus} · {t.category}</span>
                    <Link href={`/tickets/${t.id}`} className="tr-title">{t.subject}</Link>
                    <div className="tr-meta start"><StatusChip status={t.status} /><PriorityChip priority={t.priority} /></div>
                  </div>
                  <SlaBar ticket={t} />
                  <div className="tr-actions">
                    {t.assignee_id ? (
                      <Link href={`/tickets/${t.id}`} className="button ghost small">
                        {t.assignee_id === userId ? 'Continuar' : 'Ver'}<Icon name="arrowRight" size={16} />
                      </Link>
                    ) : (
                      <form action={takeTicket}>
                        <input type="hidden" name="id" value={t.id} />
                        <button className="small"><Icon name="hand" size={16} />Tomar</button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Por estado" icon="chart" delay={380}>
          {rows.length ? <StatusDonut rows={rows} base={base} /> : <Empty title="Sin datos para graficar" />}
        </Panel>

        <Panel title="Abiertos por prioridad" icon="flame" delay={440}>
          {openRows.length ? (
            <Bars data={countBy(openRows, (t) => t.priority, PRIORITY_ORDER)
              .map((d) => ({ label: PRIORITY_LABEL[d.key], value: d.value, color: PRIORITY_COLOR[d.key], href: ticketsUrl({ ...base, abiertos: '1', prioridad: d.key }) }))} />
          ) : <Empty title="Sin tickets abiertos" />}
        </Panel>
      </div>
    </>
  );
}

/* ---------- Directivo ---------- */

async function DirectorView({ rows, showCampus, base, s }: { rows: TicketRow[]; showCampus: boolean; base: TicketFilter; s: Db }) {
  const sum = summarize(rows);
  const ranking = await loadRanking(s, rows);
  return (
    <>
      <section className="stats five">
        <StatCard label="Volumen del periodo" value={sum.total} icon="ticket" tone="blue" hint="Tickets creados" href={ticketsUrl(base)} delay={80} />
        <StatCard label="Abiertos" value={sum.open} icon="inbox" tone="cyan" hint="Pendientes de resolver" href={ticketsUrl({ ...base, abiertos: '1' })} delay={130} />
        <StatCard label="Vencidos" value={sum.overdue} icon="alert" tone="rose" hint="Abiertos fuera de SLA" href={ticketsUrl({ ...base, sla: 'vencido' })} delay={180} />
        <StatCard label="Cumplimiento SLA" value={sum.slaPct} suffix="%" icon="shield" tone="green"
          hint={sum.slaPct === null ? 'Sin tickets resueltos aún' : `De ${sum.closed} resueltos`} href={ticketsUrl({ ...base, estado: 'resuelto,cerrado' })} delay={230} />
        <StatCard label="Tiempo promedio" value={null} text={sum.avgResolutionMs === null ? undefined : formatDuration(sum.avgResolutionMs)} icon="timer" tone="violet"
          hint={sum.avgResolutionMs === null ? 'Sin resoluciones en el periodo' : 'Desde la creación hasta resolver'} href={ticketsUrl({ ...base, estado: 'resuelto,cerrado' })} delay={280} />
      </section>
      {sum.total === 0 ? (
        <section className="glass panel reveal">
          <Empty icon="chart" title="Sin tickets en este periodo">Amplía el periodo o cambia de plantel para ver tendencias.</Empty>
        </section>
      ) : (
        <>
          <RankingPanel ranking={ranking} base={base} />
          <Breakdowns rows={rows} showCampus={showCampus} base={base} campuses={await campusNames(s)} />
        </>
      )}
    </>
  );
}

async function loadRanking(s: Db, rows: TicketRow[]) {
  const [{ data: agents }, { data: surveys }] = await Promise.all([
    s.from('profiles').select('*').eq('role', 'agente').order('full_name'),
    fetchAll<SurveyRow>((a, b) => s.from('surveys').select('ticket_id,score').not('score', 'is', null).order('ticket_id').range(a, b)),
  ]);
  return agentRanking(rows, surveys, (agents ?? []) as Agent[]);
}

function RankingPanel({ ranking, base }: { ranking: ReturnType<typeof agentRanking>; base: TicketFilter }) {
  return (
    <Panel id="ranking" title="Ranking de agentes" icon="trophy" className="ranking" delay={320}>
      {ranking.length ? <Ranking stats={ranking} base={base} /> : (
        <Empty icon="users" title="Aún no hay agentes registrados">Cuando existan perfiles con rol agente, aquí verás su desempeño y evaluaciones.</Empty>
      )}
    </Panel>
  );
}

function StatusDonut({ rows, base }: { rows: TicketRow[]; base: TicketFilter }) {
  return (
    <Donut centerLabel="tickets" data={countBy(rows, (t) => t.status, STATUS_ORDER)
      .map((d) => ({ label: STATUS_LABEL[d.key], value: d.value, color: STATUS_COLOR[d.key], href: ticketsUrl({ ...base, estado: d.key }) }))} />
  );
}

function Breakdowns({ rows, showCampus, base, campuses }: { rows: TicketRow[]; showCampus: boolean; base: TicketFilter; campuses: string[] }) {
  return (
    <div className="grid-charts">
      <Panel title="Por estado" icon="chart" delay={340}>
        <StatusDonut rows={rows} base={base} />
      </Panel>
      <Panel title="Por prioridad" icon="flame" delay={400}>
        <Bars data={countBy(rows, (t) => t.priority, PRIORITY_ORDER)
          .map((d) => ({ label: PRIORITY_LABEL[d.key], value: d.value, color: PRIORITY_COLOR[d.key], href: ticketsUrl({ ...base, prioridad: d.key }) }))} />
      </Panel>
      <Panel title="Por categoría" icon="list" delay={460}>
        <Bars data={countBy(rows, (t) => t.category, CATEGORIES as readonly string[])
          .map((d) => ({ label: d.key, value: d.value, href: ticketsUrl({ ...base, categoria: d.key }) }))} />
      </Panel>
      {showCampus && (
        <Panel title="Por plantel" icon="building" delay={520}>
          <Bars data={countBy(rows, (t) => t.campus, campuses)
            .map((d) => ({ label: d.key, value: d.value, href: ticketsUrl({ ...base, campus: d.key }) }))} />
        </Panel>
      )}
    </div>
  );
}

/* ---------- Administrador ---------- */

type Health = 'pendiente' | 'configurado';

async function AdminView({ rows, s, base }: { rows: TicketRow[]; s: Db; base: TicketFilter }) {
  const sum = summarize(rows);
  const CAMPUS = await campusNames(s);
  const [{ data: settings }, { data: audit }, { data: gmail }, ranking] = await Promise.all([
    s.from('app_settings').select('support_email,first_response_hours,resolution_hours').eq('id', 1).single(),
    s.from('audit_logs').select('id,action,entity_type,created_at').order('created_at', { ascending: false }).limit(5),
    s.from('google_mail_config').select('refresh_token').eq('id', 1).maybeSingle(),
    loadRanking(s, rows),
  ]);
  const coveredCampus = new Set(ranking.map((a) => a.campus).filter(Boolean));
  const has = (...keys: string[]) => keys.every((k) => Boolean(process.env[k]?.trim()));

  // Solo se reporta si hay configuración presente; ninguna integración se marca como probada desde aquí.
  const integrations: { name: string; icon: 'mail' | 'cloud' | 'bell' | 'shield'; state: Health; detail: string }[] = [
    { name: 'Gmail API (OAuth)', icon: 'mail', state: has('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET') && gmail?.refresh_token ? 'configurado' : 'pendiente',
      detail: has('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET') ? (gmail?.refresh_token ? 'Buzón autorizado, sin prueba de recepción' : 'Credenciales presentes, falta autorizar el buzón') : 'Faltan credenciales de Google Workspace' },
    { name: 'Google Pub/Sub', icon: 'cloud', state: has('GOOGLE_PUBSUB_TOPIC') ? 'configurado' : 'pendiente',
      detail: has('GOOGLE_PUBSUB_TOPIC') ? 'Tópico definido, sin prueba de entrega' : 'Falta tópico y suscripción' },
    { name: 'Correo SMTP', icon: 'shield', state: 'pendiente', detail: 'Se configura en Supabase Auth con credenciales institucionales' },
    { name: 'Notificaciones push', icon: 'bell', state: has('VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY') ? 'configurado' : 'pendiente',
      detail: has('VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY') ? 'Claves VAPID presentes, envío sin probar' : 'Faltan claves VAPID' },
  ];

  const shortcuts: { label: string; href?: string; icon: 'users' | 'list' | 'timer' | 'mail' | 'shield' | 'chart'; note?: string }[] = [
    { label: 'Usuarios y perfiles', icon: 'users', note: 'Próximamente' },
    { label: 'Catálogos', icon: 'list', note: 'Próximamente' },
    { label: 'Reglas SLA', href: '/admin', icon: 'timer' },
    { label: 'Correo de soporte', href: '/admin', icon: 'mail' },
    { label: 'Auditoría', icon: 'shield', note: 'Próximamente' },
    { label: 'Reportes', href: '/reportes', icon: 'chart' },
  ];

  return (
    <>
      <section className="stats five">
        <StatCard label="Solicitudes activas" value={sum.open} icon="ticket" tone="blue" hint={`${sum.total} creadas en el periodo`} href={ticketsUrl({ ...base, abiertos: '1' })} delay={80} />
        <StatCard label="Vencidas" value={sum.overdue} icon="alert" tone="rose" hint={`${sum.atRisk} por vencer`} href={ticketsUrl({ ...base, sla: 'vencido' })} delay={130} />
        <StatCard label="Sin asignar" value={sum.unassigned} icon="inbox" tone="cyan" hint="Esperan un agente" href={ticketsUrl({ ...base, abiertos: '1', asignado: 'sin' })} delay={180} />
        <StatCard label="Cumplimiento SLA" value={sum.slaPct} suffix="%" icon="shield" tone="green"
          hint={sum.slaPct === null ? 'Sin tickets resueltos aún' : `De ${sum.closed} resueltos`} href={ticketsUrl({ ...base, estado: 'resuelto,cerrado' })} delay={230} />
        <StatCard label="Cobertura por plantel" value={coveredCampus.size} suffix={`/${CAMPUS.length}`} icon="building" tone="violet"
          hint="Planteles con agente asignado" href="#ranking" delay={280} />
      </section>

      {sum.total > 0 && <RankingPanel ranking={ranking} base={base} />}

      <div className="grid-main">
        <Panel title="Salud de integraciones" icon="cloud" className="span-2" delay={360}>
          <ul className="integrations">
            {integrations.map((x) => (
              <li key={x.name} className={`glass-soft int-${x.state}`}>
                <span className="int-icon"><Icon name={x.icon} size={20} /></span>
                <div><strong>{x.name}</strong><small>{x.detail}</small></div>
                <span className={`chip ${x.state === 'configurado' ? 'sla-ok' : 'sla-riesgo'}`}>
                  <Icon name={x.state === 'configurado' ? 'check' : 'hourglass'} size={14} />
                  {x.state === 'configurado' ? 'Configurado' : 'Pendiente'}
                </span>
              </li>
            ))}
          </ul>
          <p className="muted small-print">
            Correo de recepción: <b>{settings?.support_email ?? 'mesadeayuda@udlondres.com'}</b> · SLA: {settings?.first_response_hours ?? 8} h primera respuesta,
            {' '}{settings?.resolution_hours ?? 48} h resolución (horas corridas).
          </p>
        </Panel>

        <Panel title="Atajos" icon="settings" delay={420}>
          <ul className="shortcuts">
            {shortcuts.map((x) => (
              <li key={x.label}>
                {x.href ? (
                  <Link href={x.href} className="shortcut glass-soft interactive"><Icon name={x.icon} size={22} /><span>{x.label}</span></Link>
                ) : (
                  <span className="shortcut glass-soft disabled" aria-disabled="true"><Icon name={x.icon} size={22} /><span>{x.label}</span><small>{x.note}</small></span>
                )}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Actividad administrativa" icon="shield" delay={480}>
          {audit?.length ? (
            <ul className="timeline">
              {audit.map((a: { id: string; action: string; entity_type: string | null; created_at: string }) => (
                <li key={a.id}><span className="dot" /><div><strong>{a.action.replaceAll('_', ' ')}</strong><small>{a.entity_type ?? '—'} · {relativeTime(a.created_at)}</small></div></li>
              ))}
            </ul>
          ) : <Empty icon="shield" title="Sin acciones registradas">Los cambios de configuración aparecerán aquí.</Empty>}
        </Panel>
      </div>

      {sum.total > 0 ? <Breakdowns rows={rows} showCampus base={base} campuses={CAMPUS} /> : (
        <section className="glass panel reveal" style={{ '--d': '500ms' } as React.CSSProperties}>
          <Empty icon="chart" title="Sin tickets en este periodo">
            Las gráficas por estado, prioridad, categoría y plantel aparecerán cuando se registren solicitudes. Amplía el periodo o crea un ticket de prueba.
          </Empty>
        </section>
      )}
    </>
  );
}
