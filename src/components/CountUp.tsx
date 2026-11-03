'use client';

import { useEffect, useState } from 'react';

// Anima un indicador desde 0 hasta su valor. El valor final se renderiza en servidor,
// así que sin JavaScript o con movimiento reducido se ve el número correcto de inmediato.
export function CountUp({ value, suffix = '', duration = 900 }: { value: number; suffix?: string; duration?: number }) {
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || value === 0) {
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(value * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    setShown(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <>{shown.toLocaleString('es-MX')}{suffix}</>;
}
