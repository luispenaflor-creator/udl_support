// Conjunto de iconos lineales (24×24, trazo 1.8) para mantener un estilo coherente sin dependencias externas.
const PATHS = {
  home: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5M10 20v-5h4v5',
  ticket: 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2.5a2.5 2.5 0 0 0 0 5V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2.5a2.5 2.5 0 0 0 0-5Zm10-2v14',
  plus: 'M12 5v14M5 12h14',
  chart: 'M4 20h16M7 16V10m5 6V5m5 11v-4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10',
  inbox: 'M4 13l2.5-7h11L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5Zm0 0h4.5l1 2h5l1-2H20',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 9a6 6 0 0 1 12 0m1-9a3 3 0 1 0 0-6m2 15h3a5 5 0 0 0-4-5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2',
  alert: 'M12 9v4m0 4h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  check: 'M20 6 9 17l-5-5',
  checkCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-4-9 3 3 5-6',
  hourglass: 'M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9',
  flame: 'M12 21c4 0 7-2.7 7-6.5 0-4-3-6.5-4-9.5-1.5 2-2 3.5-2 5-1.5-1-2.5-3-2.5-5C7 7.5 5 11 5 14.5 5 18.3 8 21 12 21Z',
  arrowRight: 'M5 12h14m-6-6 6 6-6 6',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5V4.5a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V13m0-4a1.5 1.5 0 0 1 3 0v5a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3.4L3.5 13a1.5 1.5 0 0 1 2.5-1.6L8 14',
  building: 'M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16m0-10h2a2 2 0 0 1 2 2v8M8 7h4m-4 4h4m-4 4h4M2 21h20',
  mail: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm-1 1 9 7 9-7',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2Zm4 4h4',
  cloud: 'M7 18a4 4 0 0 1-.8-7.9A6 6 0 0 1 17.7 9 4.5 4.5 0 0 1 17.5 18H7Z',
  shield: 'M12 3 5 6v6c0 4.5 3 7.8 7 9 4-1.2 7-4.5 7-9V6l-7-3Z',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  timer: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-12v4M9 2h6',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm7 12 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z',
  filter: 'M3 5h18l-7 8v6l-4 2v-8L3 5Z',
  pause: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2-12v6m4-6v6',
  circle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  play: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2-12.5 6 3.5-6 3.5v-7Z',
  lock: 'M6 11h12v10H6V11Zm2 0V7a4 4 0 0 1 8 0v4',
  chevUp: 'M6 15l6-6 6 6',
  chevDown: 'M6 9l6 6 6-6',
  minus: 'M5 12h14',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0V4Zm0 2H5a3 3 0 0 0 3 4m8-4h3a3 3 0 0 1-3 4m-4 3v4m-4 4h8m-6 0 .5-4h3l.5 4',
  briefcase: 'M4 8h16v11H4V8Zm5 0V5h6v3M4 13h16',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4-4',
  x: 'M6 6l12 12M18 6 6 18',
  message: 'M5 5h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 3V6a1 1 0 0 1 1-1Z',
  download: 'M12 4v11m-5-5 5 5 5-5M5 20h14',
  userPlus: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 9a6 6 0 0 1 12 0m4-11v6m-3-3h6',
  edit: 'M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l3 2',
  key: 'M14 10a4 4 0 1 0-4 4l-6 6v-3h3v-3h3l1-1M15 7h.01',
  zap: 'M13 3 5 14h6l-1 7 8-11h-6l1-7Z',
  panelLeft: 'M4 4h16v16H4V4Zm5 0v16',
  pin: 'M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Zm0-9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  eyeOff: 'M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A9.8 9.8 0 0 1 12 5c5 0 8.5 4.5 9.5 7-.4 1-1.2 2.3-2.3 3.5M6.6 6.6C4.7 7.9 3.2 10 2.5 12c1 2.5 4.5 7 9.5 7 1.7 0 3.2-.5 4.5-1.2',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
