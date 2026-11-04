import Link from 'next/link';
import { access } from '@/lib/auth';
import type { Role } from '@/lib/types';
import { campusNames } from '@/lib/campuses';
import { relativeTime } from '@/lib/dashboard';
import { hasServiceRole } from '@/lib/supabase/admin';
import { Icon } from '@/components/Icon';
import { Empty } from '@/components/dashboard';
import { Avatar } from '@/components/people';
import { changeEmail, createUser, deleteUser, resetPassword, updateUser } from './actions';

type Profile = {
  id: string; email: string; full_name: string; role: Role; campus: string | null;
  job_title?: string | null; avatar_url?: string | null; active?: boolean; created_at?: string; notify_email?: boolean;
};

const ROLES: { key: Role; label: string; icon: 'user' | 'hand' | 'chart' | 'shield'; desc: string }[] = [
  { key: 'solicitante', label: 'Solicitante', icon: 'user', desc: 'Crea y da seguimiento a sus solicitudes' },
  { key: 'agente', label: 'Agente', icon: 'hand', desc: 'Atiende, asigna y resuelve tickets' },
  { key: 'directivo', label: 'Directivo', icon: 'chart', desc: 'Supervisa indicadores de su plantel' },
  { key: 'administrador', label: 'Administrador', icon: 'shield', desc: 'Configura el sistema y los usuarios' },
];
const AVATARS = ['/avatars/valeria-montes.svg', '/avatars/diego-salinas.svg', '/avatars/mariana-ibarra.svg'];

type Search = { q?: string; rol?: string; estado?: string; ok?: string; error?: string };

