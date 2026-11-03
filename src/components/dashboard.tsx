import Link from 'next/link';
import { CountUp } from './CountUp';
import { Icon, type IconName } from './Icon';
import {
  PRIORITY_LABEL, REQUESTER_STATUS_LABEL, SLA_LABEL, STATUS_LABEL, sla, slaText,
  type Priority, type SlaState, type Status, type TicketRow,
} from '@/lib/dashboard';

const STATUS_ICON: Record<Status, IconName> = {
  nuevo: 'sparkle', abierto: 'circle', en_progreso: 'play', en_espera: 'pause', resuelto: 'checkCircle', cerrado: 'lock',
};
const PRIORITY_ICON: Record<Priority, IconName> = { urgente: 'flame', alta: 'chevUp', media: 'minus', baja: 'chevDown' };
const SLA_ICON: Record<SlaState, IconName> = { ok: 'clock', riesgo: 'hourglass', vencido: 'alert', cumplido: 'checkCircle', incumplido: 'alert' };

// Chips: siempre color + icono + texto, nunca solo color.
// `audience="solicitante"` usa etiquetas pensadas para quien pidió el soporte (p. ej. "Requiere tu respuesta").
export function StatusChip({ status, audience = 'staff' }: { status: Status; audience?: 'staff' | 'solicitante' }) {
  const label = audience === 'solicitante' ? REQUESTER_STATUS_LABEL[status] : STATUS_LABEL[status];
  const icon = audience === 'solicitante' && status === 'en_espera' ? 'hand' : STATUS_ICON[status];
  return <span className={`chip st-${status}`}><Icon name={icon} size={14} />{label}</span>;
}
export function PriorityChip({ priority }: { priority: Priority }) {
  return <span className={`chip pr-${priority}`}><Icon name={PRIORITY_ICON[priority]} size={14} />{PRIORITY_LABEL[priority]}</span>;
}
export function SlaChip({ state }: { state: SlaState }) {
  return <span className={`chip sla-${state}`}><Icon name={SLA_ICON[state]} size={14} />{SLA_LABEL[state]}</span>;
}

export function SlaBar({ ticket }: { ticket: TicketRow }) {
  const s = sla(ticket);
  return (
    <div className={`sla-bar sla-${s.state}`}>
      <div className="sla-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(s.elapsedPct)}
        aria-label={`Tiempo de SLA consumido: ${Math.round(s.elapsedPct)} %`}>
        <span style={{ '--w': `${s.elapsedPct}%` } as React.CSSProperties} />
      </div>
      <small><Icon name={SLA_ICON[s.state]} size={13} />{slaText(ticket)}</small>
    </div>
  );
}

export type Tone = 'blue' | 'violet' | 'cyan' | 'amber' | 'rose' | 'green';

export function StatCard({ label, value, text, suffix, icon, tone, hint, href, delay = 0 }: {
  label: string; value: number | null; text?: string; suffix?: string; icon: IconName; tone: Tone; hint?: string; href?: string; delay?: number;
}) {
  const body = (
    <>
      <span className="stat-icon"><Icon name={icon} size={22} /></span>
      <span className="stat-label">{label}</span>
      {/* `text` muestra un valor no numérico (p. ej. "hace 2 h") en lugar de un guion. */}
      <strong className={'stat-value' + (text ? ' as-text' : '')}>{text ?? (value === null ? '—' : <CountUp value={value} suffix={suffix} />)}</strong>
      {hint && <span className="stat-hint">{hint}</span>}
    </>
  );
  const cls = `glass stat tone-${tone} reveal`;
  const style = { '--d': `${delay}ms` } as React.CSSProperties;
  return href
    ? <Link href={href} className={cls + ' interactive'} style={style}>{body}</Link>
    : <div className={cls} style={style}>{body}</div>;
}

