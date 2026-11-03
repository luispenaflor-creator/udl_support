import Link from 'next/link';
import { access } from '@/lib/auth';
import { allCampusNames, campusNames } from '@/lib/campuses';
import { PERIODS, relativeTime } from '@/lib/dashboard';
import { loadOpinions, opinionStats, parseOpinionFilter, type OpinionFilter } from '@/lib/opinions';
import { Icon } from '@/components/Icon';
import { Empty, FilterChips, Panel, StatCard } from '@/components/dashboard';
import { Avatar, Stars } from '@/components/people';

const STAR_TONE: Record<number, string> = { 5: '#4ade80', 4: '#a3e635', 3: '#fbbf24', 2: '#fb923c', 1: '#fb7185' };

export default async function Opinions({ searchParams }: { searchParams: Promise<OpinionFilter> }) {
  const raw = await searchParams;
  const ctx = await access(['directivo', 'administrador']);
  const CAMPUS = await campusNames(ctx.s);
  const { f, lockedCampus } = parseOpinionFilter(raw, { role: ctx.p.role, campus: ctx.p.campus, campuses: await allCampusNames(ctx.s) });
  const { all, visible, agents, requesters, error, truncated } = await loadOpinions(ctx, f);
  const stats = opinionStats(all);
  const shown = opinionStats(visible);
  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const isAdmin = ctx.p.role === 'administrador';

  const url = (patch: OpinionFilter) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...f, ...(lockedCampus ? { campus: undefined } : {}), ...patch })) if (v && v !== 'todos') q.set(k, v);
    const str = q.toString();
    return str ? `/opiniones?${str}` : '/opiniones';
  };
  const params = { estrellas: f.estrellas, periodo: f.periodo, campus: lockedCampus ? undefined : f.campus, agente: f.agente, comentario: f.comentario };
  const exportHref = url({}).replace('/opiniones', '/opiniones/exportar');

  return (
    <div className="dash">
      <header className="page-head reveal">
        <div>
          <h1>Opiniones de usuarios</h1>
          <p className="muted">Evaluaciones de tickets cerrados{lockedCampus ? ` · Plantel ${lockedCampus}` : ''}{truncated ? ' · se muestran las 10,000 más recientes' : ''}</p>
        </div>
        <a className="button excel" href={exportHref} download><Icon name="download" />Descargar Excel</a>
      </header>

      <nav className="filters glass reveal" aria-label="Filtros de opiniones" style={{ '--d': '60ms' } as React.CSSProperties}>
        <div className="filter-group" role="group" aria-label="Estrellas">
          <span className="filter-label"><Icon name="star" size={14} />Estrellas</span>
          <Link href={url({ estrellas: undefined })} className={'filter-chip' + (!f.estrellas ? ' on' : '')}>Todas · {stats.n}</Link>
          {stats.dist.map((d) => (
            <Link key={d.stars} href={url({ estrellas: String(d.stars) })} className={'filter-chip star-chip' + (f.estrellas === String(d.stars) ? ' on' : '')}
              aria-label={`${d.stars} estrellas: ${d.count} opiniones`}>
              <span className="star-chip-stars" style={{ color: STAR_TONE[d.stars] }}>{'★'.repeat(d.stars)}</span>{d.count}
            </Link>
          ))}
          <Link href={url({ estrellas: 'bajas' })} className={'filter-chip warn' + (f.estrellas === 'bajas' ? ' on' : '')}><Icon name="alert" size={13} />1–2 ★</Link>
        </div>
        <FilterChips basePath="/opiniones" label="Periodo" param="periodo" current={f.periodo ?? 'todo'} params={params}
          options={PERIODS.map((x) => ({ key: x.key, label: x.label }))} />
        {!lockedCampus && <FilterChips basePath="/opiniones" label="Plantel" param="campus" current={f.campus ?? 'todos'} params={params}
          options={[{ key: 'todos', label: 'Todos' }, ...CAMPUS.map((c) => ({ key: c, label: c }))]} />}
        <div className="filter-group" role="group" aria-label="Agente y comentario">
          <span className="filter-label"><Icon name="users" size={14} />Agente</span>
          <Link href={url({ agente: undefined })} className={'filter-chip' + (!f.agente ? ' on' : '')}>Todos</Link>
          {agents.map((a) => (
            <Link key={a.id} href={url({ agente: a.id })} className={'filter-chip with-avatar' + (f.agente === a.id ? ' on' : '')}>
              <Avatar name={a.full_name} src={a.avatar_url} size={20} />{a.full_name.split(' ').slice(0, 2).join(' ')}
            </Link>
          ))}
          <Link href={url({ comentario: f.comentario ? undefined : '1' })} className={'filter-chip' + (f.comentario ? ' on' : '')} aria-pressed={!!f.comentario}>
            <Icon name="message" size={13} />Solo con comentario
          </Link>
        </div>
      </nav>

      {error ? <section className="glass panel"><Empty icon="alert" title="No se pudieron cargar las opiniones">Intenta de nuevo en unos momentos.</Empty></section> : (
        <>
          <section className="stats five">
            <StatCard label="Calificación promedio" value={null} text={stats.avg === null ? undefined : `${stats.avg.toFixed(1)} / 5`} icon="star" tone="amber" hint={`${stats.n} evaluaciones`} delay={80} />
            <StatCard label="Satisfechos (4–5 ★)" value={stats.happy} suffix="%" icon="checkCircle" tone="green" hint="Del total evaluado" href={url({ estrellas: '5' })} delay={130} />
            <StatCard label="Insatisfechos (1–2 ★)" value={stats.unhappy} suffix="%" icon="alert" tone="rose" hint="Requieren seguimiento" href={url({ estrellas: 'bajas' })} delay={180} />
            <StatCard label="Con comentario" value={stats.withComment} icon="message" tone="violet" hint="Opiniones escritas" href={url({ comentario: '1' })} delay={230} />
            <StatCard label="Mostrando" value={shown.n} icon="filter" tone="cyan" hint={f.estrellas ? (f.estrellas === 'bajas' ? 'Filtro: 1–2 estrellas' : `Filtro: ${f.estrellas} estrellas`) : 'Sin filtro de estrellas'} delay={280} />
          </section>

          <div className="opinions-layout">
            <Panel title="Distribución" icon="chart" delay={320}>
              <ul className="star-dist">
                {stats.dist.map((d) => {
                  const pct = stats.n ? Math.round((d.count / stats.n) * 100) : 0;
                  const on = f.estrellas === String(d.stars);
                  return (
                    <li key={d.stars}>
                      <Link href={url({ estrellas: on ? undefined : String(d.stars) })} className={'dist-row' + (on ? ' on' : '')} aria-pressed={on}>
                        <span className="dist-label">{d.stars} <Icon name="star" size={14} /></span>
                        <span className="bar-track"><span className="bar-fill" style={{ '--w': `${pct}%`, '--d': '0ms', background: STAR_TONE[d.stars] } as React.CSSProperties} /></span>
                        <b>{d.count}</b><small>{pct}%</small>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {stats.avg !== null && <div className="dist-avg"><Stars value={stats.avg} size={22} /><span className="muted small-print">Promedio de {stats.n} evaluaciones</span></div>}
            </Panel>

            <Panel title={`Opiniones${f.estrellas ? (f.estrellas === 'bajas' ? ' de 1–2 ★' : ` de ${f.estrellas} ★`) : ''}`} icon="message" delay={360}
              action={<span className="muted small-print">{shown.n} {shown.n === 1 ? 'opinión' : 'opiniones'}</span>}>
              {visible.length === 0 ? (
                <Empty icon="star" title="No hay opiniones con estos filtros">Prueba otro nivel de estrellas, otro periodo o quita el filtro de comentario.</Empty>
              ) : (
                <ul className="opinion-list">
                  {visible.slice(0, 200).map((o, i) => {
                    const agent = o.tickets.assignee_id ? agentMap.get(o.tickets.assignee_id) : null;
                    const who = requesters.get(o.requester_id);
                    return (
                      <li key={o.ticket_id} className={`opinion glass-soft reveal score-${o.score}`} style={{ '--d': `${Math.min(i, 10) * 40 + 380}ms` } as React.CSSProperties}>
                        <div className="opinion-top">
                          <Stars value={o.score} size={17} />
                          <time className="muted small-print" dateTime={o.submitted_at ?? undefined}>{relativeTime(o.submitted_at)}</time>
                        </div>
                        {o.comment?.trim() ? <blockquote>“{o.comment}”</blockquote> : <p className="no-comment">Sin comentario escrito</p>}
                        <div className="opinion-meta">
                          <Link href={`/tickets/${o.tickets.id}`} className="opinion-ticket"><span className="folio">{o.tickets.folio}</span>{o.tickets.subject}</Link>
                          <span className="opinion-people">
                            {agent && <span className="person"><Avatar name={agent.full_name} src={agent.avatar_url} size={22} />{agent.full_name}</span>}
                            <span className="muted small-print"><Icon name="building" size={12} />{o.tickets.campus}</span>
                            {isAdmin && <span className="muted small-print"><Icon name="user" size={12} />{who?.full_name ?? 'Solicitante'}</span>}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {visible.length > 200 && <p className="muted small-print">Se muestran 200 de {visible.length}. Descarga el Excel para verlas todas.</p>}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
