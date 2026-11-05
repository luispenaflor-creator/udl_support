import Link from 'next/link';
import { access } from '@/lib/auth';
import type { Role } from '@/lib/types';
import { allCampusNames, campusNames } from '@/lib/campuses';
import {
  CATEGORIES, PERIODS, PRIORITY_LABEL, PRIORITY_ORDER, STATUS_LABEL, STATUS_ORDER,
  agentRanking, countBy, formatDuration, monthlyTrend, periodStart, summarize, ticketsUrl,
  type TicketFilter,
} from '@/lib/dashboard';
import { loadReportData } from '@/lib/reportData';
import { Icon } from '@/components/Icon';
import { Bars, Donut, Empty, FilterChips, Panel, PRIORITY_COLOR, STATUS_COLOR, StatCard } from '@/components/dashboard';
import { Ranking } from '@/components/people';

type Search = { periodo?: string; campus?: string };

export default async function Reports({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { s, p } = await access(['agente', 'directivo', 'administrador']);
  const role = p.role as Role;
  const lockedCampus = role === 'directivo' && p.campus ? (p.campus as string) : null;
  const CAMPUS = await campusNames(s);
  const campus = lockedCampus ?? ((await allCampusNames(s)).includes(sp.campus ?? '') ? sp.campus! : 'todos');
  const period = periodStart(sp.periodo ?? '90');

  const { rows, trendRows, surveys, agents, error, truncated } = await loadReportData(s, { campus: campus !== 'todos' ? campus : null, since: period.since });
  const sum = summarize(rows);
  const avgScore = surveys.length ? surveys.reduce((a, x) => a + (x.score ?? 0), 0) / surveys.length : null;
  const trend = monthlyTrend(trendRows);
  const trendMax = Math.max(1, ...trend.flatMap((m) => [m.created, m.resolved]));
  const ranking = agentRanking(rows, surveys, agents);
  const base: TicketFilter = { campus: campus !== 'todos' ? campus : undefined, periodo: period.key !== 'todo' ? period.key : undefined };
  const params = { periodo: period.key, campus: lockedCampus ? undefined : campus };

  return (
    <div className="dash">
      <header className="page-head reveal">
        <div>
          <h1>Reportes</h1>
          <p className="muted">{campus === 'todos' ? 'Todos los planteles' : `Plantel ${campus}`} · {period.label}
            {role === 'agente' && ' · incluye tus tickets y los no asignados'}
            {truncated && ' · se muestran los 20,000 más recientes'}</p>
        </div>
        <a className="button excel" href={`/reportes/exportar?periodo=${period.key}${campus !== 'todos' ? `&campus=${encodeURIComponent(campus)}` : ''}`} download>
          <Icon name="download" />Descargar reporte Excel
        </a>
      </header>

      <nav className="filters glass reveal" aria-label="Filtros del reporte" style={{ '--d': '60ms' } as React.CSSProperties}>
        <FilterChips basePath="/reportes" label="Periodo" param="periodo" current={period.key} params={params} options={PERIODS.map((x) => ({ key: x.key, label: x.label }))} />
        {!lockedCampus && <FilterChips basePath="/reportes" label="Plantel" param="campus" current={campus} params={params}
          options={[{ key: 'todos', label: 'Todos' }, ...CAMPUS.map((c) => ({ key: c, label: c }))]} />}
      </nav>

      {error ? <section className="glass panel"><Empty icon="alert" title="No se pudo generar el reporte">Intenta de nuevo en unos momentos.</Empty></section> : (
        <>
          <section className="stats five">
            <StatCard label="Tickets del periodo" value={sum.total} icon="ticket" tone="blue" hint={`${sum.open} siguen abiertos`} href={ticketsUrl(base)} delay={80} />
            <StatCard label="Resueltos" value={sum.closed} icon="checkCircle" tone="green" hint={sum.total ? `${Math.round((sum.closed / sum.total) * 100)} % del total` : 'Sin tickets'} href={ticketsUrl({ ...base, estado: 'resuelto,cerrado' })} delay={130} />
            <StatCard label="Cumplimiento SLA" value={sum.slaPct} suffix="%" icon="shield" tone="cyan" hint={sum.slaPct === null ? 'Sin resueltos' : 'Resueltos dentro del plazo'} delay={180} />
            <StatCard label="Tiempo de solución" value={null} text={sum.avgSolveMs === null ? undefined : formatDuration(sum.avgSolveMs)} icon="timer" tone="violet"
              hint={sum.avgSolveMs === null ? 'Sin resoluciones' : `De la asignación a la resolución${sum.avgResolutionMs === null ? '' : ` · total ${formatDuration(sum.avgResolutionMs)}`}`} delay={230} />
            <StatCard label="Satisfacción" value={null} text={avgScore === null ? undefined : `${avgScore.toFixed(1)} / 5`} icon="star" tone="amber" hint={`${surveys.length} evaluaciones`} delay={280} />
          </section>

          <div className="grid-main">
            <Panel title="Tendencia de 6 meses" icon="chart" className="span-2" delay={320}>
              <div className="trend" role="img" aria-label={trend.map((m) => `${m.label}: ${m.created} creados, ${m.resolved} resueltos`).join('; ')}>
                {trend.map((m, i) => (
                  <div key={m.key} className="trend-col">
                    <div className="trend-bars">
                      <span className="tb created" style={{ '--h': `${(m.created / trendMax) * 100}%`, '--d': `${i * 80}ms` } as React.CSSProperties}><b>{m.created}</b></span>
                      <span className="tb resolved" style={{ '--h': `${(m.resolved / trendMax) * 100}%`, '--d': `${i * 80 + 40}ms` } as React.CSSProperties}><b>{m.resolved}</b></span>
                    </div>
                    <small>{m.label}</small>
                  </div>
                ))}
              </div>
              <p className="trend-legend"><span><i className="created" />Creados</span><span><i className="resolved" />Resueltos</span></p>
            </Panel>

            <Panel title="Por estado" icon="chart" delay={380}>
              {rows.length ? <Donut centerLabel="tickets" data={countBy(rows, (t) => t.status, STATUS_ORDER)
                .map((d) => ({ label: STATUS_LABEL[d.key], value: d.value, color: STATUS_COLOR[d.key], href: ticketsUrl({ ...base, estado: d.key }) }))} /> : <Empty title="Sin datos" />}
            </Panel>
            <Panel title="Distribución de satisfacción" icon="star" delay={420}>
              {surveys.length ? <Bars data={[5, 4, 3, 2, 1].map((n) => ({ label: `${n} ★`, value: surveys.filter((x) => x.score === n).length, color: n >= 4 ? '#4ade80' : n === 3 ? '#fbbf24' : '#fb7185' }))} />
                : <Empty icon="star" title="Sin evaluaciones en el periodo" />}
            </Panel>
            <Panel title="Por prioridad" icon="flame" delay={460}>
              <Bars data={countBy(rows, (t) => t.priority, PRIORITY_ORDER)
                .map((d) => ({ label: PRIORITY_LABEL[d.key], value: d.value, color: PRIORITY_COLOR[d.key], href: ticketsUrl({ ...base, prioridad: d.key }) }))} />
            </Panel>
            <Panel title="Por categoría" icon="list" delay={500}>
              <Bars data={countBy(rows, (t) => t.category, CATEGORIES as readonly string[]).map((d) => ({ label: d.key, value: d.value, href: ticketsUrl({ ...base, categoria: d.key }) }))} />
            </Panel>
            {campus === 'todos' && (
              <Panel title="Por plantel" icon="building" className="span-2" delay={540}>
                <Bars data={countBy(rows, (t) => t.campus, CAMPUS).map((d) => ({ label: d.key, value: d.value, href: ticketsUrl({ ...base, campus: d.key }) }))} />
              </Panel>
            )}
          </div>

          <Panel title="Desempeño por agente" icon="trophy" delay={580}
            action={<Link href="/" className="link-more">Ver en el panel<Icon name="arrowRight" size={16} /></Link>}>
            {ranking.length ? <Ranking stats={ranking} base={base} /> : <Empty icon="users" title="Sin agentes registrados" />}
          </Panel>
        </>
      )}
    </div>
  );
}