export function Panel({ id, title, icon, children, action, className = '', delay = 0 }: {
  id?: string; title: string; icon?: IconName; children: React.ReactNode; action?: React.ReactNode; className?: string; delay?: number;
}) {
  return (
    <section id={id} className={`glass panel reveal ${className}`} style={{ '--d': `${delay}ms` } as React.CSSProperties}>
      <header className="panel-head">
        <h2>{icon && <Icon name={icon} size={18} />}{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

const SERIES = ['#2dd4bf', '#a78bfa', '#fbbf24', '#f472b6', '#38bdf8', '#fb923c', '#a3e635', '#c084fc'];

type Datum = { label: string; value: number; color?: string; href?: string };

// Dona SVG con leyenda y valores visibles (no depende del color para leerse). Cada elemento de la leyenda abre sus tickets.
export function Donut({ data, total, centerLabel }: { data: Datum[]; total?: number; centerLabel: string }) {
  const sum = total ?? data.reduce((a, d) => a + d.value, 0);
  const r = 52, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 140 140" role="img" aria-label={`${centerLabel}: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`}>
        <circle cx="70" cy="70" r={r} className="donut-bg" />
        {sum > 0 && data.filter((d) => d.value > 0).map((d, i) => {
          const len = (d.value / sum) * c;
          const seg = (
            <circle key={d.label} cx="70" cy="70" r={r} className="donut-seg"
              stroke={d.color ?? SERIES[i % SERIES.length]}
              style={{ '--len': len, '--c': c, '--off': -offset, '--d': `${i * 90}ms` } as React.CSSProperties} />
          );
          offset += len;
          return seg;
        })}
        <text x="70" y="68" className="donut-num">{sum}</text>
        <text x="70" y="88" className="donut-cap">{centerLabel}</text>
      </svg>
      <ul className="legend">
        {data.map((d, i) => {
          const inner = <><i style={{ background: d.color ?? SERIES[i % SERIES.length] }} /><span>{d.label}</span><b>{d.value}</b></>;
          return <li key={d.label}>{d.href ? <Link href={d.href} className="legend-link">{inner}</Link> : <span className="legend-link">{inner}</span>}</li>;
        })}
      </ul>
    </div>
  );
}

// Barras horizontales con etiqueta y valor; el ancho se anima con CSS. Cada barra abre sus tickets.
export function Bars({ data }: { data: Datum[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="bars">
      {data.map((d, i) => {
        const inner = (
          <>
            <span className="bar-label">{d.label}</span>
            <span className="bar-track">
              <span className="bar-fill" style={{ '--w': `${(d.value / max) * 100}%`, '--d': `${i * 70}ms`, background: d.color ?? SERIES[i % SERIES.length] } as React.CSSProperties} />
            </span>
            <b className="bar-value">{d.value}</b>
          </>
        );
        return <li key={d.label}>{d.href ? <Link href={d.href} className="bar-row">{inner}</Link> : <span className="bar-row">{inner}</span>}</li>;
      })}
    </ul>
  );
}

export const STATUS_COLOR: Record<Status, string> = {
  nuevo: '#2dd4bf', abierto: '#38bdf8', en_progreso: '#a78bfa', en_espera: '#fbbf24', resuelto: '#4ade80', cerrado: '#94a3b8',
};
export const PRIORITY_COLOR: Record<Priority, string> = { urgente: '#fb7185', alta: '#fb923c', media: '#fbbf24', baja: '#94a3b8' };

export function Empty({ icon = 'inbox', title, children }: { icon?: IconName; title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon"><Icon name={icon} size={30} /></span>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

// Filtros como enlaces: funcionan sin JavaScript y conservan el estado en la URL.
export function FilterChips({ label, param, options, current, params, basePath = '/' }: {
  label: string; param: string; options: { key: string; label: string }[]; current: string; params: Record<string, string | undefined>; basePath?: string;
}) {
  const hrefFor = (key: string) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, [param]: key })) if (v && v !== 'todos') q.set(k, v);
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <div className="filter-group" role="group" aria-label={label}>
      <span className="filter-label"><Icon name="filter" size={14} />{label}</span>
      {options.map((o) => (
        <Link key={o.key} href={hrefFor(o.key)} className={'filter-chip' + (o.key === current ? ' on' : '')} aria-current={o.key === current ? 'true' : undefined}>
          {o.label}
        </Link>
      ))}
    </div>
  );
}
