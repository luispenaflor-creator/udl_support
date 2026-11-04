import { Suspense } from 'react';
import { access } from '@/lib/auth';
import { ticketsUrl } from '@/lib/dashboard';
import type { Role } from '@/lib/types';
import { Avatar } from '@/components/people';
import { Sidebar, type NavGroup } from '@/components/Sidebar';
import type { Notice } from '@/components/NotificationCenter';

const ROLE_LABEL: Record<Role, string> = { solicitante: 'Solicitante', agente: 'Agente', directivo: 'Directivo', administrador: 'Administrador' };
const OPEN = '(resuelto,cerrado)';
const LOW_SELECT: string = 'ticket_id,tickets!inner(campus)';
const ESC_SELECT: string = 'id,tickets!inner(campus)';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const { s, p, user } = await access();
  const role = p.role as Role;
  const now = new Date().toISOString();
  // Conteos para los indicadores del menú. Son consultas "head" (solo cuentan) y respetan la RLS del perfil.
  const count = async (build: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => (await build(base())).count ?? 0;
  const base = () => {
    let q = s.from('tickets').select('id', { count: 'exact', head: true }).not('status', 'in', OPEN);
    if (role === 'directivo' && p.campus) q = q.eq('campus', p.campus);
    return q;
  };
  // Últimos avisos para la campana (si la tabla aún no existe, la campana arranca vacía).
  const noticesQ = Promise.all([
    s.from('notifications').select('id,title,body,link,read_at,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
    s.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('read_at', null),
  ]);

  const help = { href: '/ayuda', label: 'Ayuda: cómo funciona', icon: 'sparkle' as const, hint: 'Guía rápida para usar el sistema' };
  let groups: NavGroup[];
  if (role === 'solicitante') {
    const [open, waiting, closedMine, rated] = await Promise.all([
      count((q) => q.eq('requester_id', user.id)),
      count((q) => q.eq('requester_id', user.id).eq('status', 'en_espera')),
      s.from('tickets').select('id', { count: 'exact', head: true }).eq('requester_id', user.id).in('status', ['resuelto', 'cerrado']).not('assignee_id', 'is', null),
      s.from('surveys').select('ticket_id', { count: 'exact', head: true }).eq('requester_id', user.id),
    ]);
    const toRate = Math.max(0, (closedMine.count ?? 0) - (rated.count ?? 0));
    groups = [
      { title: 'Inicio', items: [
        { href: '/', label: 'Inicio', icon: 'home', hint: 'Resumen de tus solicitudes' },
        { href: '/tickets/nuevo', label: 'Pedir soporte', icon: 'plus', hint: 'Reporta un problema o solicita ayuda' },
        help,
      ] },
      { title: 'Mis solicitudes', items: [
        { href: '/tickets', label: 'Todas mis solicitudes', icon: 'ticket', hint: 'Historial completo' },
        { href: ticketsUrl({ abiertos: '1' }), label: 'En atención', icon: 'inbox', hint: 'Soporte las está atendiendo', badge: open },
        { href: ticketsUrl({ estado: 'en_espera' }), label: 'Soporte espera mi respuesta', icon: 'hand', hint: 'Te pidieron información para continuar', badge: waiting, tone: 'amber' },
        { href: ticketsUrl({ estado: 'resuelto,cerrado' }), label: 'Resueltas', icon: 'star', hint: toRate ? 'Tienes atenciones por calificar' : 'Solicitudes terminadas', badge: toRate, tone: 'amber' },
      ] },
    ];
  } else {
    // Opiniones de 1–2 ★ en los últimos 30 días (seguimiento para directivo y administración).
    const lowRatings = async () => {
      if (role === 'agente') return 0;
      let q = s.from('surveys').select(LOW_SELECT, { count: 'exact', head: true }).lte('score', 2)
        .gte('submitted_at', new Date(Date.now() - 30 * 86_400_000).toISOString());
      if (role === 'directivo' && p.campus) q = q.eq('tickets.campus', p.campus);
      return (await q).count ?? 0;
    };
    // Escalaciones pendientes para dirección (si la tabla aún no existe, la consulta falla y cuenta 0).
    const pendingEscalations = async () => {
      if (role === 'agente') return 0;
      let q = s.from('ticket_escalations').select(ESC_SELECT, { count: 'exact', head: true }).eq('status', 'pendiente');
      if (role === 'directivo' && p.campus) q = q.eq('tickets.campus', p.campus);
      return (await q).count ?? 0;
    };
    const [mine, unassigned, atRisk, overdue, low, escalated] = await Promise.all([
      role === 'agente' ? count((q) => q.eq('assignee_id', user.id)) : 0,
      count((q) => q.is('assignee_id', null)),
      // "Por vencer" depende del 25 % de la ventana; en el menú se aproxima con las próximas 8 h.
      count((q) => q.gte('resolution_due_at', now).lte('resolution_due_at', new Date(Date.now() + 8 * 3_600_000).toISOString())),
      count((q) => q.lt('resolution_due_at', now)),
      lowRatings(),
      pendingEscalations(),
    ]);
    const work: NavGroup = { title: role === 'agente' ? 'Mi trabajo' : 'Supervisión', items: [
      ...(role === 'agente'
        ? [{ href: ticketsUrl({ abiertos: '1', asignado: 'mio' }), label: 'Mis tickets', icon: 'user' as const, hint: 'Los que tomaste y debes resolver', badge: mine }]
        : [{ href: '/escalaciones', label: 'Escalaciones', icon: 'zap' as const, hint: 'Casos que piden intervención de dirección', badge: escalated, tone: 'rose' as const }]),
      { href: ticketsUrl({ abiertos: '1', asignado: 'sin' }), label: role === 'agente' ? 'Disponibles para tomar' : 'Sin asignar', icon: 'inbox', hint: role === 'agente' ? 'Tickets nuevos que nadie ha tomado' : 'Tickets que aún no tienen agente', badge: unassigned, tone: 'teal' },
      { href: ticketsUrl({ sla: 'riesgo' }), label: 'Por vencer', icon: 'hourglass', hint: 'Se acerca su plazo de atención', badge: atRisk, tone: 'amber' },
      { href: ticketsUrl({ sla: 'vencido' }), label: 'Vencidos', icon: 'alert', hint: 'Pasaron su plazo de atención', badge: overdue, tone: 'rose' },
    ] };
    groups = [
      { title: 'Inicio', items: [
        { href: '/', label: 'Inicio', icon: 'home', hint: 'Indicadores y resumen' },
        ...(role !== 'directivo' ? [{ href: '/tickets/nuevo', label: 'Crear ticket', icon: 'plus' as const, hint: 'Registrar una solicitud' }] : []),
        help,
      ] },
      work,
      { title: 'Consultas', items: [
        { href: '/tickets', label: 'Todos los tickets', icon: 'ticket', hint: 'Buscar y filtrar cualquier ticket' },
        { href: ticketsUrl({ abiertos: '1' }), label: 'Abiertos', icon: 'list', hint: 'Todo lo que sigue en proceso' },
        { href: '/reportes', label: 'Reportes', icon: 'chart', hint: 'Gráficas y descarga en Excel' },
        ...(role !== 'agente' ? [
          { href: '/opiniones', label: 'Opiniones', icon: 'star' as const, hint: 'Calificaciones de los usuarios', badge: low, tone: 'rose' as const },
          { href: '/#ranking', label: 'Ranking de agentes', icon: 'trophy' as const, hint: 'Desempeño del equipo' },
        ] : []),
      ] },
    ];
    if (role === 'administrador') {
      groups.push({ title: 'Administración', items: [
        { href: '/admin/usuarios', label: 'Usuarios y perfiles', icon: 'users', hint: 'Altas, perfiles y contraseñas' },
        { href: '/admin/planteles', label: 'Planteles', icon: 'building', hint: 'Catálogo de planteles' },
        { href: '/admin/auditoria', label: 'Auditoría', icon: 'shield', hint: 'Quién cambió qué y cuándo' },
        { href: '/admin', label: 'Configuración', icon: 'settings', hint: 'Plazos, correo y avisos' },
      ] });
    }
  }
  const [{ data: noticeRows }, { count: unread }] = await noticesQ;

  return (
    <div className="layout">
      <a href="#contenido" className="skip">Saltar al contenido</a>
      <Suspense fallback={<aside className="side glass" />}>
        <Sidebar groups={groups} roleLabel={ROLE_LABEL[role]} notices={{ items: (noticeRows ?? []) as Notice[], unread: unread ?? 0 }}
          user={{ id: user.id, name: p.full_name, detail: p.job_title || p.campus || 'Todos los planteles', avatar: <Avatar name={p.full_name} src={p.avatar_url} size={38} /> }} />
      </Suspense>
      <main className="main" id="contenido">{children}</main>
    </div>
  );
}
