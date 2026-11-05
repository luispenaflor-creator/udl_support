'use client';

import { useState } from 'react';
import { COMMON_ISSUES, HOME_OFFICE, OTHER_ISSUE } from '@/lib/dashboard';

/**
 * Asunto (falla común u "Otro" escrito a mano) y plantel → salón/área.
 * Las áreas de cada plantel salen del catálogo; mientras no exista, se escriben libremente.
 */
export function NewTicketFields({ campuses, defaultCampus, areas }: { campuses: string[]; defaultCampus: string; areas: Record<string, string[]> }) {
  const [issue, setIssue] = useState('');
  const [campus, setCampus] = useState(defaultCampus);
  const list = areas[campus] ?? [];
  const remote = campus === HOME_OFFICE;

  return (
    <>
      <label>¿Qué falla tienes?
        <select name="issue" required value={issue} onChange={(e) => setIssue(e.target.value)}>
          <option value="" disabled>Elige la opción que más se parezca</option>
          {COMMON_ISSUES.map((x) => <option key={x} value={x}>{x}</option>)}
          <option value={OTHER_ISSUE}>Otro (lo escribo yo)</option>
        </select>
      </label>
      {issue === OTHER_ISSUE && (
        <label>Escribe el asunto
          <input name="subject_other" minLength={5} maxLength={180} required autoFocus placeholder="Ej. No puedo entrar a mi correo institucional" />
        </label>
      )}
      <div className="field-grid">
        <label>Plantel
          <select name="campus" value={campus} onChange={(e) => setCampus(e.target.value)}>{campuses.map((x) => <option key={x} value={x}>{x}</option>)}</select>
        </label>
        <label>{remote ? 'Ubicación (opcional)' : 'Salón / área'}
          <input name="area" maxLength={80} required={!remote} list={list.length ? 'areas-plantel' : undefined} autoComplete="off"
            placeholder={remote ? 'Ej. Desde casa' : list.length ? 'Elige o escribe el salón' : 'Ej. Aula 204, Biblioteca, Dirección'} key={campus} />
          {list.length > 0 && <datalist id="areas-plantel">{list.map((a) => <option key={a} value={a} />)}</datalist>}
        </label>
      </div>
    </>
  );
}
