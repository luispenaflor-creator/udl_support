import Link from 'next/link';
import { access } from '@/lib/auth';
import { relativeTime } from '@/lib/dashboard';
import { Icon, type IconName } from '@/components/Icon';
import { Empty } from '@/components/dashboard';
import { Avatar } from '@/components/people';

type Log = { id: string; actor_id: string | null; action: string; entity_type: string | null; entity_id: string | null; metadata: Record<string, unknown> | null; created_at: string };
type Person = { id: string; full_name: string; avatar_url?: string | null };

const ACTIONS: Record<string, { label: string; icon: IconName; tone: string }> = {
  usuario_creado: { label: 'Alta de usuario', icon: 'userPlus', tone: 'teal' },
  usuario_actualizado: { label: 'Cambio de perfil', icon: 'users', tone: 'violet' },
  contrasena_restablecida: { label: 'Contraseña restablecida', icon: 'key', tone: 'amber' },
  configuracion_actualizada: { label: 'Configuración', icon: 'settings', tone: 'violet' },
  ticket_editado: { label: 'Ticket editado', icon: 'edit', tone: 'teal' },
  tickets_exportados: { label: 'Excel de tickets', icon: 'download', tone: 'amber' },
  plantel_creado: { label: 'Plantel agregado', icon: 'building', tone: 'teal' },
  plantel_actualizado: { label: 'Plantel editado', icon: 'building', tone: 'violet' },
  plantel_eliminado: { label: 'Plantel eliminado', icon: 'building', tone: 'amber' },
  reporte_exportado: { label: 'Excel de reporte', icon: 'download', tone: 'amber' },
  opiniones_exportadas: { label: 'Excel de opiniones', icon: 'download', tone: 'amber' },
};
const LIMIT = 300;

const FIELD: Record<string, string> = { full_name: 'nombre', role: 'perfil', campus: 'plantel', job_title: 'puesto', avatar_url: 'foto', active: 'activa', subject: 'asunto', description: 'descripción', category: 'categoría', priority: 'prioridad' };
const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : v === true ? 'sí' : v === false ? 'no' : String(v));

// Resume los metadatos en texto legible en lugar de mostrar JSON.
function detail(l: Log): string {
  const m = l.metadata ?? {};
  const changes = (m.cambios ?? (l.action === 'ticket_editado' ? m : null)) as Record<string, { de?: unknown; a?: unknown; editada?: boolean }> | null;
  const parts: string[] = [];
  if (typeof m.email === 'string') parts.push(m.email);
  if (changes) parts.push(Object.entries(changes).map(([k, c]) => c.editada ? `${FIELD[k] ?? k} editada` : `${FIELD[k] ?? k}: ${show(c.de)} → ${show(c.a)}`).join(' · '));
  if (l.action === 'usuario_creado' && typeof m.role === 'string') parts.push(`perfil ${m.role}`);
  if (l.action.endsWith('_exportados') || l.action.endsWith('_exportadas') || l.action === 'reporte_exportado') {
    if (typeof m.filas === 'number') parts.push(`${m.filas} filas`);
  }
  if (l.action === 'configuracion_actualizada' && typeof m.support_email === 'string') parts.push(`correo ${m.support_email}`);
  return parts.filter(Boolean).join(' · ');
}

export default async function Audit({ searchParams }: { searchParams: Promise<{ accion?: string }> }) {
  const { accion } = await searchParams;
  const { s } = await access(['administrador']);
  let q = s.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(LIMIT);
  if (accion && ACTIONS[accion]) q = q.eq('action', accion);
  const { data, error } = await q;
  const logs = (data ?? []) as Log[];
  const ids = [...new Set(logs.map((l) => l.actor_id).filter(Boolean))] as string[];
  const { data: peopleRaw } = ids.length ? await s.from('profiles').select('id,full_name,avatar_url').in('id', ids) : { data: [] };
  const people = new Map(((peopleRaw ?? []) as Person[]).map((x) => [x.id, x]));

  return (
    <div className="dash">
      <header className="page-head reveal">
        <div><h1>Auditoría</h1><p className="muted">Acciones administrativas registradas · últimas {LIMIT}</p></div>
      </header>

      <nav className="glass filters reveal" aria-label="Filtrar por acción" style={{ '--d': '60ms' } as React.CSSProperties}>
        <div className="filter-group">
          <span className="filter-label"><Icon name="filter" size={14} />Acción</span>
          <Link href="/admin/auditoria" className={'filter-chip' + (!accion ? ' on' : '')}>Todas</Link>
          {Object.entries(ACTIONS).map(([k, a]) => (
            <Link key={k} href={`/admin/auditoria?accion=${k}`} className={'filter-chip' + (accion === k ? ' on' : '')}>{a.label}</Link>
          ))}
        </div>
      </nav>

      <section className="glass panel reveal" style={{ '--d': '120ms' } as React.CSSProperties}>
        {error ? <Empty icon="alert" title="No se pudo leer la auditoría">{error.message}</Empty>
          : logs.length === 0 ? <Empty icon="shield" title="Sin registros">Las altas de usuarios, cambios de perfil, ediciones y exportaciones aparecerán aquí.</Empty> : (
          <ol className="audit-list">
            {logs.map((l) => {
              const a = ACTIONS[l.action] ?? { label: l.action.replaceAll('_', ' '), icon: 'history' as IconName, tone: 'violet' };
              const who = l.actor_id ? people.get(l.actor_id) : null;
              const href = l.entity_type === 'tickets' && l.entity_id ? `/tickets/${l.entity_id}` : l.entity_type === 'profiles' && l.entity_id ? `/admin/usuarios#u-${l.entity_id}` : null;
              return (
                <li key={l.id} className="audit-row">
                  <span className={`audit-icon tone-${a.tone}`}><Icon name={a.icon} size={17} /></span>
                  <div className="audit-main">
                    <strong>{a.label}</strong>
                    <span className="muted small-print">{detail(l) || l.entity_type || '—'}</span>
                  </div>
                  <span className="audit-who"><Avatar name={who?.full_name} src={who?.avatar_url} size={26} />{who?.full_name ?? 'Sistema'}</span>
                  <time className="muted small-print" dateTime={l.created_at} title={new Date(l.created_at).toLocaleString('es-MX')}>{relativeTime(l.created_at)}</time>
                  {href ? <Link href={href} className="link-more">Ver<Icon name="arrowRight" size={14} /></Link> : <span />}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
