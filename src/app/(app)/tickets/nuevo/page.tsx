import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { notifyTicket } from '@/lib/notify';
import { access } from '@/lib/auth';
import { campusNames } from '@/lib/campuses';
import { COMMON_ISSUES, HOME_OFFICE, OTHER_ISSUE, PRIORITY_LABEL, PRIORITY_ORDER, UNCLASSIFIED } from '@/lib/dashboard';
import { Icon } from '@/components/Icon';
import { NewTicketFields } from '@/components/NewTicketFields';

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
  // Catálogo de salones/áreas por plantel (opcional: si está vacío o no existe, se escribe a mano).
  const { data: areaRows } = await s.from('campus_areas').select('campus,name').eq('active', true).order('name');
  const areas: Record<string, string[]> = {};
  for (const a of (areaRows ?? []) as { campus: string; name: string }[]) (areas[a.campus] ??= []).push(a.name);

  async function save(f: FormData) {
    'use server';
    const { s, user } = await access();
    const issue = String(f.get('issue') ?? '');
    const subject = issue === OTHER_ISSUE ? String(f.get('subject_other') ?? '').trim() : issue;
    const description = String(f.get('description') ?? '').trim();
    const priority = String(f.get('priority'));
    const campus = String(f.get('campus'));
    const area = String(f.get('area') ?? '').trim().slice(0, 80);
    const fail = (m: string) => redirect(`/tickets/nuevo?error=${encodeURIComponent(m)}`);
    if (issue !== OTHER_ISSUE && !(COMMON_ISSUES as readonly string[]).includes(issue)) fail('Elige qué falla tienes');
    if (subject.length < 5 || subject.length > 180) fail('Escribe el asunto (entre 5 y 180 caracteres)');
    if (description.length < 10) fail('Escribe el detalle del problema (mínimo 10 caracteres)');
    if (!(PRIORITY_ORDER as string[]).includes(priority)) fail('Prioridad no válida');
    if (!(await campusNames(s)).includes(campus)) fail('Elige un plantel válido');
    if (!area && campus !== HOME_OFFICE) fail('Indica el salón o área donde está la falla');
    // La categoría la asigna el agente al atenderlo.
    const row = { subject, description, category: UNCLASSIFIED, campus, area: area || null, priority, requester_id: user.id };
    const { data, error } = await s.from('tickets').insert(row).select('id').single();
    if (error || !data) fail('No se pudo crear el ticket. Intenta de nuevo.');
    after(() => notifyTicket('ticket_creado', data!.id, { actorId: user.id, message: description }));
    redirect('/tickets/' + data!.id);
  }

  return (
    <div className="dash narrow">
      <header className="page-head reveal">
        <div><h1>Crear ticket</h1><p className="muted">Elige la falla, dinos dónde estás y cuéntanos el detalle. Soporte te responderá por este medio.</p></div>
      </header>
      {error && <p className="flash err" role="alert"><Icon name="alert" size={18} />{error}</p>}
      <form action={save} className="glass panel form reveal" style={{ '--d': '60ms' } as React.CSSProperties}>
        <NewTicketFields campuses={campuses} areas={areas} defaultCampus={p.campus && campuses.includes(p.campus) ? p.campus : campuses[0]} />
        <fieldset className="priority-pick">
          <legend>Prioridad</legend>
          {PRIORITY_ORDER.map((x) => (
            <label key={x} className={`prio-opt pr-${x}`}>
              <input type="radio" name="priority" value={x} defaultChecked={x === 'media'} />
              <span><strong>{PRIORITY_LABEL[x]}</strong><small>{PRIORITY_HINT[x]}</small></span>
            </label>
          ))}
        </fieldset>
        <label>Detalle del problema <small className="muted">(obligatorio)</small><textarea name="description" minLength={10} required placeholder="¿Qué ocurre, desde cuándo y a quién afecta? Si aparece un mensaje de error, escríbelo." /></label>
        <button><Icon name="check" size={16} />Enviar solicitud</button>
      </form>
    </div>
  );
}
