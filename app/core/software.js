'use strict';

// Server software catalog: where to download it, how to start it, how to configure it.

const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const { download, json } = require('./download');

const GAMEMODES = ['SURVIVAL', 'CREATIVE', 'ADVENTURE', 'SPECTATOR'];

/* ---------------------------------------------------- tiny YAML editing */

// Sets `parent.key: value` in a YAML file without rewriting its comments.
function setYaml(text, parent, key, value) {
  const lines = text.split(/\r?\n/);
  let inParent = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\S/.test(line) && !line.startsWith('#')) inParent = line.replace(/:.*$/, '') === parent;
    else if (inParent) {
      const m = line.match(/^(\s+)([\w-]+):\s*(.*)$/);
      if (m && m[2] === key) {
        lines[i] = `${m[1]}${key}: ${value}`;
        return lines.join('\n');
      }
    }
  }
  return text;
}

const yamlString = (s) => JSON.stringify(String(s));

/* ------------------------------------------------------------- catalog */

const SOFTWARE = {
  pnx: {
    id: 'pnx',
    name: 'PowerNukkitX',
    language: 'Java',
    runtime: 'java',
    repo: 'PowerNukkitX/PowerNukkitX',
    asset: 'powernukkitx.jar',
    file: 'powernukkitx.jar',
    config: 'pnx.yml',
    api: '3.0.0',
    maintained: true,
    blurb: 'Logiciel Java moderne et activement maintenu. Recommandé.',
    args(server, java) {
      return {
        cmd: java,
        args: [
          `-Xms${Math.min(1024, server.memory)}M`,
          `-Xmx${server.memory}M`,
          '-Dfile.encoding=UTF-8',
          '-Dstdout.encoding=UTF-8',
          '-Dstderr.encoding=UTF-8',
          '--enable-native-access=ALL-UNNAMED',
          // Java 25 hides these packages; PowerNukkitX needs them to register plugin events.
          '--add-opens', 'java.base/java.lang=ALL-UNNAMED',
          '--add-opens', 'java.base/java.io=ALL-UNNAMED',
          '--add-opens', 'java.base/java.util=ALL-UNNAMED',
          '-jar', 'powernukkitx.jar',
        ],
      };
    },
    // pnx.yml is created by the first start; settings are applied before every start.
    apply(dir, s) {
      const file = path.join(dir, 'pnx.yml');
      if (!fs.existsSync(file)) return false;
      let t = fs.readFileSync(file, 'utf8');
      t = setYaml(t, 'settings', 'port', s.port);
      t = setYaml(t, 'settings', 'maxPlayers', s.maxPlayers);
      t = setYaml(t, 'settings', 'motd', yamlString(s.motd));
      t = setYaml(t, 'settings', 'sub-motd', yamlString('BuildCraft'));
      t = setYaml(t, 'settings', 'allowList', s.whitelist);
      t = setYaml(t, 'settings', 'xboxAuth', s.onlineMode);
      t = setYaml(t, 'gameplay-settings', 'gamemode', s.gamemode);
      t = setYaml(t, 'gameplay-settings', 'difficulty', s.difficulty);
      t = setYaml(t, 'gameplay-settings', 'pvp', s.pvp);
      t = setYaml(t, 'gameplay-settings', 'viewDistance', s.viewDistance);
      fs.writeFileSync(file, t);
      return true;
    },
  },
  pocketmine: {
    id: 'pocketmine',
    name: 'PocketMine-MP',
    language: 'PHP',
    runtime: 'php',
    repo: 'pmmp/PocketMine-MP',
    asset: 'PocketMine-MP.phar',
    file: 'PocketMine-MP.phar',
    config: 'server.properties',
    api: '5.0.0',
    maintained: false,
    blurb: 'Plus maintenu depuis juillet 2026 : compatible seulement avec certaines versions de Minecraft.',
    args(server, php) {
      return { cmd: php, args: ['PocketMine-MP.phar', '--no-wizard', '--disable-ansi', `--data=${server.dir}`, `--plugins=${path.join(server.dir, 'plugins')}`] };
    },
    apply(dir, s) {
      const file = path.join(dir, 'server.properties');
      const props = {};
      if (fs.existsSync(file)) {
        for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
          const m = line.match(/^([^#=]+)=(.*)$/);
          if (m) props[m[1].trim()] = m[2];
        }
      }
      const onoff = (b) => (b ? 'on' : 'off');
      Object.assign(props, {
        motd: s.motd,
        'server-port': s.port,
        'server-portv6': s.port + 1,
        'max-players': s.maxPlayers,
        gamemode: GAMEMODES[s.gamemode] || 'SURVIVAL',
        difficulty: s.difficulty,
        'white-list': onoff(s.whitelist),
        pvp: onoff(s.pvp),
        'view-distance': s.viewDistance,
        'xbox-auth': onoff(s.onlineMode),
        language: props.language || 'eng', // English console: BuildCraft reads its messages
      });
      fs.writeFileSync(file, '#Properties Config file (BuildCraft)\n' + Object.entries(props).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
      return true;
    },
  },
};

/* ------------------------------------------------------------ versions */

const versionCache = {};

async function latest(id) {
  const sw = SOFTWARE[id];
  if (versionCache[id] && Date.now() - versionCache[id].at < 30 * 60 * 1000) return versionCache[id];
  const rel = await json(`https://api.github.com/repos/${sw.repo}/releases/latest`);
  const asset = rel.assets.find((a) => a.name === sw.asset);
  if (!asset) throw new Error(`Aucun fichier ${sw.asset} dans la dernière version de ${sw.name}.`);
  versionCache[id] = { at: Date.now(), version: rel.tag_name, url: asset.browser_download_url, size: asset.size };
  return versionCache[id];
}

/** Downloads the server software (cached per version) into the server folder. */
async function install(id, dir, onProgress) {
  const sw = SOFTWARE[id];
  const { version, url } = await latest(id);
  const cached = path.join(paths.cache, `${id}-${version}-${sw.file}`);
  if (!fs.existsSync(cached)) {
    await download(url, cached, { onProgress: (p) => onProgress?.({ step: `Téléchargement de ${sw.name} ${version}`, ...p }) });
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(cached, path.join(dir, sw.file));
  return version;
}

module.exports = { SOFTWARE, GAMEMODES, latest, install, setYaml };
