'use strict';

// Java 25 (PowerNukkitX + plugin compilation) and PHP 8.4 (PocketMine-MP),
// downloaded once into the app data folder.

const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const { download, unzipTo } = require('./download');

const RUNTIMES = {
  java: {
    label: 'Java 25 (Temurin)',
    dir: path.join(paths.runtimes, 'java25'),
    url: 'https://api.adoptium.net/v3/binary/latest/25/ga/windows/x64/jdk/hotspot/normal/eclipse',
    exe: (dir) => path.join(dir, 'bin', 'java.exe'),
  },
  php: {
    label: 'PHP 8.4',
    dir: path.join(paths.runtimes, 'php84'),
    url: 'https://github.com/pmmp/PHP-Binaries/releases/download/pm5-php-8.4-latest/PHP-8.4-Windows-x64-PM5.zip',
    exe: (dir) => path.join(dir, 'bin', 'php', 'php.exe'),
    keepTopFolder: true, // the archive's top folder is "bin", which PocketMine's layout expects
  },
};

const pending = new Map();

function exe(id) {
  const r = RUNTIMES[id];
  const file = r.exe(r.dir);
  return fs.existsSync(file) ? file : null;
}

/** Path of a JDK tool (javac, jar, javap). */
const javaTool = (name) => path.join(RUNTIMES.java.dir, 'bin', `${name}.exe`);

/** Makes sure a runtime is installed; concurrent callers share one download. */
function ensure(id, onProgress) {
  const ready = exe(id);
  if (ready) return Promise.resolve(ready);
  if (pending.has(id)) return pending.get(id);
  const r = RUNTIMES[id];
  const job = (async () => {
    const zip = path.join(paths.cache, `${id}-runtime.zip`);
    await download(r.url, zip, { onProgress: (p) => onProgress?.({ step: `Téléchargement de ${r.label}`, ...p }) });
    onProgress?.({ step: `Installation de ${r.label}` });
    await unzipTo(zip, r.dir, { flatten: !r.keepTopFolder });
    fs.rmSync(zip, { force: true });
    const file = exe(id);
    if (!file) throw new Error(`${r.label} n’a pas pu être installé.`);
    return file;
  })().finally(() => pending.delete(id));
  pending.set(id, job);
  return job;
}

module.exports = { RUNTIMES, exe, ensure, javaTool };
