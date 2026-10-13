// Dev helper: runs BuildCraft on a test profile and saves screenshots.
// Usage: electron scripts/shot.cjs <profileDir> <outDir> [steps.json]
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
process.on('uncaughtException', (err) => {
  console.error('shot error:', err.message);
  process.exit(1);
});
const profile = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
const steps = process.argv[4] && fs.existsSync(process.argv[4]) ? JSON.parse(fs.readFileSync(process.argv[4], 'utf8')) : [];
fs.mkdirSync(out, { recursive: true });
app.setPath('userData', path.join(profile, 'profile'));
const settingsFile = path.join(profile, 'profile', 'settings.json');
let s = {};
try { s = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch {}
fs.writeFileSync(settingsFile, JSON.stringify({ ...s, serversRoot: path.join(profile, 'servers'), bounds: { width: 1400, height: 880 }, maximized: false, theme: s.theme || 'dark' }));
require('../app/main.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.on('browser-window-created', (_e, win) => {
  if (BrowserWindow.getAllWindows().length > 1) return;
  win.webContents.on('console-message', (e) => console.log('[page]', e.message || e));
  win.webContents.once('did-finish-load', async () => {
    await wait(1500);
    for (const st of steps) {
      if (st.js) {
        try {
          const r = await win.webContents.executeJavaScript(st.js);
          if (r !== undefined && r !== 1) console.log('js>', JSON.stringify(r).slice(0, 1500));
        } catch (err) { console.log('js error', err.message); }
      }
      if (st.type) win.webContents.insertText(st.type);
      if (st.key) for (const t of ['keyDown', 'char', 'keyUp']) win.webContents.sendInputEvent({ type: t, keyCode: st.key });
      await wait(st.wait || 400);
      if (st.shot) fs.writeFileSync(path.join(out, st.shot + '.png'), (await win.webContents.capturePage()).toPNG());
    }
    app.quit();
  });
});
