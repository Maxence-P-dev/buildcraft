'use strict';

// Servers: creation, settings, process control and live console.

const fs = require('fs');
const path = require('path');
const dgram = require('dgram');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const runtimes = require('./runtimes');
const { SOFTWARE, install } = require('./software');

const events = new EventEmitter(); // 'status' (server), 'log' (id, lines), 'progress' (id, info)
let root = null;
const running = new Map(); // id -> { proc, status, log, players, startedAt, waiters }

const LOG_KEEP = 3000;
const META = (dir) => path.join(dir, 'buildcraft', 'server.json');

const DEFAULTS = {
  motd: 'Mon serveur BuildCraft',
  port: 19132,
  maxPlayers: 20,
  gamemode: 0,
  difficulty: 1,
  whitelist: false,
  pvp: true,
  onlineMode: true,
  viewDistance: 8,
};

function setRoot(dir) {
  root = dir;
  fs.mkdirSync(root, { recursive: true });
}

const slug = (name) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40) || 'serveur';

function readMeta(dir) {
  try {
    return { ...JSON.parse(fs.readFileSync(META(dir), 'utf8')), dir };
  } catch {
    return null;
  }
}

function writeMeta(server) {
  const { dir, ...meta } = server;
  fs.mkdirSync(path.dirname(META(dir)), { recursive: true });
  fs.writeFileSync(META(dir), JSON.stringify(meta, null, 2));
}

function view(server) {
  const r = running.get(server.id);
  return {
    ...server,
    status: r?.status || server.status || 'stopped',
    players: r ? [...r.players] : [],
    startedAt: r?.startedAt || null,
    software: server.software,
    softwareName: SOFTWARE[server.software].name,
    maintained: SOFTWARE[server.software].maintained,
  };
}

function list() {
  if (!root) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => readMeta(path.join(root, d.name)))
    .filter(Boolean)
    .sort((a, b) => a.created - b.created)
    .map(view);
}

const get = (id) => list().find((s) => s.id === id) || null;

function emitStatus(server) {
  events.emit('status', view(server));
}

/* ------------------------------------------------------------ console */

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

function pushLog(id, text) {
  const r = running.get(id);
  if (!r) return;
  const lines = text
    .replace(ANSI, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !/^WARNING: (A restricted|java\.lang\.System::load|Use --enable-native|Restricted methods|A terminally|sun\.misc|Please consider)/.test(l));
  if (!lines.length) return;
  r.log.push(...lines);
  if (r.log.length > LOG_KEEP) r.log.splice(0, r.log.length - LOG_KEEP);
  let changed = false;
  for (const line of lines) {
    const join = line.match(/(\w[\w ]{1,20})\[\/[\d.:a-f[\]]+\] logged in/i);
    const left = line.match(/(\w[\w ]{1,20})(?:\[\/[\d.:a-f[\]]+\])? (?:logged out|lost connection|left the game)/i);
    if (join) r.players.add(join[1].trim());
    if (left) r.players.delete(left[1].trim());
    if (join || left) changed = true;
    if (/(Done|Terminé) \([\d.,]+ ?s\)/.test(line) && r.status === 'starting') {
      r.status = 'running';
      changed = true;
      r.waiters.splice(0).forEach((w) => w.resolve());
    }
  }
  events.emit('log', id, lines);
  if (changed) {
    const s = readMeta(r.dir);
    if (s) emitStatus(s);
  }
}

function logOf(id) {
  return running.get(id)?.log || [];
}

/* ---------------------------------------------------------- lifecycle */

function portFree(port) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', () => resolve(false));
    sock.bind(port, '0.0.0.0', () => sock.close(() => resolve(true)));
  });
}

/** Starts a server; resolves once it reports "Done", rejects if it exits first. */
async function start(id, { quiet = false } = {}) {
  const server = get(id);
  if (!server) throw new Error('Serveur introuvable.');
  const existing = running.get(id);
  if (existing && existing.status !== 'stopped') return waitReady(id);
  const sw = SOFTWARE[server.software];
  if (!(await portFree(server.settings.port))) {
    throw new Error(`Le port ${server.settings.port} est déjà utilisé, sans doute par un autre serveur. Change le port dans les réglages.`);
  }
  const exe = await runtimes.ensure(sw.runtime, (p) => events.emit('progress', id, p));
  sw.apply(server.dir, server.settings);
  const { cmd, args } = sw.args(server, exe);
  const proc = spawn(cmd, args, { cwd: server.dir, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const r = { proc, dir: server.dir, status: 'starting', log: existing?.log || [], players: new Set(), startedAt: Date.now(), waiters: [] };
  running.set(id, r);
  if (!quiet) r.log.push(`§7── Démarrage de ${sw.name} ${server.version} ──`);
  emitStatus(server);
  proc.stdout.setEncoding('utf8');
  proc.stderr.setEncoding('utf8');
  proc.stdout.on('data', (d) => pushLog(id, d));
  proc.stderr.on('data', (d) => pushLog(id, d));
  proc.on('exit', (code) => {
    const wasStopping = r.status === 'stopping';
    r.status = 'stopped';
    r.players.clear();
    r.log.push(wasStopping || code === 0 ? '§7── Serveur arrêté ──' : `§c── Le serveur s’est arrêté de façon inattendue (code ${code}) ──`);
    events.emit('log', id, [r.log[r.log.length - 1]]);
    r.waiters.splice(0).forEach((w) => w.reject(new Error('Le serveur s’est arrêté pendant le démarrage. Regarde la console pour l’erreur.')));
    const s = readMeta(server.dir);
    if (s) emitStatus(s);
  });
  return waitReady(id);
}

function waitReady(id, timeout = 180000) {
  const r = running.get(id);
  if (!r) return Promise.reject(new Error('Serveur arrêté.'));
  if (r.status === 'running') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Le serveur met trop de temps à démarrer.')), timeout);
    r.waiters.push({ resolve: () => (clearTimeout(t), resolve()), reject: (e) => (clearTimeout(t), reject(e)) });
  });
}

