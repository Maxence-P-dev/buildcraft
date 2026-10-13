'use strict';

// Plugin projects: scaffolding, file access confined to the project, build and install.
// PowerNukkitX: javac + jar with Java 25.  PocketMine-MP: php -l + phar.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const runtimes = require('./runtimes');
const { SOFTWARE } = require('./software');

const projectsDir = (server) => path.join(server.dir, 'buildcraft', 'plugins');
const cleanName = (n) => String(n || '').replace(/[^A-Za-z0-9_]/g, '').replace(/^\d+/, '').slice(0, 40);

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 20 * 1024 * 1024, timeout: 180000, ...opts }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, out: `${stdout || ''}${stderr || ''}` });
    });
  });
}

/** Resolves a path inside a project and refuses anything that escapes it. */
function inside(base, rel) {
  const target = path.resolve(base, String(rel || '').replace(/^[/\\]+/, ''));
  const r = path.relative(base, target);
  if (r === '' || r.startsWith('..') || path.isAbsolute(r)) throw new Error(`Chemin refusé : ${rel}`);
  return target;
}

function listProjects(server) {
  const dir = projectsDir(server);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, files: listFiles(server, d.name) }));
}

function listFiles(server, name) {
  const base = path.join(projectsDir(server), name);
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'build') walk(full);
      } else out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  };
  walk(base);
  return out.sort();
}

const readFile = (server, name, rel) => fs.readFileSync(inside(path.join(projectsDir(server), name), rel), 'utf8');

