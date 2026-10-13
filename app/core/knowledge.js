'use strict';

// What the AI knows: built-in guides, web pages it has read, lessons it has learned,
// and direct lookups into the real server API (javap / PocketMine sources).

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const MiniSearch = require('minisearch');
const paths = require('./paths');
const runtimes = require('./runtimes');
const { SOFTWARE } = require('./software');

const DOCS = path.join(paths.knowledge, 'docs.json');
const LESSONS = path.join(paths.knowledge, 'lessons.json');

/* --------------------------------------------------------- built-in docs */

const BUILTIN = [
  {
    id: 'builtin-pnx-basics',
    software: 'pnx',
    title: 'PowerNukkitX 3 : structure d’un plugin',
    text: `PowerNukkitX 3.x (Java 25). IMPORTANT : le paquet de l'API est org.powernukkitx (l'ancien cn.nukkit n'existe plus). Les tutoriels Nukkit/PowerNukkit trouvés en ligne utilisent souvent l'ancien paquet : il faut remplacer cn.nukkit par org.powernukkitx.
Arborescence d'un projet BuildCraft :
- src/main/resources/plugin.yml
- src/main/java/<paquet>/Main.java
plugin.yml :
name: MonPlugin
main: buildcraft.monplugin.Main
version: 1.0.0
api: ["3.0.0"]   (la version majeure doit être 3, la mineure inférieure ou égale à celle du serveur)
author: BuildCraft
commands:
  macommande:
    description: ...
    usage: /macommande
permissions:
  monplugin.commande:
    default: true
La classe principale étend org.powernukkitx.plugin.PluginBase et peut redéfinir onLoad(), onEnable(), onDisable(), onCommand(CommandSender sender, Command command, String label, String[] args).
Utilitaires de PluginBase : getServer(), getLogger(), getDataFolder(), saveDefaultConfig(), getConfig() (org.powernukkitx.utils.Config), saveResource(String).
Couleurs : org.powernukkitx.utils.TextFormat (ex. TextFormat.GREEN) ou les codes § (§a vert, §e jaune, §c rouge).`,
  },
  {
    id: 'builtin-pnx-events',
    software: 'pnx',
    title: 'PowerNukkitX 3 : événements, commandes, tâches, formulaires',
    text: `Événements : la classe implémente org.powernukkitx.event.Listener, chaque méthode porte @org.powernukkitx.event.EventHandler et prend un événement en paramètre. Enregistrement dans onEnable : getServer().getPluginManager().registerEvents(this, this);
Événements courants : org.powernukkitx.event.player.PlayerJoinEvent, PlayerQuitEvent, PlayerChatEvent, PlayerDeathEvent, PlayerInteractEvent, PlayerMoveEvent ; org.powernukkitx.event.block.BlockBreakEvent, BlockPlaceEvent ; org.powernukkitx.event.entity.EntityDamageEvent. event.getPlayer() renvoie un org.powernukkitx.Player ; event.setCancelled(true) annule.
Joueur : org.powernukkitx.Player : sendMessage(String), getName(), teleport(Location ou Position, PlayerTeleportEvent.TeleportCause).
Commandes : déclarées dans plugin.yml puis traitées dans onCommand ; command.getName() donne le nom. Pour savoir si l'expéditeur est un joueur : if (sender instanceof Player p).
Tâches planifiées : getServer().getScheduler().scheduleDelayedTask(this, () -> { ... }, ticks) et scheduleRepeatingTask(this, runnable, ticks) (20 ticks = 1 seconde).
Formulaires (menus) : org.powernukkitx.form.window.SimpleForm(String titre, String contenu).addButton(String texte, Consumer<Player> action) ; aussi ModalForm et CustomForm (éléments dans org.powernukkitx.form.element). En cas de doute sur une méthode, utiliser l'outil api_lookup.`,
  },
  {
    id: 'builtin-pnx-runtime',
    software: 'pnx',
    title: 'PowerNukkitX 3 : lancement et erreurs connues',
    text: `Le serveur tourne sur Java 25 et il faut les options --add-opens java.base/java.lang=ALL-UNNAMED (BuildCraft les ajoute) : sans elles, l'activation d'un plugin qui enregistre des événements échoue avec InaccessibleObjectException.
La configuration du serveur est pnx.yml (pas server.properties). Le serveur affiche « Done (x s)! » quand il est prêt. Un plugin est chargé avec « Loading NomPlugin » puis « Enabling NomPlugin » ; une erreur d'activation apparaît sous « An error occurred while enabling the plugin ».`,
  },
  {
    id: 'builtin-pm-basics',
    software: 'pocketmine',
    title: 'PocketMine-MP 5 : structure d’un plugin',
    text: `PocketMine-MP 5.x (PHP 8.4). Arborescence d'un projet BuildCraft :
- plugin.yml (à la racine)
- src/<espace de noms>/Main.php (PSR-4 : l'espace de noms buildcraft\\monplugin correspond au dossier src/buildcraft/monplugin)
plugin.yml :
name: MonPlugin
main: buildcraft\\monplugin\\Main
version: 1.0.0
api: 5.0.0
commands:
  macommande:
    description: ...
    usage: /macommande
    permission: monplugin.commande
permissions:
  monplugin.commande:
    default: true
IMPORTANT : chaque commande doit avoir une permission déclarée, sinon le plugin ne se charge pas.
La classe principale étend pocketmine\\plugin\\PluginBase ; onEnable() et onDisable() sont protected function ...(): void. onCommand(CommandSender $sender, Command $command, string $label, array $args): bool est public.
Toujours commencer les fichiers par <?php puis declare(strict_types=1);`,
  },
  {
    id: 'builtin-pm-events',
    software: 'pocketmine',
    title: 'PocketMine-MP 5 : événements, tâches, formulaires',
    text: `Événements : la classe implémente pocketmine\\event\\Listener ; toute méthode publique qui prend un seul événement en paramètre est un écouteur. Enregistrement : $this->getServer()->getPluginManager()->registerEvents($this, $this);
Événements courants : pocketmine\\event\\player\\PlayerJoinEvent, PlayerQuitEvent, PlayerChatEvent, PlayerDeathEvent, PlayerInteractEvent ; pocketmine\\event\\block\\BlockBreakEvent, BlockPlaceEvent ; pocketmine\\event\\entity\\EntityDamageEvent. $event->getPlayer() renvoie pocketmine\\player\\Player ; $event->cancel() annule.
Joueur : sendMessage(string), getName(), teleport(Vector3 ou Location), getWorld().
Tâches : $this->getScheduler()->scheduleDelayedTask(new ClosureTask(function(): void { ... }), ticks) avec pocketmine\\scheduler\\ClosureTask ; scheduleRepeatingTask pour répéter.
Configuration : $this->saveDefaultConfig(); $this->getConfig()->get("cle", valeurParDefaut);
Couleurs : pocketmine\\utils\\TextFormat::GREEN ou les codes §.
Formulaires : PocketMine 5 n'a pas d'API de formulaires intégrée ; il faut envoyer le JSON via une classe implémentant pocketmine\\form\\Form (méthodes jsonSerialize() et handleResponse(Player $player, $data): void) puis $player->sendForm($form).`,
  },
  {
    id: 'builtin-pm-warning',
    software: 'pocketmine',
    title: 'PocketMine-MP : fin de maintenance',
    text: `PocketMine-MP n'est plus maintenu depuis juillet 2026 : il ne suit plus les nouvelles versions de Minecraft. Le serveur affiche « Done (x s)! » quand il est prêt. Une erreur de plugin apparaît sous forme de « [Server thread/CRITICAL] » ou « Error: » avec le fichier et la ligne.`,
  },
];

