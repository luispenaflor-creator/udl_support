import { relativeTime } from '@/lib/dashboard';
import { ESC_KIND_LABEL, type EscUpdate } from '@/lib/escalationView';

// Bitácora de una escalación: cada nota, reasignación, cambio de prioridad y cierre, con autor y fecha.
export function EscTimeline({ updates, people }: { updates: EscUpdate[]; people: Map<string, { full_name: string }> }) {
  return (
    <ol className="esc-timeline" aria-label="Bitácora de la escalación">
      {updates.map((u) => (
        <li key={u.id} className={`kind-${u.kind}`}>
          <span className="dot" />
          <div>
            <span className="esc-tl-head"><strong>{ESC_KIND_LABEL[u.kind]}</strong><small className="muted">{people.get(u.author_id ?? '')?.full_name ?? 'Sistema'} · {relativeTime(u.created_at)}</small></span>
            <p>{u.note}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