function stop(id, timeout = 25000) {
  const r = running.get(id);
  if (!r || r.status === 'stopped') return Promise.resolve();
  if (r.status !== 'stopping') {
    r.status = 'stopping';
    const s = readMeta(r.dir);
    if (s) emitStatus(s);
    try {
      r.proc.stdin.write('stop\n');
    } catch {}
  }
  return new Promise((resolve) => {
    const kill = setTimeout(() => r.proc.kill(), timeout);
    r.proc.once('exit', () => {
      clearTimeout(kill);
      resolve();
    });
    if (r.proc.exitCode !== null) resolve();
  });
}

async function restart(id) {
  await stop(id);
  return start(id);
}

function command(id, text) {
  const r = running.get(id);
  if (!r || r.status !== 'running') throw new Error('Le serveur doit être démarré pour recevoir une commande.');
  r.log.push(`> ${text}`);
  events.emit('log', id, [`> ${text}`]);
  r.proc.stdin.write(`${text}\n`);
}

const stopAll = () => Promise.all([...running.keys()].map((id) => stop(id, 10000)));

/* ------------------------------------------------------------ create */

async function create({ name, software, settings = {}, memory = 2048 }) {
  if (!SOFTWARE[software]) throw new Error('Logiciel serveur inconnu.');
  name = String(name || '').trim().slice(0, 60) || 'Mon serveur';
  let folder = slug(name);
  for (let i = 2; fs.existsSync(path.join(root, folder)); i++) folder = `${slug(name)}-${i}`;
  const dir = path.join(root, folder);
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const server = { id, name, software, version: '…', created: Date.now(), memory, settings: { ...DEFAULTS, motd: name, ...settings }, status: 'installing', dir };
  fs.mkdirSync(path.join(dir, 'plugins'), { recursive: true });
  writeMeta(server);
  emitStatus(server);
  const progress = (p) => events.emit('progress', id, p);
  try {
    await runtimes.ensure(SOFTWARE[software].runtime, progress);
    server.version = await install(software, dir, progress);
    delete server.status;
    writeMeta(server);
    // PowerNukkitX writes its configuration on first start: boot once, then apply our settings.
    if (software === 'pnx') {
      progress({ step: 'Première préparation du serveur…' });
      await start(id, { quiet: true });
      await stop(id);
      running.get(id).log.length = 0;
    }
    SOFTWARE[software].apply(dir, server.settings);
    progress(null);
    emitStatus(server);
    return view(server);
  } catch (err) {
    server.status = 'broken';
    server.error = err.message;
    writeMeta(server);
    progress(null);
    emitStatus(server);
    throw err;
  }
}

function update(id, patch) {
  const server = get(id);
  if (!server) throw new Error('Serveur introuvable.');
  if (patch.name) server.name = String(patch.name).slice(0, 60);
  if (patch.settings) server.settings = { ...server.settings, ...patch.settings };
  if (patch.memory) server.memory = Math.max(512, Math.min(16384, Number(patch.memory)));
  const { status, players, startedAt, softwareName, maintained, ...meta } = server;
  writeMeta(meta);
  SOFTWARE[server.software].apply(server.dir, server.settings);
  emitStatus(meta);
  return view(meta);
}

async function remove(id, trash) {
  const server = get(id);
  if (!server) return;
  await stop(id);
  running.delete(id);
  await trash(server.dir);
}

/** Plugins installed in the server (jar / phar / folders), with BuildCraft-made ones flagged. */
function plugins(id) {
  const server = get(id);
  if (!server) return [];
  const dir = path.join(server.dir, 'plugins');
  const own = new Set(fs.existsSync(path.join(server.dir, 'buildcraft', 'plugins')) ? fs.readdirSync(path.join(server.dir, 'buildcraft', 'plugins')) : []);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(jar|phar)$/i.test(f))
    .map((f) => {
      const st = fs.statSync(path.join(dir, f));
      const name = f.replace(/\.(jar|phar)$/i, '');
      return { file: f, name, size: st.size, modified: st.mtimeMs, own: own.has(name) };
    });
}

module.exports = { events, setRoot, list, get, start, stop, restart, command, create, update, remove, logOf, plugins, stopAll, waitReady, DEFAULTS };