/* ---------------------------------------------------------- storage */

const read = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};
const write = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 1));
};

let docs = null;
let lessons = null;
let index = null;

function load() {
  if (!docs) docs = read(DOCS, []);
  if (!lessons) lessons = read(LESSONS, []);
}

function rebuild() {
  load();
  index = new MiniSearch({
    fields: ['title', 'text'],
    storeFields: ['title', 'text', 'kind', 'software', 'url', 'ref'],
    searchOptions: { boost: { title: 2 }, fuzzy: 0.2, prefix: true },
  });
  const all = [];
  for (const d of [...BUILTIN.map((b) => ({ ...b, chunks: [b.text], builtin: true })), ...docs]) {
    d.chunks.forEach((text, i) => all.push({ id: `${d.id}#${i}`, ref: d.id, kind: 'doc', title: d.title, text, software: d.software, url: d.url || null }));
  }
  for (const l of lessons) all.push({ id: l.id, ref: l.id, kind: 'lesson', title: 'Leçon', text: l.text, software: l.software });
  index.addAll(all);
}

function search(query, software, limit = 6) {
  if (!index) rebuild();
  return index
    .search(query, { filter: (r) => !software || r.software === software || r.software === 'all' })
    .slice(0, limit)
    .map((r) => ({ kind: r.kind, title: r.title, text: r.text, url: r.url, software: r.software }));
}

