// Line icons on a 24×24 grid (stroke based).
const P = (...d) => d.map((x) => `<path d="${x}"/>`).join('');

const ICONS = {
  server: '<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/>' + P('M6 6h.01', 'M6 18h.01'),
  cube: P('M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', 'm3.3 7 8.7 5 8.7-5', 'M12 22V12'),
  plus: P('M5 12h14', 'M12 5v14'),
  play: P('M6 3l14 9-14 9V3z'),
  stop: '<rect width="14" height="14" x="5" y="5" rx="2"/>',
  restart: P('M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'),
  terminal: P('m4 17 6-6-6-6', 'M12 19h8'),
  plug: P('M12 22v-5', 'M9 8V2', 'M15 8V2', 'M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z'),
  code: P('m16 18 6-6-6-6', 'm8 6-6 6 6 6'),
  sparkle: P('M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z'),
  brain: P('M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z', 'M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z', 'M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4', 'M12 18v-5'),
  book: P('M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20'),
  gear: P('M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z') + '<circle cx="12" cy="12" r="3"/>',
  sliders: P('M21 4h-7', 'M10 4H3', 'M21 12h-9', 'M8 12H3', 'M21 20h-5', 'M12 20H3', 'M14 2v4', 'M8 10v4', 'M16 18v4'),
  users: P('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75') + '<circle cx="9" cy="7" r="4"/>',
  clock: '<circle cx="12" cy="12" r="10"/>' + P('M12 6v6l4 2'),
  folder: P('M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'),
  file: P('M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4'),
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/>' + P('M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'),
  check: P('M20 6 9 17l-5-5'),
  checkCircle: P('M21.801 10A10 10 0 1 1 17 3.335', 'm9 11 3 3L22 4'),
  x: P('M18 6 6 18', 'm6 6 12 12'),
  trash: P('M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'),
  warn: P('m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'),
  error: '<circle cx="12" cy="12" r="10"/>' + P('m15 9-6 6', 'm9 9 6 6'),
  info: '<circle cx="12" cy="12" r="10"/>' + P('M12 16v-4', 'M12 8h.01'),
  build: P('m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9', 'm18 15 4-4', 'm21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5'),
  web: '<circle cx="12" cy="12" r="10"/>' + P('M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20', 'M2 12h20'),
  api: P('M16 3h5v5', 'M8 3H3v5', 'M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3', 'm15 9 6-6'),
  settings: P('M20 7h-9', 'M14 17H5') + '<circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  send: P('M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z', 'm21.854 2.147-10.94 10.939'),
  sun: '<circle cx="12" cy="12" r="4"/>' + P('M12 2v2', 'M12 20v2', 'm4.93 4.93 1.41 1.41', 'm17.66 17.66 1.41 1.41', 'M2 12h2', 'M20 12h2', 'm6.34 17.66-1.41 1.41', 'm19.07 4.93-1.41 1.41'),
  moon: P('M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'),
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/>' + P('M8 21h8', 'M12 17v4'),
  download: P('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3'),
  external: P('M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'),
  key: P('m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4', 'm21 2-9.6 9.6') + '<circle cx="7.5" cy="15.5" r="5.5"/>',
  cpu: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/>' + P('M15 2v2', 'M15 20v2', 'M2 15h2', 'M2 9h2', 'M20 15h2', 'M20 9h2', 'M9 2v2', 'M9 20v2'),
  chevron: P('m9 18 6-6-6-6'),
  chevronDown: P('m6 9 6 6 6-6'),
  search: '<circle cx="11" cy="11" r="8"/>' + P('m21 21-4.3-4.3'),
  pencil: P('M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z'),
  save: P('M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7', 'M7 3v4a1 1 0 0 0 1 1h7'),
  bot: P('M12 8V4H8', 'M2 14h2', 'M20 14h2', 'M15 13v2', 'M9 13v2') + '<rect width="16" height="12" x="4" y="8" rx="2"/>',
  zap: P('M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z'),
  globe: '<circle cx="12" cy="12" r="10"/>' + P('M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20', 'M2 12h20'),
};
ICONS.plugin = ICONS.plug;
ICONS.restartIcon = ICONS.restart;

export function icon(name, size = 18, cls = '') {
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.info}</svg>`;
}

// Isometric block: emerald top, two shaded sides, a spark for the AI.
export const LOGO = `<svg class="logo" viewBox="0 0 64 64" aria-hidden="true">
<defs>
  <linearGradient id="lgTop" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6ff0a6"/><stop offset="1" stop-color="#2fbf6f"/></linearGradient>
  <linearGradient id="lgL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f8f53"/><stop offset="1" stop-color="#146b3d"/></linearGradient>
  <linearGradient id="lgR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#18744a"/><stop offset="1" stop-color="#0e4f2f"/></linearGradient>
</defs>
<path d="M32 6 56 19 32 32 8 19Z" fill="url(#lgTop)"/>
<path d="M8 19 32 32v26L8 45Z" fill="url(#lgL)"/>
<path d="M56 19 32 32v26l24-13Z" fill="url(#lgR)"/>
<path d="M20 25.5 32 32M32 32l12-6.5M32 32v13" stroke="#0b3d24" stroke-opacity=".35" stroke-width="1.4"/>
<path d="M47 4.5l1.6 4.1 4.1 1.6-4.1 1.6L47 16l-1.6-4.2-4.1-1.6 4.1-1.6Z" fill="#7de3ff"/>
</svg>`;
