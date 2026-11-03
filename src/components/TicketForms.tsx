'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icon';

const CLOSING = ['resuelto', 'cerrado'];

// Gestión de estado/asignación. Al pasar a Resuelto o Cerrado exige describir la solución aplicada.
export function ManageForm({ action, options, current, agents, assignee, canAssign }: {
  action: (f: FormData) => void | Promise<void>;
  options: { value: string; label: string }[];
  current: string;
  agents: { id: string; label: string }[];
  assignee: string | null;
  canAssign: boolean;
}) {
  const [status, setStatus] = useState(current);
  const needsSolution = CLOSING.includes(status) && !CLOSING.includes(current);
  const needsQuestion = status === 'en_espera' && current !== 'en_espera';
  return (
    <form action={action} className="form">
      <label>Estado
        <select name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      {canAssign && (
        <label>Agente asignado
          <select name="assignee_id" defaultValue={assignee ?? ''}>
            <option value="">Sin asignar</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </label>
      )}
      {needsQuestion && (
        <label className="question-field">¿Qué necesitas que responda el solicitante? <em>(obligatorio)</em>
          <textarea name="question" required minLength={10} maxLength={1000}
            placeholder="Ej. ¿Puedes confirmar el número de serie del equipo y en qué aula está?" />
          <small>Se le enviará como mensaje y verá «Requiere tu respuesta». Al responder, el ticket vuelve a atención automáticamente.</small>
        </label>
      )}
      {needsSolution && (
        <label className="solution-field">¿Qué se realizó para resolverlo? <em>(obligatorio)</em>
          <textarea name="resolution" required minLength={10} maxLength={2000}
            placeholder="Describe la solución aplicada: diagnóstico, acciones y resultado. El solicitante la verá en la conversación." />
        </label>
      )}
      <button><Icon name="check" size={16} />{needsSolution ? `Marcar como ${status === 'resuelto' ? 'resuelto' : 'cerrado'}` : needsQuestion ? 'Enviar pregunta y esperar respuesta' : 'Guardar cambios'}</button>
    </form>
  );
}

// Botón de escalación del solicitante: desactivado con cuenta regresiva hasta que se cumple el tiempo de espera.
export function RequesterEscalate({ action, availableAt, rule }: { action: (f: FormData) => void | Promise<void>; availableAt: number; rule: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  const left = availableAt - now;
  const ready = left <= 0;
  const wait = (() => {
    const m = Math.ceil(left / 60_000);
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim();
  })();
  return (
    <form action={action} className="form">
      <p className="muted small-print"><Icon name="clock" size={13} /> {rule}</p>
      <label>¿Por qué lo escalas?
        <textarea name="reason" required minLength={10} maxLength={1000} disabled={!ready}
          placeholder="Ej. Llevamos una hora sin internet en el laboratorio y hay examen a las 12." />
      </label>
      <button className={ready ? 'escalate' : ''} disabled={!ready} aria-disabled={!ready}>
        <Icon name="alert" size={16} />{ready ? 'Escalar ticket' : `Disponible en ${wait}`}
      </button>
    </form>
  );
}
