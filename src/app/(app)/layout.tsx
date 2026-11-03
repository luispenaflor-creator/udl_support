import { Suspense } from 'react';
import { access } from '@/lib/auth';
import { ticketsUrl } from '@/lib/dashboard';
import type { Role } from '@/lib/types';
import { Avatar } from '@/components/people';
import { Sidebar, type NavGroup } from '@/components/Sidebar';

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
        { href: '/', label: 'Panel', icon: 'home' },
        { href: '/tickets/nuevo', label: 'Crear ticket', icon: 'plus' },
      ] },
      { title: 'Mis solicitudes', items: [
        { href: '/tickets', label: 'Todas', icon: 'ticket' },
        { href: ticketsUrl({ abiertos: '1' }), label: 'En atención', icon: 'inbox', badge: open },
        { href: ticketsUrl({ estado: 'en_espera' }), label: 'Soporte espera mi respuesta', icon: 'hand', badge: waiting, tone: 'amber' },
        { href: ticketsUrl({ estado: 'resuelto,cerrado' }), label: 'Resueltas', icon: 'star', badge: toRate, tone: 'amber' },
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
        ? [{ href: ticketsUrl({ abiertos: '1', asignado: 'mio' }), label: 'Asignados a mí', icon: 'user' as const, badge: mine }]
        : [{ href: '/escalaciones', label: 'Escalaciones', icon: 'zap' as const, badge: escalated, tone: 'rose' as const }]),
      { href: ticketsUrl({ abiertos: '1', asignado: 'sin' }), label: role === 'agente' ? 'Disponibles para tomar' : 'Sin asignar', icon: 'inbox', badge: unassigned, tone: 'teal' },
      { href: ticketsUrl({ sla: 'riesgo' }), label: 'Por vencer', icon: 'hourglass', badge: atRisk, tone: 'amber' },
      { href: ticketsUrl({ sla: 'vencido' }), label: 'Vencidos', icon: 'alert', badge: overdue, tone: 'rose' },
    ] };
    groups = [
      { title: 'Inicio', items: [
        { href: '/', label: 'Panel', icon: 'home' },
        ...(role !== 'directivo' ? [{ href: '/tickets/nuevo', label: 'Crear ticket', icon: 'plus' as const }] : []),
      ] },
      work,
      { title: 'Consultas', items: [
        { href: '/tickets', label: 'Todos los tickets', icon: 'ticket' },
        { href: ticketsUrl({ abiertos: '1' }), label: 'Abiertos', icon: 'list' },
        { href: '/reportes', label: 'Reportes', icon: 'chart' },
        ...(role !== 'agente' ? [
          { href: '/opiniones', label: 'Opiniones', icon: 'star' as const, badge: low, tone: 'rose' as const },
          { href: '/#ranking', label: 'Ranking de agentes', icon: 'trophy' as const },
        ] : []),
      ] },
    ];
    if (role === 'administrador') {
      groups.push({ title: 'Administración', items: [
        { href: '/admin/usuarios', label: 'Usuarios y perfiles', icon: 'users' },
        { href: '/admin/planteles', label: 'Planteles', icon: 'building' },
        { href: '/admin/auditoria', label: 'Auditoría', icon: 'shield' },
        { href: '/admin', label: 'Configuración', icon: 'settings' },
      ] });
    }
  }

  return (
    <div className="layout">
      <a href="#contenido" className="skip">Saltar al contenido</a>
      <Suspense fallback={<aside className="side glass" />}>
        <Sidebar groups={groups} roleLabel={ROLE_LABEL[role]}
          user={{ name: p.full_name, detail: p.job_title || p.campus || 'Todos los planteles', avatar: <Avatar name={p.full_name} src={p.avatar_url} size={38} /> }} />
      </Suspense>
      <main className="main" id="contenido">{children}</main>
    </div>
  );
}
