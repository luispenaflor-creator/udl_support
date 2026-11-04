'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { browserDb } from '@/lib/supabase/browser';
import { Icon } from './Icon';

export type Notice = { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

const SOUND_KEY = 'udl-sound';

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}

// Campanita de dos tonos generada con Web Audio (sin archivos). Los navegadores la permiten tras la primera interacción.
let audio: AudioContext | null = null;
function chime() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const now = audio.currentTime;
    [[880, 0], [1320, 0.12]].forEach(([freq, at]) => {
      const o = audio!.createOscillator(), g = audio!.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, now + at);
      g.gain.exponentialRampToValueAtTime(0.18, now + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.45);
      o.connect(g).connect(audio!.destination);
      o.start(now + at); o.stop(now + at + 0.5);
    });
  } catch { /* sin audio disponible */ }
}

/**
 * Avisos en tiempo real: escucha los INSERT de `notifications` del usuario (Supabase Realtime, filtrados por RLS).
 * Al llegar uno: suena, muestra una notificación emergente, la agrega a la campana y refresca la página
 * para que contadores y el ticket abierto se actualicen solos.
 */
export function NotificationCenter({ userId, initial, initialUnread }: { userId: string; initial: Notice[]; initialUnread: number }) {
  const router = useRouter();
  const [items, setItems] = useState<Notice[]>(initial);
  const [unread, setUnread] = useState(initialUnread);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<Notice[]>([]);
  const [sound, setSound] = useState(true);
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('default');
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { setSound(localStorage.getItem(SOUND_KEY) !== '0'); } catch {}
    setPerm(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
    // Desbloquea el audio con la primera interacción del usuario (política de los navegadores).
    const unlock = () => { try { audio ??= new AudioContext(); void audio.resume(); } catch {} };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  const soundRef = useRef(sound);
  soundRef.current = sound;

  useEffect(() => {
    const db = browserDb();
    let alive = true;
    let channel: ReturnType<typeof db.channel> | null = null;
    // La conexión en tiempo real debe llevar el token del usuario: sin él se une como anónimo
    // y la RLS de notifications no le entrega ningún aviso.
    void (async () => {
      const { data: { session } } = await db.auth.getSession();
      if (!alive) return;
      if (session?.access_token) await db.realtime.setAuth(session.access_token);
      if (!alive) return;
      channel = db.channel(`avisos-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload) => {
        const n = payload.new as Notice;
        setItems((prev) => [n, ...prev].slice(0, 30));
        setUnread((u) => u + 1);
        setToasts((t) => [...t, n].slice(-3));
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== n.id)), 7000);
        if (soundRef.current) chime();
        if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          const sys = new Notification(n.title, { body: n.body ?? undefined, tag: n.id, icon: '/favicon.ico' });
          sys.onclick = () => { window.focus(); if (n.link) router.push(n.link); };
        }
        router.refresh();
      })
      .subscribe((status, err) => {
        // Diagnóstico visible en la consola del navegador si la conexión en tiempo real falla (no al cerrarla a propósito).
        if (alive && status !== 'SUBSCRIBED') console.warn('[avisos] tiempo real:', status, err?.message ?? '');
      });
    })();
    // Si la sesión se renueva, el canal sigue autenticado con el token nuevo.
    const { data: { subscription } } = db.auth.onAuthStateChange((_e, session) => {
      if (session?.access_token) void db.realtime.setAuth(session.access_token);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
      if (channel) void db.removeChannel(channel);
    };
  }, [userId, router]);

  // Cierra el panel al hacer clic fuera.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!panel.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const markRead = useCallback(async (ids?: string[]) => {
    const now = new Date().toISOString();
    const db = browserDb();
    let q = db.from('notifications').update({ read_at: now }).eq('user_id', userId).is('read_at', null);
    if (ids) q = q.in('id', ids);
    await q;
    setItems((prev) => prev.map((n) => (!ids || ids.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n)));
    setUnread((u) => (ids ? Math.max(0, u - ids.length) : 0));
  }, [userId]);

  const toggleSound = () => {
    setSound((s) => { try { localStorage.setItem(SOUND_KEY, s ? '0' : '1'); } catch {} return !s; });
    if (!sound) chime();
  };
  const askPermission = async () => {
    if (typeof Notification === 'undefined') return;
    setPerm(await Notification.requestPermission());
  };

  return (
    <div className="notif" ref={panel}>
      <button type="button" className="icon-btn bell" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        aria-label={unread ? `Avisos: ${unread} sin leer` : 'Avisos'} title="Avisos">
        <Icon name="bell" size={19} />
        {unread > 0 && <span className="bell-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-panel glass" role="dialog" aria-label="Avisos">
          <header>
            <strong>Avisos</strong>
            {unread > 0 && <button type="button" className="link-btn" onClick={() => markRead()}>Marcar todo como leído</button>}
          </header>
          {items.length === 0 ? (
            <p className="muted notif-empty">Aquí aparecerán los cambios de tus tickets: mensajes, asignaciones, estados y escalaciones.</p>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.id} className={n.read_at ? '' : 'unread'}>
                  <Link href={n.link ?? '/'} onClick={() => { setOpen(false); if (!n.read_at) void markRead([n.id]); }}>
                    <strong>{n.title}</strong>
                    {n.body && <span>{n.body}</span>}
                    <small>{ago(n.created_at)}</small>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <footer>
            <button type="button" className="link-btn" onClick={toggleSound}><Icon name="bell" size={14} />{sound ? 'Sonido activado' : 'Sonido apagado'}</button>
            {perm === 'default' && <button type="button" className="link-btn" onClick={askPermission}>Avisar aunque esté en otra pestaña</button>}
            {perm === 'denied' && <small className="muted">Avisos del navegador bloqueados en la configuración del sitio</small>}
          </footer>
        </div>
      )}

      <div className="toasts" aria-live="polite">
        {toasts.map((n) => (
          <Link key={n.id} href={n.link ?? '/'} className="toast glass" onClick={() => { setToasts((t) => t.filter((x) => x.id !== n.id)); void markRead([n.id]); }}>
            <span className="toast-icon"><Icon name="bell" size={18} /></span>
            <span><strong>{n.title}</strong>{n.body && <small>{n.body}</small>}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
