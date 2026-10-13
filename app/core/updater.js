'use strict';

// Automatic updates: the installed app reads update/latest.yml from the repository,
// the portable build only compares its version with the latest GitHub release.

const { app, shell, net } = require('electron');
const fs = require('fs');
const path = require('path');

const REPO = 'Maxence-P-dev/buildcraft';
const RELEASES_URL = `https://github.com/${REPO}/releases`;
const DEV_UPDATE_CONFIG = path.join(__dirname, '..', '..', 'dev-app-update.yml');
const CHECK_EVERY = 4 * 60 * 60 * 1000;

let updater = null;
let send = () => {};
let state = { state: 'idle', current: app.getVersion(), canInstall: false };

function set(patch) {
  state = { ...state, ...patch };
  send(state);
}

// The NSIS installer leaves an uninstaller next to the exe; the portable zip does not.
function isInstalled() {
  try {
    return fs.readdirSync(path.dirname(process.execPath)).some((f) => /^Uninstall .*\.exe$/i.test(f));
  } catch {
    return false;
  }
}

function friendly(err) {
  const msg = String(err?.message || err);
  if (/ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN|net::|network/i.test(msg)) return 'Pas de connexion Internet.';
  if (/404|latest\.yml/i.test(msg)) return 'Aucune information de mise à jour trouvée.';
  return 'La vérification a échoué. Réessaie plus tard.';
}

const newer = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};

async function checkLatestRelease() {
  set({ state: 'checking', error: null });
  try {
    const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { tag_name: tag, published_at: date } = await res.json();
    const version = String(tag).replace(/^v/, '');
    if (newer(version, app.getVersion())) set({ state: 'available', version, date });
    else set({ state: 'latest', checkedAt: Date.now() });
  } catch (err) {
    set({ state: 'error', error: friendly(err) });
  }
  return state;
}

async function check() {
  if (['checking', 'downloading', 'ready', 'unsupported'].includes(state.state)) return state;
  if (!state.canInstall) return checkLatestRelease();
  if (!updater) return state;
  try {
    await updater.checkForUpdates();
  } catch (err) {
    set({ state: 'error', error: friendly(err) });
  }
  return state;
}

function setup(onStatus) {
  send = onStatus;
  const dev = !app.isPackaged;
  if (dev && !fs.existsSync(DEV_UPDATE_CONFIG)) return set({ state: 'unsupported' });
  state.canInstall = dev || isInstalled();
  setTimeout(check, 5000);
  setInterval(check, CHECK_EVERY);
  if (!state.canInstall) return;
  ({ autoUpdater: updater } = require('electron-updater'));
  if (dev) {
    updater.forceDevUpdateConfig = true;
    updater.updateConfigPath = DEV_UPDATE_CONFIG;
  }
  updater.logger = null;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;
  updater.on('checking-for-update', () => set({ state: 'checking', error: null }));
  updater.on('update-available', (info) => set({ state: 'available', version: info.version, date: info.releaseDate }));
  updater.on('update-not-available', () => set({ state: 'latest', checkedAt: Date.now() }));
  updater.on('download-progress', (p) => set({ state: 'downloading', percent: Math.round(p.percent) }));
  updater.on('update-downloaded', (info) => set({ state: 'ready', version: info.version }));
  updater.on('error', (err) => set({ state: state.state === 'downloading' ? 'available' : 'error', error: friendly(err) }));
}

function download() {
  if (state.state !== 'available') return state;
  if (!state.canInstall || !updater) {
    shell.openExternal(`${RELEASES_URL}/latest`);
    return state;
  }
  set({ state: 'downloading', percent: 0, error: null });
  updater.downloadUpdate().catch((err) => set({ state: 'available', error: friendly(err) }));
  return state;
}

function install(beforeQuit) {
  if (state.state !== 'ready') return false;
  Promise.resolve(beforeQuit?.()).finally(() => updater.quitAndInstall(true, true));
  return true;
}

const notes = () => shell.openExternal(state.version ? `${RELEASES_URL}/tag/v${state.version}` : `${RELEASES_URL}/latest`);
const get = () => state;

module.exports = { setup, check, download, install, notes, get, RELEASES_URL };
