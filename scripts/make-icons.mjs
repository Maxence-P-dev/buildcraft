// App icon: the BuildCraft block on a dark rounded tile (PNG + multi-size ICO).
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { mkdir, writeFile } from 'node:fs/promises';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 64 64">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c2430"/><stop offset="1" stop-color="#0b0f14"/></linearGradient>
  <radialGradient id="glow" cx=".5" cy=".42" r=".55"><stop offset="0" stop-color="#34d17a" stop-opacity=".32"/><stop offset="1" stop-color="#34d17a" stop-opacity="0"/></radialGradient>
  <linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6ff0a6"/><stop offset="1" stop-color="#2fbf6f"/></linearGradient>
  <linearGradient id="l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f8f53"/><stop offset="1" stop-color="#146b3d"/></linearGradient>
  <linearGradient id="r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#18744a"/><stop offset="1" stop-color="#0e4f2f"/></linearGradient>
</defs>
<rect x="2" y="2" width="60" height="60" rx="14" fill="url(#bg)"/>
<rect x="2" y="2" width="60" height="60" rx="14" fill="url(#glow)"/>
<rect x="2.5" y="2.5" width="59" height="59" rx="13.5" fill="none" stroke="#ffffff" stroke-opacity=".07"/>
<g transform="translate(10 10) scale(.6875)">
  <path d="M32 6 56 19 32 32 8 19Z" fill="url(#t)"/>
  <path d="M8 19 32 32v26L8 45Z" fill="url(#l)"/>
  <path d="M56 19 32 32v26l24-13Z" fill="url(#r)"/>
  <path d="M20 25.5 32 32M32 32l12-6.5M32 32v13" stroke="#0b3d24" stroke-opacity=".35" stroke-width="1.4"/>
  <path d="M47 4.5l1.6 4.1 4.1 1.6-4.1 1.6L47 16l-1.6-4.2-4.1-1.6 4.1-1.6Z" fill="#7de3ff"/>
</g>
</svg>`;

await mkdir('build', { recursive: true });
const buf = Buffer.from(svg);
await sharp(buf).resize(512, 512).png().toFile('build/icon.png');
await sharp(buf).resize(256, 256).png().toFile('app/icon.png');
await writeFile('build/icon.ico', await pngToIco(await Promise.all([16, 24, 32, 48, 64, 128, 256].map((s) => sharp(buf).resize(s, s).png().toBuffer()))));
console.log('icons ok');