function writeFile(server, name, rel, content) {
  const file = inside(path.join(projectsDir(server), name), rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return path.relative(path.join(projectsDir(server), name), file).split(path.sep).join('/');
}

function deleteFile(server, name, rel) {
  fs.rmSync(inside(path.join(projectsDir(server), name), rel), { force: true });
}

/* ----------------------------------------------------------- templates */

function scaffold(server, rawName, description = '') {
  const name = cleanName(rawName);
  if (!name) throw new Error('Nom de plugin invalide : lettres, chiffres et _ uniquement.');
  const base = path.join(projectsDir(server), name);
  if (fs.existsSync(base)) return name;
  const pkg = name.toLowerCase();
  if (server.software === 'pnx') {
    writeFile(server, name, 'src/main/resources/plugin.yml', `name: ${name}\nmain: buildcraft.${pkg}.Main\nversion: 1.0.0\napi: ["${SOFTWARE.pnx.api}"]\nauthor: BuildCraft\ndescription: ${JSON.stringify(description || name)}\n`);
    writeFile(
      server,
      name,
      `src/main/java/buildcraft/${pkg}/Main.java`,
      `package buildcraft.${pkg};

import org.powernukkitx.plugin.PluginBase;

public class Main extends PluginBase {
    @Override
    public void onEnable() {
        getLogger().info("${name} est activé.");
    }
}
`
    );
  } else {
    writeFile(server, name, 'plugin.yml', `name: ${name}\nmain: buildcraft\\${pkg}\\Main\nversion: 1.0.0\napi: ${SOFTWARE.pocketmine.api}\nauthor: BuildCraft\ndescription: ${JSON.stringify(description || name)}\n`);
    writeFile(
      server,
      name,
      `src/buildcraft/${pkg}/Main.php`,
      `<?php

declare(strict_types=1);

namespace buildcraft\\${pkg};

use pocketmine\\plugin\\PluginBase;

class Main extends PluginBase {
    protected function onEnable(): void {
        $this->getLogger()->info("${name} est activé.");
    }
}
`
    );
  }
  return name;
}

/* --------------------------------------------------------------- build */

const PHAR_SCRIPT = `<?php
[$self, $src, $out] = $argv;
if (file_exists($out)) unlink($out);
$phar = new Phar($out);
$phar->startBuffering();
$phar->buildFromDirectory($src);
$phar->setStub('<?php __HALT_COMPILER();');
$phar->stopBuffering();
echo "phar: " . count($phar) . " fichiers\\n";
`;

// "Main.java:12: error: cannot find symbol" -> { file, line, message }
function parseErrors(out, base) {
  const errors = [];
  for (const m of out.matchAll(/^(.+?\.java):(\d+): error: (.+)$/gm)) errors.push({ file: path.relative(base, m[1]).split(path.sep).join('/'), line: +m[2], message: m[3] });
  for (const m of out.matchAll(/(?:PHP )?(?:Parse|Fatal) error:\s*(.+?) in (.+?\.php) on line (\d+)/g)) errors.push({ file: path.relative(base, m[2]).split(path.sep).join('/'), line: +m[3], message: m[1] });
  return errors;
}

/** Builds a plugin project and copies the result into the server's plugins folder. */
async function build(server, name, onProgress) {
  const base = path.join(projectsDir(server), name);
  if (!fs.existsSync(base)) throw new Error(`Le plugin ${name} n’existe pas.`);
  const sw = SOFTWARE[server.software];
  await runtimes.ensure(sw.runtime, onProgress);
  const started = Date.now();
  let log = '';

  if (server.software === 'pnx') {
    const classes = path.join(base, 'build', 'classes');
    fs.rmSync(path.join(base, 'build'), { recursive: true, force: true });
    fs.mkdirSync(classes, { recursive: true });
    const sources = listFiles(server, name).filter((f) => f.endsWith('.java')).map((f) => path.join(base, f));
    if (!sources.length) return { ok: false, log: 'Aucun fichier .java dans le projet.', errors: [] };
    if (!fs.existsSync(path.join(base, 'src/main/resources/plugin.yml'))) return { ok: false, log: 'Il manque src/main/resources/plugin.yml.', errors: [] };
    const javac = await run(runtimes.javaTool('javac'), ['--release', '25', '-encoding', 'UTF-8', '-Xlint:none', '-cp', path.join(server.dir, sw.file), '-d', classes, ...sources]);
    log += javac.out;
    if (javac.code !== 0) return { ok: false, log: log.trim(), errors: parseErrors(log, base), ms: Date.now() - started };
    fs.cpSync(path.join(base, 'src/main/resources'), classes, { recursive: true });
    const out = path.join(server.dir, 'plugins', `${name}.jar`);
    const jar = await run(runtimes.javaTool('jar'), ['cf', out, '-C', classes, '.']);
    log += jar.out;
    if (jar.code !== 0) return { ok: false, log: log.trim(), errors: [], ms: Date.now() - started };
    return { ok: true, log: (log.trim() || 'Compilation réussie.') + `\n→ plugins/${name}.jar`, errors: [], file: out, ms: Date.now() - started };
  }

  // PocketMine-MP
  const php = runtimes.exe('php');
  if (!fs.existsSync(path.join(base, 'plugin.yml'))) return { ok: false, log: 'Il manque plugin.yml à la racine du plugin.', errors: [] };
  for (const f of listFiles(server, name).filter((f) => f.endsWith('.php'))) {
    const lint = await run(php, ['-l', path.join(base, f)]);
    if (lint.code !== 0) {
      log += lint.out;
      return { ok: false, log: log.trim(), errors: parseErrors(log, base), ms: Date.now() - started };
    }
  }
  const script = path.join(server.dir, 'buildcraft', 'build-phar.php');
  fs.writeFileSync(script, PHAR_SCRIPT);
  const out = path.join(server.dir, 'plugins', `${name}.phar`);
  const phar = await run(php, ['-d', 'phar.readonly=0', script, base, out]);
  log += phar.out;
  if (phar.code !== 0) return { ok: false, log: log.trim(), errors: [], ms: Date.now() - started };
  return { ok: true, log: `Syntaxe PHP vérifiée.\n${phar.out.trim()}\n→ plugins/${name}.phar`, errors: [], file: out, ms: Date.now() - started };
}

/** Removes an installed plugin file (and optionally its BuildCraft project). */
function uninstall(server, file, withProject) {
  const target = inside(path.join(server.dir, 'plugins'), file);
  fs.rmSync(target, { force: true });
  if (withProject) fs.rmSync(path.join(projectsDir(server), file.replace(/\.(jar|phar)$/i, '')), { recursive: true, force: true });
}

module.exports = { scaffold, build, listProjects, listFiles, readFile, writeFile, deleteFile, uninstall, cleanName, projectsDir };
