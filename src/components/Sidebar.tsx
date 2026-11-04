'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { NotificationCenter, type Notice } from './NotificationCenter';

// `hint` explica la opción en palabras simples (se muestra en el menú del celular y como ayuda al pasar el cursor).
export type NavItem = { href: string; label: string; icon: IconName; hint?: string; badge?: number; tone?: 'rose' | 'amber' | 'teal' };
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

export function Sidebar({ groups, user, roleLabel, notices }: {
  groups: NavGroup[];
  user: { id: string; name: string; detail: string; avatar: React.ReactNode };
  roleLabel: string;
  notices: { items: Notice[]; unread: number };
}) {
  const path = usePathname();
  const params = useSearchParams();
  const active = activeHref(groups, path, new URLSearchParams(params.toString()));
  const activeItem = groups.flatMap((g) => g.items).find((i) => i.href === active);
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(KEY) === '1'); } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.dataset.side = collapsed ? 'collapsed' : 'open';
    try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch {}
  }, [collapsed]);
  // En celular: el menú se cierra al cambiar de página y bloquea el desplazamiento del fondo mientras está abierto.
  useEffect(() => { setDrawer(false); }, [path, params]);
  useEffect(() => {
    document.documentElement.classList.toggle('drawer-open', drawer);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [drawer]);

  // Una sola campana (una suscripción en tiempo real): va en la barra superior en celular y en el menú en escritorio.
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1000px)');
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  const bell = <NotificationCenter userId={user.id} initial={notices.items} initialUnread={notices.unread} />;

  return (
    <>
      {/* Barra superior en celular y tableta */}
      <header className="mobile-bar glass">
        <button type="button" className="menu-btn" onClick={() => setDrawer(true)} aria-expanded={drawer} aria-controls="menu-principal">
          <Icon name="list" size={20} /><span>Menú</span>
        </button>
        <span className="mobile-title">{activeItem?.label ?? 'UDL Support'}</span>
        {mobile && bell}
        <Link href="/ayuda" className="icon-btn" aria-label="Ayuda" title="Ayuda"><Icon name="sparkle" size={18} /></Link>
      </header>
      <div className={`drawer-scrim${drawer ? ' show' : ''}`} onClick={() => setDrawer(false)} aria-hidden="true" />

      <aside id="menu-principal" className={`side glass${drawer ? ' open' : ''}`} aria-label="Menú principal">
        <div className="side-top">
          <Link href="/" className="brand"><span className="brand-mark" aria-hidden="true">U</span><span className="brand-text">UDL <span>Support</span></span></Link>
          <button type="button" className="icon-btn collapse-btn" onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'} aria-pressed={collapsed} title={collapsed ? 'Expandir menú' : 'Contraer menú'}>
            <Icon name="panelLeft" size={18} />
          </button>
          <button type="button" className="icon-btn close-drawer" onClick={() => setDrawer(false)} aria-label="Cerrar menú"><Icon name="x" size={18} /></button>
        </div>

        <div className="side-tools">
          <form action="/tickets" className="side-search" role="search">
            <Icon name="search" size={16} />
            <label className="sr-only" htmlFor="side-q">Buscar tickets</label>
            <input id="side-q" name="q" placeholder="Buscar por folio o asunto" autoComplete="off" />
          </form>
          {!mobile && <span className="side-bell">{bell}</span>}
        </div>

        <nav className="nav" aria-label="Secciones">
          {groups.map((g) => (
            <div key={g.title} className="nav-group">
              <span className="nav-title">{g.title}</span>
              {g.items.map((item) => {
                const on = item.href === active;
                return (
                  <Link key={item.href} href={item.href} className={'nav-link' + (on ? ' active' : '')} aria-current={on ? 'page' : undefined}
                    title={item.hint ? `${item.label}: ${item.hint}` : item.label}>
                    <Icon name={item.icon} />
                    <span className="nav-text">
                      <span className="nav-label">{item.label}</span>
                      {item.hint && <span className="nav-hint">{item.hint}</span>}
                    </span>
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
            <button className="icon-btn logout" aria-label="Cerrar sesión" title="Cerrar sesión"><Icon name="logout" size={18} /><span className="logout-text">Salir</span></button>
          </form>
        </div>
      </aside>
    </>
  );
}
