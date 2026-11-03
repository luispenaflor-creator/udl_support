import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { notifyTicket } from '@/lib/notify';
import { access } from '@/lib/auth';
import { allCampusNames, campusNames } from '@/lib/campuses';
import { CATEGORIES, PRIORITY_LABEL, PRIORITY_ORDER } from '@/lib/dashboard';
import { Icon } from '@/components/Icon';

const PRIORITY_HINT: Record<string, string> = {
  urgente: 'Detiene clases u operación de un área completa',
  alta: 'Afecta a varias personas o un servicio importante',
  media: 'Afecta el trabajo de una persona',
  baja: 'Consulta o mejora sin urgencia',
};

export default async function New({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { s, p } = await access();
  const campuses = await campusNames(s);

  async function save(f: FormData) {
    'use server';
    const { s, user } = await access();
    const subject = String(f.get('subject') ?? '').trim();
    const description = String(f.get('description') ?? '').trim();
    const category = String(f.get('category'));
    const priority = String(f.get('priority'));
    const campus = String(f.get('campus'));
    const fail = (m: string) => redirect(`/tickets/nuevo?error=${encodeURIComponent(m)}`);
    if (subject.length < 5 || subject.length > 180) fail('El asunto debe tener entre 5 y 180 caracteres');
    if (description.length < 10) fail('Describe el problema con al menos 10 caracteres');
    if (!(CATEGORIES as readonly string[]).includes(category) || !(PRIORITY_ORDER as string[]).includes(priority)) fail('Categoría o prioridad no válida');
    if (!(await allCampusNames(s)).includes(campus)) fail('Elige un plantel válido');
    const { data, error } = await s.from('tickets').insert({ subject, description, category, campus, priority, requester_id: user.id }).select('id').single();
    if (error || !data) fail('No se pudo crear el ticket. Intenta de nuevo.');
    after(() => notifyTicket('ticket_creado', data!.id, { actorId: user.id, message: description }));
    redirect('/tickets/' + data!.id);
  }

  return (
    <div className="dash narrow">
      <header className="page-head reveal">
        <div><h1>Crear ticket</h1><p className="muted">Cuéntanos qué pasa y en qué plantel; soporte te responderá por este medio.</p></div>
      </header>
      {error && <p className="flash err" role="alert"><Icon name="alert" size={18} />{error}</p>}
      <form action={save} className="glass panel form reveal" style={{ '--d': '60ms' } as React.CSSProperties}>
        <label>Asunto<input name="subject" minLength={5} maxLength={180} required placeholder="Ej. El proyector del aula 204 no enciende" /></label>
        <div className="field-grid">
          <label>Categoría
            <select name="category" defaultValue="Otro">{CATEGORIES.map((x) => <option key={x} value={x}>{x}</option>)}</select>
          </label>
          <label>Plantel
            <select name="campus" defaultValue={p.campus && campuses.includes(p.campus) ? p.campus : campuses[0]}>{campuses.map((x) => <option key={x} value={x}>{x}</option>)}</select>
          </label>
        </div>
        <fieldset className="priority-pick">
          <legend>Prioridad</legend>
          {PRIORITY_ORDER.map((x) => (
            <label key={x} className={`prio-opt pr-${x}`}>
              <input type="radio" name="priority" value={x} defaultChecked={x === 'media'} />
              <span><strong>{PRIORITY_LABEL[x]}</strong><small>{PRIORITY_HINT[x]}</small></span>
            </label>
          ))}
        </fieldset>
        <label>Descripción<textarea name="description" minLength={10} required placeholder="¿Qué ocurre, desde cuándo y a quién afecta?" /></label>
        <button><Icon name="check" size={16} />Enviar solicitud</button>
      </form>
    </div>
  );
}
