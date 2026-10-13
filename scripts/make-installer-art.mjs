// Generates the branded installer artwork (NSIS needs 24-bit BMP files).
import sharp from 'sharp';
import { writeFile, mkdir } from 'node:fs/promises';

const BLOCK = (x, y, s) => `
<g transform="translate(${x} ${y}) scale(${s / 64})">
  <path d="M32 6 56 19 32 32 8 19Z" fill="url(#t)"/>
  <path d="M8 19 32 32v26L8 45Z" fill="url(#l)"/>
  <path d="M56 19 32 32v26l24-13Z" fill="url(#r)"/>
  <path d="M20 25.5 32 32M32 32l12-6.5M32 32v13" stroke="#0b3d24" stroke-opacity=".35" stroke-width="1.4"/>
  <path d="M47 4.5l1.6 4.1 4.1 1.6-4.1 1.6L47 16l-1.6-4.2-4.1-1.6 4.1-1.6Z" fill="#7de3ff"/>
</g>`;

const DEFS = `
<linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6ff0a6"/><stop offset="1" stop-color="#2fbf6f"/></linearGradient>
<linearGradient id="l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f8f53"/><stop offset="1" stop-color="#146b3d"/></linearGradient>
<linearGradient id="r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#18744a"/><stop offset="1" stop-color="#0e4f2f"/></linearGradient>
<linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="#1a212b"/><stop offset="1" stop-color="#0b0f14"/></linearGradient>
<radialGradient id="glow" cx="0.5" cy="0.3" r="0.6"><stop offset="0" stop-color="#34d17a" stop-opacity=".30"/><stop offset="1" stop-color="#34d17a" stop-opacity="0"/></radialGradient>
<pattern id="grid" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M8 0H0V8" fill="none" stroke="#ffffff" stroke-opacity=".05" stroke-width=".5"/></pattern>`;

const FONT = `font-family="Segoe UI, Arial, sans-serif"`;

// Welcome / finish pages: 164×314, drawn at 2× then downscaled for crisp edges.
const sidebar = `<svg xmlns="http://www.w3.org/2000/svg" width="328" height="628" viewBox="0 0 164 314">
<defs>${DEFS}</defs>
<rect width="164" height="314" fill="url(#bg)"/>
<rect width="164" height="314" fill="url(#grid)"/>
<rect width="164" height="314" fill="url(#glow)"/>
${BLOCK(42, 52, 80)}
<text x="82" y="162" text-anchor="middle" ${FONT} font-size="22" font-weight="700" fill="#ffffff">BuildCraft</text>
<text x="82" y="180" text-anchor="middle" ${FONT} font-size="10" fill="#9aa6b2">L’IA qui code tes plugins</text>
<rect x="38" y="200" width="88" height="2" rx="1" fill="#34d17a" opacity=".7"/>
<text x="82" y="296" text-anchor="middle" ${FONT} font-size="8.5" fill="#9aa6b2" opacity=".8">Minecraft Bedrock · Windows</text>
</svg>`;

// Header of the inner pages: 150×57.
const header = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="114" viewBox="0 0 150 57">
<defs>${DEFS}</defs>
<rect width="150" height="57" fill="#ffffff"/>
${BLOCK(108, 10, 36)}
<text x="104" y="34" text-anchor="end" ${FONT} font-size="15" font-weight="700" fill="#0d1014">BuildCraft</text>
</svg>`;

function bmp24({ data, info }) {
  const { width, height, channels } = info;
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const size = 54 + rowSize * height;
  const b = Buffer.alloc(size);
  b.write('BM', 0);
  b.writeUInt32LE(size, 2);
  b.writeUInt32LE(54, 10);
  b.writeUInt32LE(40, 14);
  b.writeInt32LE(width, 18);
  b.writeInt32LE(height, 22);
  b.writeUInt16LE(1, 26);
  b.writeUInt16LE(24, 28);
  b.writeUInt32LE(rowSize * height, 34);
  b.writeInt32LE(2835, 38);
  b.writeInt32LE(2835, 42);
  for (let y = 0; y < height; y++) {
    const row = 54 + (height - 1 - y) * rowSize; // bottom-up
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      b[row + x * 3] = data[i + 2];
      b[row + x * 3 + 1] = data[i + 1];
      b[row + x * 3 + 2] = data[i];
    }
  }
  return b;
}

const render = (svg, w, h) => sharp(Buffer.from(svg)).resize(w, h, { kernel: 'lanczos3' }).flatten({ background: '#ffffff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });

await mkdir('build', { recursive: true });
await writeFile('build/installerSidebar.bmp', bmp24(await render(sidebar, 164, 314)));
await writeFile('build/installerHeader.bmp', bmp24(await render(header, 150, 57)));
console.log('installer art ok');
