'use strict';

const { app, BrowserWindow, ipcMain, shell, nativeTheme, Menu, safeStorage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const paths = require('./core/paths');
const servers = require('./core/servers');
const builder = require('./core/builder');
const knowledge = require('./core/knowledge');
const agent = require('./core/agent');
const localAi = require('./core/local-ai');
const runtimes = require('./core/runtimes');
const updater = require('./core/updater');
const { SOFTWARE, latest } = require('./core/software');

const CHROME = { dark: { color: '#0d1014', symbolColor: '#c9d1d9' }, light: { color: '#f4f6f3', symbolColor: '#2b2f33' } };
const KEY_FILE = path.join(paths.user, 'claude.json');

let win = null;

/* ------------------------------------------------------------ settings */

function defaults() {
  return { theme: 'dark', provider: 'claude', serversRoot: paths.defaultServers, lastServer: null, bounds: { width: 1380, height: 880 }, maximized: false };
}

let settings = (() => {
  try {
    return { ...defaults(), ...JSON.parse(fs.readFileSync(paths.settings, 'utf8')) };
  } catch {
    return defaults();
  }
})();

function saveSettings() {
  fs.mkdirSync(path.dirname(paths.settings), { recursive: true });
  fs.writeFileSync(paths.settings, JSON.stringify(settings, null, 2));
}

const effectiveTheme = () => (settings.theme === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : settings.theme);

function paintChrome() {
  try {
    win?.setTitleBarOverlay({ ...CHROME[effectiveTheme()], height: 46 });
  } catch {}
}

/* ----------------------------------------------------------- claude key */

function readKey() {
  try {
    const buf = Buffer.from(JSON.parse(fs.readFileSync(KEY_FILE, 'utf8')).key, 'base64');
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
  } catch {
    return null;
  }
}

function writeKey(key) {
  const buf = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(key) : Buffer.from(key, 'utf8');
  fs.writeFileSync(KEY_FILE, JSON.stringify({ key: buf.toString('base64') }));
}

/* ------------------------------------------------------------------ ipc */

// Every handler answers { ok, value } or { ok: false, error } so the UI can show the message.
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, value: await fn(...args) };
    } catch (err) {
      console.error(`[${channel}]`, err);
      return { ok: false, error: err?.message || String(err) };
    }
  });
}

const send = (channel, ...args) => win && !win.isDestroyed() && win.webContents.send(channel, ...args);
const server = (id) => {
  const s = servers.get(id);
  if (!s) throw new Error('Serveur introuvable.');
  return s;
};

handle('app:info', () => ({
  version: require('../package.json').version,
  platform: process.platform,
  ram: Math.round(os.totalmem() / 1024 / 1024),
  lan: Object.values(os.networkInterfaces()).flat().find((n) => n && n.family === 'IPv4' && !n.internal)?.address || null,
  settings: { ...settings, effectiveTheme: effectiveTheme() },
  software: Object.values(SOFTWARE).map(({ id, name, language, maintained, blurb, api }) => ({ id, name, language, maintained, blurb, api })),
  runtimes: { java: !!runtimes.exe('java'), php: !!runtimes.exe('php') },
  claudeKey: !!readKey(),
  model: agent.MODEL,
}));

handle('app:settings', (patch) => {
  for (const k of ['theme', 'provider', 'lastServer']) if (k in patch) settings[k] = patch[k];
  saveSettings();
  if ('theme' in patch) {
    nativeTheme.themeSource = settings.theme;
    paintChrome();
  }
  return { ...settings, effectiveTheme: effectiveTheme() };
});

handle('app:chooseRoot', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Dossier des serveurs', defaultPath: settings.serversRoot, properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  await servers.stopAll();
  settings.serversRoot = r.filePaths[0];
  saveSettings();
  servers.setRoot(settings.serversRoot);
  return settings.serversRoot;
});