export default async function Users({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { s, user } = await access(['administrador']);
  const { data, error } = await s.from('profiles').select('*').order('full_name');
  const all = (data ?? []) as Profile[];
  const campuses = await campusNames(s);
  const rol = ROLES.some((r) => r.key === sp.rol) ? sp.rol : undefined;
  const estado = sp.estado === 'inactivos' ? 'inactivos' : undefined;
  const q = (sp.q ?? '').trim().toLowerCase();
  const users = all.filter((u) =>
    (!rol || u.role === rol) && (!estado || u.active === false)
    && (!q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.job_title ?? '').toLowerCase().includes(q)));
  const url = (patch: Search) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, rol, estado, ...patch })) if (v) p.set(k, v);
    const str = p.toString();
    return str ? `/admin/usuarios?${str}` : '/admin/usuarios';
  };
  const service = hasServiceRole();
  const inactive = all.filter((u) => u.active === false).length;

  return (
    <div className="dash">
      <header className="page-head reveal">
        <div>
          <h1>Usuarios y perfiles</h1>
          <p className="muted">{all.length} cuentas · {inactive} desactivadas</p>
        </div>
        <a className="button" href="#nuevo"><Icon name="userPlus" />Dar de alta</a>
      </header>

      {sp.ok && <p className="flash ok reveal" role="status"><Icon name="checkCircle" size={18} />{sp.ok}</p>}
      {sp.error && <p className="flash err reveal" role="alert"><Icon name="alert" size={18} />{sp.error}</p>}

      <section className="role-cards reveal" style={{ '--d': '60ms' } as React.CSSProperties}>
        {ROLES.map((r) => {
          const n = all.filter((u) => u.role === r.key).length;
          const on = rol === r.key;
          return (
            <Link key={r.key} href={url({ rol: on ? undefined : r.key })} className={`glass role-card interactive role-${r.key}${on ? ' on' : ''}`} aria-pressed={on}>
              <span className="role-icon"><Icon name={r.icon} size={20} /></span>
              <strong>{n}</strong>
              <span>{r.label}{n === 1 ? '' : r.key === 'directivo' || r.key === 'administrador' ? 'es' : 's'}</span>
              <small>{r.desc}</small>
            </Link>
          );
        })}
      </section>

      <form className="glass filter-form reveal" action="/admin/usuarios" style={{ '--d': '100ms' } as React.CSSProperties}>
        <label className="search"><Icon name="search" size={18} /><span className="sr-only">Buscar usuario</span>
          <input name="q" placeholder="Buscar por nombre, correo o puesto…" defaultValue={sp.q} /></label>
        {rol && <input type="hidden" name="rol" value={rol} />}
        <label className="check-inline"><input type="checkbox" name="estado" value="inactivos" defaultChecked={!!estado} />Solo desactivados</label>
        <button className="small"><Icon name="filter" size={16} />Filtrar</button>
        {(q || rol || estado) && <Link href="/admin/usuarios" className="link-more">Limpiar</Link>}
      </form>

      <div className="users-grid">
        <section className="glass panel reveal" style={{ '--d': '140ms' } as React.CSSProperties}>
          <header className="panel-head"><h2><Icon name="users" size={18} />Cuentas</h2><span className="muted small-print">{users.length} de {all.length}</span></header>
          {error ? <Empty icon="alert" title="No se pudieron cargar los usuarios">{error.message}</Empty>
            : users.length === 0 ? <Empty icon="search" title="Sin coincidencias">Cambia la búsqueda o el filtro de rol.</Empty> : (
            <ul className="user-list">
              {users.map((u) => (
                <li key={u.id} id={`u-${u.id}`} className={`user-row glass-soft${u.active === false ? ' inactive' : ''}`}>
                  <details>
                    <summary>
                      <Avatar name={u.full_name} src={u.avatar_url} size={42} />
                      <span className="user-main">
                        <strong>{u.full_name}{u.id === user.id && <em className="you">Tú</em>}</strong>
                        <small>{u.email}</small>
                      </span>
                      <span className="user-meta">
                        <span className={`chip role-chip role-${u.role}`}>{ROLES.find((r) => r.key === u.role)?.label}</span>
                        <span className="muted small-print">{u.job_title ?? '—'}</span>
                        <span className="muted small-print"><Icon name="building" size={13} />{u.campus ?? 'Todos'}</span>
                        {u.active === false
                          ? <span className="chip sla-vencido"><Icon name="lock" size={12} />Desactivada</span>
                          : <span className="chip sla-ok"><Icon name="check" size={12} />Activa</span>}
                      </span>
                      <span className="edit-hint"><Icon name="edit" size={16} />Editar</span>
                    </summary>

                    <form action={updateUser} className="form user-form">
                      <input type="hidden" name="id" value={u.id} />
                      <ProfileFields u={u} self={u.id === user.id} campuses={campuses} />
                      <label className="check"><input type="checkbox" name="active" defaultChecked={u.active !== false} disabled={u.id === user.id} />Cuenta activa (puede iniciar sesión)</label>
                      {u.id === user.id && <input type="hidden" name="active" value="on" />}
                      {'notify_email' in u && <label className="check"><input type="checkbox" name="notify_email" defaultChecked={u.notify_email !== false} />Recibir avisos por correo</label>}
                      <div className="form-actions">
                        <button className="small"><Icon name="check" size={16} />Guardar perfil</button>
                        <small className="muted">Alta {u.created_at ? relativeTime(u.created_at) : '—'}</small>
                      </div>
                    </form>
                    <form action={resetPassword} className="form user-form reset">
                      <input type="hidden" name="id" value={u.id} />
                      {service ? (
                        <label>Nueva contraseña temporal<input type="password" name="password" minLength={8} autoComplete="new-password" placeholder="Mínimo 8 caracteres" /></label>
                      ) : <p className="muted small-print">Se enviará un correo de recuperación a {u.email}.</p>}
                      <button className="small ghost-btn"><Icon name="key" size={16} />{service ? 'Asignar contraseña' : 'Enviar recuperación'}</button>
                    </form>
                    {service && (
                      <form action={changeEmail} className="form user-form reset">
                        <input type="hidden" name="id" value={u.id} />
                        <label>Correo de acceso<input type="email" name="email" required defaultValue={u.email} autoComplete="off" /></label>
                        <button className="small ghost-btn"><Icon name="mail" size={16} />Cambiar correo</button>
                      </form>
                    )}
                    {service && u.id !== user.id && (
                      <form action={deleteUser} className="form user-form reset danger-zone">
                        <input type="hidden" name="id" value={u.id} />
                        <label>Eliminar cuenta · escribe <b>{u.email}</b> para confirmar
                          <input name="confirm" required autoComplete="off" placeholder={u.email} />
                        </label>
                        <button className="small danger"><Icon name="x" size={16} />Eliminar definitivamente</button>
                        <p className="muted small-print">Solo se pueden eliminar cuentas sin historial. Si la persona ya tiene tickets o mensajes, desactívala arriba.</p>
                      </form>
                    )}
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="nuevo" className="glass panel new-user reveal" style={{ '--d': '180ms' } as React.CSSProperties}>
          <header className="panel-head"><h2><Icon name="userPlus" size={18} />Dar de alta usuario</h2></header>
          {!service && (
            <p className="note-box"><Icon name="alert" size={16} />
              <span>Modo limitado: falta <code>SUPABASE_SERVICE_ROLE_KEY</code> en el servidor. La cuenta se crea por registro público y, si tu proyecto exige confirmación, la persona deberá confirmar su correo.</span>
            </p>
          )}
          <form action={createUser} className="form">
            <ProfileFields campuses={campuses} />
            <label>Correo institucional<input name="email" type="email" required autoComplete="off" placeholder="nombre@udlondres.com" /></label>
            <label>Contraseña temporal<input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="Mínimo 8 caracteres" /></label>
            <p className="muted small-print">Comparte la contraseña por un canal seguro y pide que la cambie al entrar.</p>
            <button><Icon name="userPlus" size={16} />Crear cuenta</button>
          </form>
        </section>
      </div>
    </div>
  );
}

function ProfileFields({ u, self, campuses }: { u?: Profile; self?: boolean; campuses: string[] }) {
  // Si el usuario tiene un plantel desactivado se conserva como opción para no perderlo al guardar.
  const options = u?.campus && !campuses.includes(u.campus) ? [...campuses, u.campus] : campuses;
  return (
    <div className="field-grid">
      <label>Nombre completo<input name="full_name" required minLength={3} defaultValue={u?.full_name} /></label>
      <label>Perfil
        <select name="role" defaultValue={u?.role ?? 'solicitante'} disabled={self}>
          {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        {self && <input type="hidden" name="role" value="administrador" />}
      </label>
      <label>Plantel
        <select name="campus" defaultValue={u?.campus ?? ''}>
          <option value="">Todos los planteles</option>
          {options.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label>Puesto<input name="job_title" defaultValue={u?.job_title ?? ''} placeholder="Ej. Analista de soporte" /></label>
      <label className="span-all">Foto (ruta o URL)
        <input name="avatar_url" defaultValue={u?.avatar_url ?? ''} list={`avatars-${u?.id ?? 'nuevo'}`} placeholder="/avatars/… o https://…  (vacío = iniciales)" />
        <datalist id={`avatars-${u?.id ?? 'nuevo'}`}>{AVATARS.map((a) => <option key={a} value={a} />)}</datalist>
      </label>
    </div>
  );
}
