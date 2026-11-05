'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icon';

export const THEME_KEY = 'udl-theme';

// Cambia entre tema oscuro y claro. La preferencia se guarda en este navegador;
// el script del <head> la aplica antes de pintar para evitar parpadeos.
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [light, setLight] = useState(false);
  useEffect(() => { setLight(document.documentElement.dataset.theme === 'light'); }, []);

  const toggle = () => {
    const next = light ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch {}
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#f7f5fb' : '#15131d');
    setLight(!light);
  };

  const label = light ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro';
  return (
    <button type="button" className={`icon-btn theme-btn ${className}`} onClick={toggle} aria-label={label} title={label} aria-pressed={light}>
      <Icon name="moon" size={18} className="moon" /><Icon name="sun" size={18} className="sun" />
    </button>
  );
}