handle('app:open', (target) => {
  if (/^https?:\/\//.test(target)) return shell.openExternal(target);
  return shell.openPath(target);
});

handle('key:set', async (key) => {
  key = String(key || '').trim();
  if (!/^sk-ant-/.test(key)) throw new Error('Une clé API Claude commence par « sk-ant- ».');
  try {
    await agent.checkKey(key);
  } catch (err) {
    throw new Error(agent.friendly(err));
  }
  writeKey(key);
  return true;
});
handle('key:clear', () => fs.rmSync(KEY_FILE, { force: true }));

handle('software:latest', async (id) => latest(id));

handle('servers:list', () => servers.list());
handle('servers:create', (opts) => servers.create(opts));
handle('servers:update', (id, patch) => servers.update(id, patch));
handle('servers:remove', (id) => servers.remove(id, (dir) => shell.trashItem(dir)));
handle('servers:start', (id) => servers.start(id));
handle('servers:stop', (id) => servers.stop(id));
handle('servers:restart', (id) => servers.restart(id));
handle('servers:command', (id, text) => servers.command(id, text));
handle('servers:log', (id) => servers.logOf(id));
handle('servers:plugins', (id) => servers.plugins(id));
handle('servers:reveal', (id, sub) => shell.openPath(sub ? path.join(server(id).dir, sub) : server(id).dir));
handle('servers:uninstall', (id, file, withProject) => builder.uninstall(server(id), file, withProject));

handle('projects:list', (id) => builder.listProjects(server(id)));
handle('projects:read', (id, name, rel) => builder.readFile(server(id), name, rel));
handle('projects:write', (id, name, rel, content) => builder.writeFile(server(id), name, rel, content));
handle('projects:create', (id, name, description) => builder.scaffold(server(id), name, description));
handle('projects:build', (id, name) => builder.build(server(id), name));

handle('assistant:ask', (id, text) => {
  const s = server(id);
  const emit = (e) => send('assistant:event', id, e);
  if (settings.provider === 'local') {
    localAi.ask(s, text, emit);
  } else {
    const key = readKey();
    if (!key) throw new Error('Ajoute ta clé API Claude dans les Paramètres, ou choisis l’IA locale.');
    agent.ask(s, text, key, emit);
  }
  return true;
});
handle('assistant:cancel', (id) => (agent.cancel(id), localAi.cancel(id)));
handle('assistant:history', (id) => agent.history(server(id)));
handle('assistant:busy', (id) => agent.busy(id) || localAi.busy(id));
handle('assistant:reset', (id) => agent.reset(server(id)));

handle('knowledge:summary', () => knowledge.summary());
handle('knowledge:addUrl', (url, software) => knowledge.addUrl(url, software));
handle('knowledge:addText', (title, text, software) => knowledge.addText(title, text, software));
handle('knowledge:addLesson', (text, software) => knowledge.remember(text, software, 'utilisateur'));
handle('knowledge:editLesson', (id, text) => knowledge.editLesson(id, text));
handle('knowledge:removeLesson', (id) => knowledge.removeLesson(id));
handle('knowledge:removeDoc', (id) => knowledge.removeDoc(id));
handle('knowledge:search', (q, software) => knowledge.search(q, software, 10));

handle('local:status', () => localAi.status());
handle('local:install', (id) => localAi.installModel(id));
handle('local:cancelInstall', () => localAi.cancelInstall());
handle('local:use', (id) => localAi.useModel(id));
handle('local:remove', (id) => localAi.removeModel(id));

handle('update:get', () => updater.get());
handle('update:check', () => updater.check());
handle('update:download', () => updater.download());
handle('update:install', () => updater.install(() => servers.stopAll()));
handle('update:notes', () => updater.notes());

/* -------------------------------------------------------- push events */

const logBuffers = new Map();
let logTimer = null;

servers.events.on('log', (id, lines) => {
  if (!logBuffers.has(id)) logBuffers.set(id, []);
  logBuffers.get(id).push(...lines);
  logTimer =
    logTimer ||
    setTimeout(() => {
      logTimer = null;
      for (const [sid, buf] of logBuffers) send('servers:log', sid, buf.splice(0));
    }, 80);
});
servers.events.on('status', (s) => send('servers:status', s));
servers.events.on('progress', (id, p) => send('servers:progress', id, p));
localAi.onStatus((st) => send('local:status', st));

/* ---------------------------------------------------------------- window */

function createWindow() {
  const b = settings.bounds || {};
  win = new BrowserWindow({
    width: b.width || 1380,
    height: b.height || 880,
    x: b.x,
    y: b.y,
    minWidth: 980,
    minHeight: 620,
    show: false,
    title: 'BuildCraft',
    backgroundColor: CHROME[effectiveTheme()].color,
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...CHROME[effectiveTheme()], height: 46 },
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  if (settings.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
  const remember = () => {
    if (!win || win.isDestroyed()) return;
    settings.maximized = win.isMaximized();
    if (!win.isMaximized() && !win.isMinimized()) settings.bounds = win.getBounds();
  };
  win.on('resize', remember);
  win.on('move', remember);
  win.on('close', () => (remember(), saveSettings()));
  win.on('closed', () => (win = null));
  win.loadFile(path.join(__dirname, 'index.html'));
}

nativeTheme.themeSource = settings.theme;
nativeTheme.on('updated', () => {
  paintChrome();
  send('app:systemTheme', effectiveTheme());
});

let quitting = false;
app.on('before-quit', (e) => {
  if (quitting) return;
  e.preventDefault();
  quitting = true;
  servers.stopAll().finally(() => app.quit());
});

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (win?.isMinimized()) win.restore();
    win?.focus();
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    servers.setRoot(settings.serversRoot);
    createWindow();
    updater.setup((st) => send('update:status', st));
  });
  app.on('window-all-closed', () => app.quit());
}
