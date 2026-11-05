import { Fragment } from 'react';
import Link from 'next/link';
import { Icon } from './Icon';
import { formatDuration, ticketsUrl, type AgentStats, type TicketFilter } from '@/lib/dashboard';

export function initials(name: string | null | undefined) {
  return String(name ?? '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

// Foto del perfil o, si no existe, iniciales sobre degradado. El nombre siempre se muestra junto, por eso alt vacío.
export function Avatar({ name, src, size = 40, className = '' }: { name?: string | null; src?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) };
  return src
    ? <img className={`avatar avatar-img ${className}`} src={src} alt="" width={size} height={size} style={style} />
    : <span className={`avatar ${className}`} style={style} aria-hidden="true">{initials(name)}</span>;
}

export function Stars({ value, size = 16 }: { value: number | null; size?: number }) {
  if (value === null) return <span className="stars none">Sin evaluaciones</span>;
  return (
    <span className="stars" role="img" aria-label={`${value.toFixed(1)} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
            <defs><linearGradient id={`sf-${i}-${Math.round(fill * 100)}`}><stop offset={fill} stopColor="#fbbf24" /><stop offset={fill} style={{ stopColor: 'rgb(var(--hi) / .18)' }} /></linearGradient></defs>
            <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" fill={`url(#sf-${i}-${Math.round(fill * 100)})`} />
          </svg>
        );
      })}
      <b>{value.toFixed(1)}</b>
    </span>
  );
}

// Calificación con radios nativos: funciona con teclado (flechas) y sin JavaScript.
export function StarInput({ name = 'score' }: { name?: string }) {
  return (
    <fieldset className="star-input">
      <legend>¿Cómo calificas la atención?</legend>
      <div className="star-row">
        {/* Orden 5→1 en el DOM con row-reverse: así "~" ilumina las estrellas a la izquierda de la elegida. */}
        {[5, 4, 3, 2, 1].map((n) => (
          <Fragment key={n}>
            <input type="radio" id={`${name}-${n}`} name={name} value={n} required className="sr-only" />
            <label htmlFor={`${name}-${n}`} title={`${n} de 5`}>
              <Icon name="star" size={30} /><span className="sr-only">{n} {n === 1 ? 'estrella' : 'estrellas'}</span>
            </label>
          </Fragment>
        ))}
      </div>
    </fieldset>
  );
}

export function AgentCard({ agent, label = 'Agente asignado' }: { agent: { full_name: string; job_title?: string | null; avatar_url?: string | null; campus?: string | null } | null; label?: string }) {
  return (
    <div className="agent-card">
      <small className="muted">{label}</small>
      {agent ? (
        <div className="agent-card-body">
          <Avatar name={agent.full_name} src={agent.avatar_url} size={56} className="ring" />
          <div>
            <strong>{agent.full_name}</strong>
            {agent.job_title && <span className="job"><Icon name="briefcase" size={13} />{agent.job_title}</span>}
            {agent.campus && <span className="job"><Icon name="building" size={13} />{agent.campus}</span>}
          </div>
        </div>
      ) : (
        <div className="agent-card-body empty-agent"><span className="avatar" style={{ width: 56, height: 56 }}><Icon name="user" /></span><span className="muted">Sin agente todavía</span></div>
      )}
    </div>
  );
}

const MEDAL = ['oro', 'plata', 'bronce'] as const;

export function Ranking({ stats, base }: { stats: AgentStats[]; base: TicketFilter }) {
  if (!stats.length) return null;
  const podium = stats.slice(0, 3);
  // Orden visual del podio: 2.º, 1.º, 3.º
  const visual = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium;
  return (
    <>
      <div className="podium">
        {visual.map((a) => {
          const place = stats.indexOf(a);
          return (
            <Link key={a.id} href={ticketsUrl({ ...base, agente: a.id })} className={`podium-card glass-soft interactive medal-${MEDAL[place]} place-${place + 1}`}>
              <span className="medal" aria-label={`Lugar ${place + 1}`}>{place + 1}</span>
              <Avatar name={a.full_name} src={a.avatar_url} size={place === 0 ? 92 : 74} className="ring" />
              <strong>{a.full_name}</strong>
              <span className="job">{a.job_title ?? 'Agente de soporte'}</span>
              <Stars value={a.avgScore} />
              <span className="points"><b>{a.points}</b> pts</span>
              <span className="podium-meta">
                <span><b>{a.resolved}</b> resueltos</span>
                <span><b>{a.slaPct === null ? '—' : a.slaPct + '%'}</b> SLA</span>
              </span>
            </Link>
          );
        })}
      </div>
      <div className="rank-table" role="table" aria-label="Detalle del ranking de agentes">
        <div className="rank-row head" role="row">
          <span role="columnheader">#</span><span role="columnheader">Agente</span><span role="columnheader">Satisfacción</span>
          <span role="columnheader">Resueltos</span><span role="columnheader">SLA</span><span role="columnheader" title="Promedio desde la asignación hasta la resolución">T. solución</span><span role="columnheader">Abiertos</span>
        </div>
        {stats.map((a, i) => (
          <Link key={a.id} href={ticketsUrl({ ...base, agente: a.id })} className="rank-row" role="row">
            <span role="cell" className="rank-n">{i + 1}</span>
            <span role="cell" className="rank-agent"><Avatar name={a.full_name} src={a.avatar_url} size={34} /><span><strong>{a.full_name}</strong><small>{a.job_title ?? 'Agente de soporte'}</small></span></span>
            <span role="cell"><Stars value={a.avgScore} size={13} /><small className="muted">{a.ratings} eval.</small></span>
            <span role="cell"><b>{a.resolved}</b></span>
            <span role="cell"><span className="mini-bar"><span style={{ '--w': `${a.slaPct ?? 0}%` } as React.CSSProperties} /></span>{a.slaPct === null ? '—' : a.slaPct + '%'}</span>
            <span role="cell">{a.avgResolutionMs === null ? '—' : formatDuration(a.avgResolutionMs)}</span>
            <span role="cell">{a.open}{a.overdue > 0 && <small className="over"><Icon name="alert" size={12} />{a.overdue}</small>}</span>
          </Link>
        ))}
      </div>
      <p className="muted small-print">Puntaje: 45 % satisfacción de solicitantes, 35 % cumplimiento SLA y 20 % volumen resuelto. Toca un agente para ver sus tickets.</p>
    </>
  );
}
