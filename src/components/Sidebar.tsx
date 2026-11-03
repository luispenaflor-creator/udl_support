'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon, type IconName } from './Icon';

export type NavItem = { href: string; label: string; icon: IconName; badge?: number; tone?: 'rose' | 'amber' | 'teal' };
export type NavGroup = { title: string; items: NavItem[] };

const KEY = 'udl-side-collapsed';

// Elige el enlace activo: misma ruta y todos sus parámetros presentes; gana el más específico.
function activeHref(groups: NavGroup[], path: string, params: URLSearchParams): string | null {
  let best: { href: string; score: number } | null = null;
  for (const item of groups.flatMap((g) => g.items)) {
    if (item.href.includes('#')) continue;
    const url = new URL(item.href, 'http://x');
    const samePath = url.pathname === path
      || (url.pathname === '/tickets' && path.startsWith('/tickets/') && path !== '/tickets/nuevo' && url.search === '')
      || (url.pathname !== '/' && url.pathname !== '/tickets' && path.startsWith(url.pathname + '/'));
    if (!samePath) continue;
    const keys = [...url.searchParams.keys()];
    if (!keys.every((k) => params.get(k) === url.searchParams.get(k))) continue;
    // La lista sin parámetros solo queda activa si la URL tampoco tiene filtros de los accesos rápidos.
    if (!keys.length && path === '/tickets' && ['asignado', 'sla', 'abiertos', 'estado'].some((k) => params.has(k))) continue;
    if (!best || keys.length > best.score) best = { href: item.href, score: keys.length };
  }
  return best?.href ?? null;
}

export function Sidebar({ groups, user, roleLabel }: {
  groups: NavGroup[];
  user: { name: string; detail: string; avatar: React.ReactNode };
  roleLabel: string;
}) {
  const path = usePathname();
  const params = useSearchParams();
  const active = activeHref(groups, path, new URLSearchParams(params.toString()));
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(KEY) === '1'); } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.dataset.side = collapsed ? 'collapsed' : 'open';
    try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch {}
  }, [collapsed]);

  return (
    <aside className="side glass" aria-label="Menú principal">
      <div className="side-top">
        <Link href="/" className="brand"><span className="brand-mark" aria-hidden="true">U</span><span className="brand-text">UDL <span>Support</span></span></Link>
        <button type="button" className="icon-btn collapse-btn" onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'} aria-pressed={collapsed} title={collapsed ? 'Expandir menú' : 'Contraer menú'}>
          <Icon name="panelLeft" size={18} />
        </button>
      </div>

      <form action="/tickets" className="side-search" role="search">
        <Icon name="search" size={16} />
        <label className="sr-only" htmlFor="side-q">Buscar tickets</label>
        <input id="side-q" name="q" placeholder="Buscar folio o asunto" autoComplete="off" />
      </form>

      <nav className="nav" aria-label="Secciones">
        {groups.map((g) => (
          <div key={g.title} className="nav-group">
            <span className="nav-title">{g.title}</span>
            {g.items.map((item) => {
              const on = item.href === active;
              return (
                <Link key={item.href} href={item.href} className={'nav-link' + (on ? ' active' : '')} aria-current={on ? 'page' : undefined} title={item.label}>
                  <Icon name={item.icon} />
                  <span className="nav-label">{item.label}</span>
                  {item.badge ? <span className={`nav-badge tone-${item.tone ?? 'teal'}`} aria-label={`${item.badge} pendientes`}>{item.badge > 99 ? '99+' : item.badge}</span> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="side-user">
        {user.avatar}
        <div className="side-user-text"><strong>{user.name}</strong><small>{user.detail}</small><span className="role-tag">{roleLabel}</span></div>
        <form action="/auth/signout" method="post">
          <button className="icon-btn" aria-label="Cerrar sesión" title="Cerrar sesión"><Icon name="logout" size={18} /></button>
        </form>
      </div>
    </aside>
  );
}
