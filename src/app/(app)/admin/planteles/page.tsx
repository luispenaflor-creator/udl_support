import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { access } from '@/lib/auth';
import { loadCampuses } from '@/lib/campuses';
import { Icon } from '@/components/Icon';
import { Empty } from '@/components/dashboard';

type Search = { ok?: string; error?: string };
const back = (kind: 'ok' | 'error', msg: string): never => redirect(`/admin/planteles?${kind}=${encodeURIComponent(msg)}`);
const cleanName = (v: FormDataEntryValue | null) => String(v ?? '').trim().replace(/\s+/g, ' ');

async function addCampus(f: FormData) {
  'use server';
  const { s, user } = await access(['administrador']);
  const name = cleanName(f.get('name'));
  const address = String(f.get('address') ?? '').trim() || null;
  if (name.length < 2 || name.length > 60) back('error', 'El nombre debe tener entre 2 y 60 caracteres');
  const { error } = await s.from('campuses').insert({ name, address });
  if (error) back('error', error.code === '23505' ? `Ya existe un plantel llamado ${name}` : error.message);
  await s.from('audit_logs').insert({ actor_id: user.id, action: 'plantel_creado', entity_type: 'campuses', entity_id: name, metadata: { name, address } });
  revalidatePath('/', 'layout');
  back('ok', `«${name}» se agregó al catálogo.`);
}

async function updateCampus(f: FormData) {
  'use server';
  const { s, user } = await access(['administrador']);
  const id = String(f.get('id'));
  const name = cleanName(f.get('name'));
  const address = String(f.get('address') ?? '').trim() || null;
  const active = f.get('active') === 'on';
  if (name.length < 2 || name.length > 60) back('error', 'El nombre debe tener entre 2 y 60 caracteres');
  const { data: before } = await s.from('campuses').select('*').eq('id', id).single();
  if (!before) back('error', 'El plantel no existe');
  // Renombrar actualiza en cascada tickets y perfiles (llave foránea ON UPDATE CASCADE).
  const { error } = await s.from('campuses').update({ name, address, active }).eq('id', id);
  if (error) back('error', error.code === '23505' ? `Ya existe un plantel llamado ${name}` : error.message);
  const changes = Object.fromEntries(Object.entries({ name, address, active }).filter(([k, v]) => before[k] !== v).map(([k, v]) => [k, { de: before[k], a: v }]));
  if (Object.keys(changes).length) await s.from('audit_logs').insert({ actor_id: user.id, action: 'plantel_actualizado', entity_type: 'campuses', entity_id: name, metadata: { cambios: changes } });
  revalidatePath('/', 'layout');
  back('ok', `«${name}» se actualizó.`);
}

async function deleteCampus(f: FormData) {
  'use server';
  const { s, user } = await access(['administrador']);
  const id = String(f.get('id'));
  const { data: c } = await s.from('campuses').select('name').eq('id', id).single();
  if (!c) back('error', 'El plantel no existe');
  const { count } = await s.from('tickets').select('id', { count: 'exact', head: true }).eq('campus', c!.name);
  if (count) back('error', `${c!.name} tiene ${count} tickets y no puede eliminarse; desactívalo para ocultarlo en formularios.`);
  // Los perfiles con este plantel quedan sin plantel asignado (ON DELETE SET NULL).
  const { error } = await s.from('campuses').delete().eq('id', id);
  if (error) back('error', error.message);
  await s.from('audit_logs').insert({ actor_id: user.id, action: 'plantel_eliminado', entity_type: 'campuses', entity_id: c!.name, metadata: { name: c!.name } });
  revalidatePath('/', 'layout');
  back('ok', `«${c!.name}» se eliminó del catálogo.`);
}