/* --------------------------------------------------------------- docs */

function htmlToText(html) {
  return html
    .replace(/<(script|style|nav|footer|header|aside|svg|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/pre|\/tr|\/section)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

function chunk(text, size = 1800) {
  const out = [];
  let cur = '';
  for (const para of text.split(/\n\n/)) {
    if (cur && cur.length + para.length > size) {
      out.push(cur.trim());
      cur = '';
    }
    cur += `${para}\n\n`;
    while (cur.length > size * 1.5) {
      out.push(cur.slice(0, size).trim());
      cur = cur.slice(size);
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Reads a web page and keeps it in the knowledge base. */
async function addUrl(url, software = 'all') {
  const res = await fetch(url, { headers: { 'User-Agent': 'BuildCraft (documentation reader)' } });
  if (!res.ok) throw new Error(`Page inaccessible (${res.status}).`);
  const type = res.headers.get('content-type') || '';
  const body = await res.text();
  const text = /html/.test(type) ? htmlToText(body) : body;
  const title = (/<title[^>]*>([^<]+)<\/title>/i.exec(body)?.[1] || url).trim().slice(0, 140);
  if (text.length < 80) throw new Error('La page ne contient presque pas de texte lisible.');
  load();
  const doc = { id: `doc-${Date.now().toString(36)}`, title, url, software, chunks: chunk(text.slice(0, 300000)), added: Date.now() };
  docs.push(doc);
  write(DOCS, docs);
  rebuild();
  return { id: doc.id, title, chunks: doc.chunks.length };
}

function addText(title, text, software = 'all') {
  load();
  const doc = { id: `doc-${Date.now().toString(36)}`, title: String(title).slice(0, 140), url: null, software, chunks: chunk(String(text)), added: Date.now() };
  docs.push(doc);
  write(DOCS, docs);
  rebuild();
  return { id: doc.id, title: doc.title, chunks: doc.chunks.length };
}

/* ------------------------------------------------------------ lessons */

function remember(text, software = 'all', source = 'ia') {
  load();
  text = String(text).trim().slice(0, 1200);
  if (!text) return null;
  if (lessons.some((l) => l.text === text)) return null;
  const lesson = { id: `lesson-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, text, software, source, created: Date.now() };
  lessons.push(lesson);
  write(LESSONS, lessons);
  rebuild();
  return lesson;
}

/** Lessons to give the AI up front: the most relevant ones plus the latest ones. */
function lessonsFor(software, query, limit = 12) {
  load();
  const pool = lessons.filter((l) => l.software === software || l.software === 'all');
  const relevant = query ? search(query, software, 20).filter((r) => r.kind === 'lesson').map((r) => r.text) : [];
  const recent = pool.slice(-6).map((l) => l.text);
  return [...new Set([...relevant, ...recent])].slice(0, limit);
}

function summary() {
  load();
  return {
    builtin: BUILTIN.map(({ id, title, software }) => ({ id, title, software })),
    docs: docs.map(({ id, title, url, software, chunks, added }) => ({ id, title, url, software, chunks: chunks.length, added })),
    lessons: [...lessons].reverse(),
  };
}

function removeDoc(id) {
  load();
  docs = docs.filter((d) => d.id !== id);
  write(DOCS, docs);
  rebuild();
}

function removeLesson(id) {
  load();
  lessons = lessons.filter((l) => l.id !== id);
  write(LESSONS, lessons);
  rebuild();
}

function editLesson(id, text) {
  load();
  const l = lessons.find((x) => x.id === id);
  if (l) l.text = String(text).slice(0, 1200);
  write(LESSONS, lessons);
  rebuild();
}

/* ---------------------------------------------------------- API lookup */

const run = (cmd, args) =>
  new Promise((resolve) => execFile(cmd, args, { windowsHide: true, maxBuffer: 50 * 1024 * 1024, timeout: 60000 }, (err, out, errOut) => resolve(err ? `${out}${errOut}` : out)));

const classCache = new Map();

async function classList(server) {
  const key = `${server.software}-${server.version}`;
  if (classCache.has(key)) return classCache.get(key);
  const file = path.join(paths.knowledge, `classes-${key}.txt`);
  let list;
  if (fs.existsSync(file)) list = fs.readFileSync(file, 'utf8').split('\n');
  else {
    if (server.software === 'pnx') {
      await runtimes.ensure('java');
      const out = await run(runtimes.javaTool('jar'), ['tf', path.join(server.dir, SOFTWARE.pnx.file)]);
      list = out
        .split(/\r?\n/)
        .filter((l) => /^org\/powernukkitx\/.*\.class$/.test(l) && !l.includes('$'))
        .map((l) => l.replace(/\.class$/, '').replace(/\//g, '.'));
    } else {
      const php = await runtimes.ensure('php');
      const phar = path.join(server.dir, SOFTWARE.pocketmine.file).replace(/\\/g, '/');
      const out = await run(php, ['-r', `foreach (new RecursiveIteratorIterator(new Phar('${phar}')) as $f) { $p = str_replace('\\\\', '/', $f->getPathname()); if (preg_match('#/src/(.+)\\.php$#', $p, $m)) echo 'pocketmine/', $m[1], "\\n"; }`]);
      list = out
        .split(/\r?\n/)
        .filter(Boolean)
        .map((l) => l.replace(/\//g, '\\'));
    }
    fs.mkdirSync(paths.knowledge, { recursive: true });
    fs.writeFileSync(file, list.join('\n'));
  }
  classCache.set(key, list);
  return list;
}

function phpSignatures(src) {
  const lines = src.split(/\r?\n/);
  const out = [];
  const ns = /^namespace\s+([^;]+);/m.exec(src)?.[1];
  if (ns) out.push(`namespace ${ns};`);
  for (const line of lines) {
    const t = line.trim();
    if (/^(abstract |final )?(class|interface|trait|enum) /.test(t) || /^public (static |final |abstract )*function /.test(t) || /^public const /.test(t) || /^case [A-Z_]+/.test(t)) {
      out.push(t.replace(/\s*\{.*$/, '').replace(/;$/, ''));
    }
  }
  return out.join('\n');
}

/** Real API information: exact class signatures, or matching class names. */
async function apiLookup(server, query) {
  const list = await classList(server);
  const q = String(query).trim();
  const simple = q.split(/[.\\]/).pop().toLowerCase();
  const exact = list.find((c) => c.toLowerCase() === q.toLowerCase().replace(/\//g, server.software === 'pnx' ? '.' : '\\'));
  const named = list.filter((c) => c.split(/[.\\]/).pop().toLowerCase() === simple);
  const target = exact || (named.length === 1 ? named[0] : null);
  if (!target) {
    const matches = list.filter((c) => c.toLowerCase().includes(simple)).slice(0, 40);
    return matches.length ? `Classes correspondantes (précise le nom complet) :\n${matches.join('\n')}` : `Aucune classe ne correspond à « ${q} ».`;
  }
  if (server.software === 'pnx') {
    await runtimes.ensure('java');
    const out = await run(runtimes.javaTool('javap'), ['-public', '-cp', path.join(server.dir, SOFTWARE.pnx.file), target]);
    return out.slice(0, 12000);
  }
  const php = await runtimes.ensure('php');
  const phar = path.join(server.dir, SOFTWARE.pocketmine.file).replace(/\\/g, '/');
  const rel = target.replace(/^pocketmine\\/, '').replace(/\\/g, '/');
  const src = await run(php, ['-r', `echo file_get_contents('phar://${phar}/src/${rel}.php');`]);
  return phpSignatures(src).slice(0, 12000) || `Source introuvable pour ${target}.`;
}

const builtinFor = (software) => BUILTIN.filter((b) => b.software === software).map((b) => `## ${b.title}\n${b.text}`).join('\n\n');

module.exports = { search, addUrl, addText, remember, lessonsFor, summary, removeDoc, removeLesson, editLesson, apiLookup, htmlToText, builtinFor };