export default async function Campuses({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { s } = await access(['administrador']);
  const { list, fromDb } = await loadCampuses(s);
  // Conteos exactos por plantel (consultas "head"): no dependen del límite de filas de la API.
  const head = () => s.from('tickets').select('id', { count: 'exact', head: true });
  const [counts, { data: pf }] = await Promise.all([
    Promise.all(list.map(async (c) => {
      const [{ count: total }, { count: open }] = await Promise.all([
        head().eq('campus', c.name),
        head().eq('campus', c.name).not('status', 'in', '(resuelto,cerrado)'),
      ]);
      return [c.name, { total: total ?? 0, open: open ?? 0 }] as const;
    })),
    s.from('profiles').select('campus,role'),
  ]);
  const ticketCounts = new Map(counts);
  const people = (pf ?? []) as { campus: string | null; role: string }[];
  const stats = (name: string) => ({
    ...(ticketCounts.get(name) ?? { total: 0, open: 0 }),
    users: people.filter((p) => p.campus === name).length,
    agents: people.filter((p) => p.campus === name && p.role === 'agente').length,
  });

  return (
    <div className="dash">
      <header className="page-head reveal">
        <div><h1>Planteles</h1><p className="muted">{list.filter((c) => c.active).length} activos · {list.length} en el catálogo</p></div>
      </header>
      {sp.ok && <p className="flash ok" role="status"><Icon name="checkCircle" size={18} />{sp.ok}</p>}
      {sp.error && <p className="flash err" role="alert"><Icon name="alert" size={18} />{sp.error}</p>}

      {!fromDb ? (
        <section className="glass panel"><Empty icon="alert" title="Falta ejecutar la migración de planteles">
          Ejecuta <code>202611050001_planteles_escalaciones_asignacion.sql</code> en Supabase para poder editar el catálogo. Mientras tanto se usan los 8 planteles institucionales.
        </Empty></section>
      ) : (
        <div className="users-grid">
          <section className="glass panel reveal" style={{ '--d': '60ms' } as React.CSSProperties}>
            <header className="panel-head"><h2><Icon name="building" size={18} />Catálogo</h2></header>
            <ul className="campus-list">
              {list.map((c) => {
                const st = stats(c.name);
                return (
                  <li key={c.id} className={`campus-row glass-soft${c.active ? '' : ' inactive'}`}>
                    <details>
                      <summary>
                        <span className="campus-icon"><Icon name="building" size={20} /></span>
                        <span className="user-main"><strong>{c.name}</strong><small>{c.address ?? 'Sin dirección registrada'}</small></span>
                        <span className="campus-stats">
                          <span><b>{st.open}</b> abiertos</span><span><b>{st.total}</b> tickets</span><span><b>{st.agents}</b> agentes</span><span><b>{st.users}</b> usuarios</span>
                        </span>
                        {c.active ? <span className="chip sla-ok"><Icon name="check" size={12} />Activo</span> : <span className="chip sla-vencido"><Icon name="lock" size={12} />Inactivo</span>}
                        <span className="edit-hint"><Icon name="edit" size={16} />Editar</span>
                      </summary>
                      <form action={updateCampus} className="form user-form">
                        <input type="hidden" name="id" value={c.id} />
                        <div className="field-grid">
                          <label>Nombre<input name="name" required minLength={2} maxLength={60} defaultValue={c.name} /></label>
                          <label>Dirección<input name="address" maxLength={200} defaultValue={c.address ?? ''} placeholder="Calle, número, colonia" /></label>
                        </div>
                        <label className="check"><input type="checkbox" name="active" defaultChecked={c.active} />Activo (aparece en formularios y filtros)</label>
                        <p className="muted small-print">Al renombrarlo se actualizan automáticamente sus {st.total} tickets y {st.users} perfiles.</p>
                        <div className="form-actions"><button className="small"><Icon name="check" size={16} />Guardar</button></div>
                      </form>
                      <form action={deleteCampus} className="form user-form reset">
                        <input type="hidden" name="id" value={c.id} />
                        <p className="muted small-print">{st.total ? `No se puede eliminar: tiene ${st.total} tickets. Desactívalo para ocultarlo.` : `Eliminar definitivamente. ${st.users ? `${st.users} perfiles quedarán sin plantel.` : ''}`}</p>
                        <button className="small danger" disabled={st.total > 0}><Icon name="x" size={16} />Eliminar plantel</button>
                      </form>
                    </details>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="glass panel new-user reveal" style={{ '--d': '120ms' } as React.CSSProperties}>
            <header className="panel-head"><h2><Icon name="plus" size={18} />Agregar plantel</h2></header>
            <form action={addCampus} className="form">
              <label>Nombre<input name="name" required minLength={2} maxLength={60} placeholder="Ej. Tlalpan" /></label>
              <label>Dirección (opcional)<input name="address" maxLength={200} placeholder="Calle, número, colonia" /></label>
              <button><Icon name="plus" size={16} />Agregar</button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
