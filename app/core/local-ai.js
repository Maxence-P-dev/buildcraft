'use strict';

// Free, offline coding assistant: a code model (Qwen2.5-Coder) running on the computer
// with node-llama-cpp. Guided pipeline: generate files -> build -> fix -> test -> learn.

const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const servers = require('./servers');
const builder = require('./builder');
const knowledge = require('./knowledge');
const { SOFTWARE } = require('./software');

const MODELS = {
  standard: {
    id: 'standard',
    label: 'Standard',
    name: 'Qwen2.5-Coder 7B',
    size: '4,7 Go',
    hint: 'Meilleur code, demande un PC récent',
    uri: 'hf:bartowski/Qwen2.5-Coder-7B-Instruct-GGUF:Q4_K_M',
    file: 'Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf',
  },
  light: {
    id: 'light',
    label: 'Léger',
    name: 'Qwen2.5-Coder 1.5B',
    size: '1,0 Go',
    hint: 'Rapide, pour les petits plugins',
    uri: 'hf:bartowski/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M',
    file: 'Qwen2.5-Coder-1.5B-Instruct-Q4_K_M.gguf',
  },
};

let lib = null;
let llama = null;
let loaded = null; // { id, model, context }
let download = null;
const sessions = new Map();
const statusListeners = new Set();

const modelPath = (id) => path.join(paths.models, MODELS[id].file);
const installed = () => Object.keys(MODELS).filter((id) => fs.existsSync(modelPath(id)));

function chosen() {
  const ids = installed();
  try {
    const pref = JSON.parse(fs.readFileSync(path.join(paths.models, 'choice.json'), 'utf8')).id;
    if (ids.includes(pref)) return pref;
  } catch {}
  return ids.includes('standard') ? 'standard' : ids[0] || null;
}

function status() {
  return {
    models: Object.values(MODELS).map(({ id, label, name, size, hint }) => ({ id, label, name, size, hint, installed: fs.existsSync(modelPath(id)) })),
    active: chosen(),
    download: download && { id: download.id, percent: download.percent },
  };
}
const notify = () => statusListeners.forEach((fn) => fn(status()));

const getLib = async () => (lib = lib || (await import('node-llama-cpp')));

async function getModel() {
  const id = chosen();
  if (!id) throw new Error('Installe d’abord l’IA locale dans les Paramètres.');
  if (loaded?.id === id) return loaded;
  await unload();
  const { getLlama } = await getLib();
  if (!llama) {
    llama = await getLlama({ gpu: 'auto' });
    // Integrated Intel graphics run these models slower than the processor.
    const devices = llama.gpu ? await llama.getGpuDeviceNames() : [];
    if (devices.length && devices.every((d) => /intel/i.test(d) && !/arc/i.test(d))) {
      await llama.dispose();
      llama = await getLlama({ gpu: false });
    }
  }
  const model = await llama.loadModel({ modelPath: modelPath(id) });
  const context = await model.createContext({ contextSize: 8192, sequences: 1 });
  loaded = { id, model, context };
  return loaded;
}

async function unload() {
  const m = loaded;
  loaded = null;
  await m?.context.dispose().catch(() => {});
  await m?.model.dispose().catch(() => {});
}

// Small models sometimes loop on one line (e.g. the same import 50 times): spot it early.
function looping(text) {
  const lines = text.slice(-4000).split('\\n').map((l) => l.trim()).filter((l) => l.length > 12);
  const last = lines[lines.length - 2];
  return !!last && lines.filter((l) => l === last).length >= 4;
}

async function generate(id, opts) {
  try {
    return await generateOnce(id, opts, { temperature: 0.15, penalty: 1.1 });
  } catch (err) {
    if (err.code !== 'LOOP') throw err;
    opts.onProgress?.(0);
    return generateOnce(id, opts, { temperature: 0.45, penalty: 1.25 });
  }
}

async function generateOnce(id, { system, prompt, schema, maxTokens = 3500, onProgress }, { temperature, penalty }) {
  const { context } = await getModel();
  const { LlamaChatSession } = await getLib();
  const session = new LlamaChatSession({ contextSequence: context.getSequence(), systemPrompt: system });
  const grammar = await llama.createGrammarForJsonSchema(schema);
  const guard = new AbortController();
  const user = sessions.get(id)?.controller.signal;
  let raw = '';
  try {
    let text;
    try {
      text = await session.prompt(prompt, {
        grammar,
        maxTokens,
        temperature,
        repeatPenalty: { lastTokens: 96, penalty, penalizeNewLine: false },
        signal: user ? AbortSignal.any([user, guard.signal]) : guard.signal,
        onTextChunk: (c) => {
          raw += c;
          onProgress?.(raw.length);
          if (looping(raw)) guard.abort();
        },
      });
    } catch (err) {
      if (guard.signal.aborted && !user?.aborted) {
        fs.writeFileSync(path.join(paths.user, 'local-ai-last.txt'), raw);
        throw Object.assign(new Error('L’IA locale s’est mise à répéter le même code. Reformule ta demande plus simplement, ou utilise Claude.'), { code: 'LOOP' });
      }
      throw err;
    }
    // Kept for troubleshooting: the last raw answer of the local model.
    fs.writeFileSync(path.join(paths.user, 'local-ai-last.txt'), text);
    try {
      return grammar.parse(text);
    } catch {
      throw new Error('La réponse de l’IA locale était trop longue ou incomplète. Demande un plugin plus simple, ou utilise Claude.');
    }
  } finally {
    session.dispose({ disposeSequence: true });
  }
}

/* ------------------------------------------------------------ pipeline */

const FILES_SCHEMA = {
  type: 'object',
  properties: {
    plugin: { type: 'string', maxLength: 40 },
    summary: { type: 'string', maxLength: 600 },
    lesson: { type: 'string', maxLength: 300 },
    files: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      items: { type: 'object', properties: { path: { type: 'string', maxLength: 160 }, content: { type: 'string', maxLength: 9000 } } },
    },
  },
};

// Complete answers that compile, shown to the model: small models copy them far better than they follow rules.
const EXAMPLES = {
  pnx: {
    plugin: 'Accueil',
    summary: 'Envoie un message de bienvenue quand un joueur rejoint le serveur, et ajoute la commande /salut.',
    lesson: '',
    files: [
      {
        path: 'src/main/resources/plugin.yml',
        content: ['name: Accueil', 'main: buildcraft.accueil.Main', 'version: 1.0.0', 'api: ["3.0.0"]', 'author: BuildCraft', 'commands:', '  salut:', '    description: Dit salut', '    usage: /salut', ''].join('\n'),
      },
      {
        path: 'src/main/java/buildcraft/accueil/Main.java',
        content: `package buildcraft.accueil;

import org.powernukkitx.command.Command;
import org.powernukkitx.command.CommandSender;
import org.powernukkitx.event.EventHandler;
import org.powernukkitx.event.Listener;
import org.powernukkitx.event.player.PlayerJoinEvent;
import org.powernukkitx.plugin.PluginBase;

public class Main extends PluginBase implements Listener {
    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        getLogger().info("Accueil est activé.");
    }

    // Événement : quand un joueur rejoint le serveur.
    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        int online = getServer().getOnlinePlayers().size();
        event.getPlayer().sendMessage("Bienvenue " + event.getPlayer().getName() + " ! Joueurs connectés : " + online);
    }

    // Commande : /salut (déclarée dans plugin.yml).
    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (command.getName().equals("salut")) {
            sender.sendMessage("Salut " + sender.getName() + " !");
            return true;
        }
        return false;
    }
}
`,
      },
    ],
  },
  pocketmine: {
    plugin: 'Accueil',
    summary: 'Envoie un message de bienvenue quand un joueur rejoint le serveur, et ajoute la commande /salut.',
    lesson: '',
    files: [
      {
        path: 'plugin.yml',
        content: ['name: Accueil', 'main: buildcraft\\accueil\\Main', 'version: 1.0.0', 'api: 5.0.0', 'author: BuildCraft', 'commands:', '  salut:', '    description: Dit salut', '    permission: accueil.salut', 'permissions:', '  accueil.salut:', '    default: true', ''].join('\n'),
      },
      {
        path: 'src/buildcraft/accueil/Main.php',
        content: `<?php

declare(strict_types=1);

namespace buildcraft\\accueil;

use pocketmine\\command\\Command;
use pocketmine\\command\\CommandSender;
use pocketmine\\event\\Listener;
use pocketmine\\event\\player\\PlayerJoinEvent;
use pocketmine\\plugin\\PluginBase;

class Main extends PluginBase implements Listener {
    protected function onEnable(): void {
        $this->getServer()->getPluginManager()->registerEvents($this, $this);
    }

    // Événement : quand un joueur rejoint le serveur (public, un seul paramètre typé).
    public function onJoin(PlayerJoinEvent $event): void {
        $online = count($this->getServer()->getOnlinePlayers());
        $event->getPlayer()->sendMessage("Bienvenue " . $event->getPlayer()->getName() . " ! Joueurs connectés : " . $online);
    }

    // Commande : /salut (déclarée dans plugin.yml avec une permission).
    public function onCommand(CommandSender $sender, Command $command, string $label, array $args): bool {
        if ($command->getName() === "salut") {
            $sender->sendMessage("Salut " . $sender->getName() . " !");
            return true;
        }
        return false;
    }
}
`,
      },
    ],
  },
};

function system(server) {
  const sw = SOFTWARE[server.software];
  const lessons = knowledge.lessonsFor(server.software, '');
  return `Tu es un développeur expert de plugins ${sw.name} ${server.version} pour Minecraft Bedrock, en ${sw.language}. Tu réponds uniquement par un objet JSON. Écris un code court et simple : importe seulement les classes que tu utilises, une seule fois chacune.
Documentation exacte de ce serveur :
${knowledge.builtinFor(server.software)}
${lessons.length ? `\nLeçons apprises :\n${lessons.map((l) => `- ${l}`).join('\n')}` : ''}

Format de réponse : {"plugin": nom PascalCase du plugin, "summary": explication courte en français pour l'utilisateur (commandes, usage), "lesson": ce que tu as corrigé (vide si rien), "files": liste des fichiers COMPLETS avec leur chemin relatif au plugin}.
${server.software === 'pnx' ? 'Fichiers attendus : src/main/resources/plugin.yml et src/main/java/buildcraft/<nom en minuscules>/Main.java (paquet buildcraft.<nom en minuscules>). Toutes les classes du serveur sont dans org.powernukkitx (jamais org.bukkit ni cn.nukkit).' : 'Fichiers attendus : plugin.yml et src/buildcraft/<nom en minuscules>/Main.php (espace de noms buildcraft\\<nom en minuscules>). Chaque commande déclare une permission.'}

Exemple de réponse correcte et complète (une commande et un événement : reprends seulement ce dont la demande a besoin) :
${JSON.stringify(EXAMPLES[server.software])}`;
}

const dump = (server, name) =>
  builder
    .listFiles(server, name)
    .map((f) => `--- ${f}\n${builder.readFile(server, name, f)}`)
    .join('\n\n');

function applyFiles(server, out, emit) {
  const name = builder.cleanName(out.plugin) || 'MonPlugin';
  // A new project gets the template only when the model forgot to send files.
  if (!(out.files || []).some((f) => f?.path && typeof f.content === 'string')) builder.scaffold(server, name);
  for (const f of out.files || []) {
    if (!f?.path || typeof f.content !== 'string') continue;
    const rel = builder.writeFile(server, name, f.path, f.content);
    emit({ type: 'action', icon: 'file', text: `Écrit ${name}/${rel}`, lines: f.content.split('\n').length });
  }
  return name;
}

async function ask(server, request, emit) {
  if (sessions.has(server.id)) throw new Error('L’assistant travaille déjà sur ce serveur.');
  sessions.set(server.id, { controller: new AbortController() });
  const chatFile = path.join(server.dir, 'buildcraft', 'assistant.json');
  let chat;
  try {
    chat = JSON.parse(fs.readFileSync(chatFile, 'utf8'));
  } catch {
    chat = { messages: [], ui: [] };
  }
  const ui = (e) => {
    chat.ui.push({ ...e, at: Date.now() });
    emit(e);
  };
  const progress = (label) => (n) => emit({ type: 'progress', text: `${label} (${n} caractères)` });
  ui({ type: 'user', text: request });

  try {
    emit({ type: 'progress', text: 'Chargement de l’IA locale…' });
    const existing = builder.listProjects(server).map((p) => p.name);
    const target = existing.find((n) => request.toLowerCase().includes(n.toLowerCase()));
    let out = await generate(server.id, {
      system: system(server),
      prompt: `${target ? `Plugin existant à modifier : ${target}\n${dump(server, target)}\n\n` : ''}Demande de l'utilisateur : ${request}`,
      schema: FILES_SCHEMA,
      onProgress: progress('L’IA écrit le code'),
    });
    let name = applyFiles(server, out, ui);
    let summary = out.summary;
    let lesson = null; // saved only once the fix really compiles

    // Build, and let the model fix compilation errors twice at most.
    for (let attempt = 0; ; attempt++) {
      ui({ type: 'action', icon: 'build', text: `Compilation de ${name}…`, pending: true });
      const r = await builder.build(server, name);
      if (r.ok) {
        ui({ type: 'action', icon: 'check', text: `${name} compilé et installé` });
        if (lesson && knowledge.remember(lesson, server.software, 'ia')) ui({ type: 'learned', text: lesson });
        break;
      }
      ui({ type: 'action', icon: 'error', text: `Erreurs de compilation (${r.errors.length || 1})`, detail: r.log.slice(0, 2000) });
      if (attempt >= 2) throw new Error('L’IA locale n’a pas réussi à corriger les erreurs de compilation. Essaie de reformuler, ou utilise Claude pour ce plugin.');
      out = await generate(server.id, {
        system: system(server),
        prompt: `Le plugin ${name} ne compile pas.\nErreurs :\n${r.log.slice(0, 4000)}\n\nFichiers actuels :\n${dump(server, name)}\n\nCorrige les erreurs et renvoie les fichiers complets corrigés. Explique la correction dans "lesson".`,
        schema: FILES_SCHEMA,
        onProgress: progress('L’IA corrige les erreurs'),
      });
      name = applyFiles(server, { ...out, plugin: name }, ui);
      lesson = out.lesson?.trim().length > 25 ? out.lesson.trim() : lesson;
      summary = out.summary || summary;
    }

    ui({ type: 'action', icon: 'restart', text: 'Redémarrage du serveur…', pending: true });
    const before = servers.logOf(server.id).length;
    try {
      await servers.restart(server.id);
    } catch (err) {
      ui({ type: 'action', icon: 'error', text: err.message });
    }
    await new Promise((r) => setTimeout(r, 1500));
    const lines = servers.logOf(server.id).slice(before);
    const problems = lines.filter((l) => /error|exception|critical/i.test(l) && l.includes(name));
    ui({ type: 'action', icon: problems.length ? 'warn' : 'check', text: problems.length ? `Le plugin signale ${problems.length} erreur(s) au démarrage` : `${name} est chargé sur le serveur` });

    const text = `${summary || `Le plugin ${name} est installé.`}${problems.length ? `\n\nAttention, la console signale :\n${problems.slice(0, 3).join('\n')}` : ''}`;
    ui({ type: 'assistant', text });
    ui({ type: 'done' });
  } catch (err) {
    ui({ type: 'error', message: sessions.get(server.id)?.controller.signal.aborted ? 'Arrêté.' : err.message });
  } finally {
    fs.mkdirSync(path.dirname(chatFile), { recursive: true });
    fs.writeFileSync(chatFile, JSON.stringify(chat));
    sessions.delete(server.id);
  }
}

/* -------------------------------------------------------------- models */

async function installModel(id) {
  if (!MODELS[id]) throw new Error('Modèle inconnu.');
  if (download) throw new Error('Un téléchargement est déjà en cours.');
  fs.mkdirSync(paths.models, { recursive: true });
  const { createModelDownloader } = await getLib();
  const downloader = await createModelDownloader({
    modelUri: MODELS[id].uri,
    dirPath: paths.models,
    fileName: MODELS[id].file,
    deleteTempFileOnCancel: false,
    onProgress: ({ totalSize, downloadedSize }) => {
      const percent = totalSize ? Math.floor((downloadedSize / totalSize) * 100) : 0;
      if (download && percent !== download.percent) {
        download.percent = percent;
        notify();
      }
    },
  });
  download = { id, downloader, percent: 0 };
  notify();
  try {
    await downloader.download();
    fs.writeFileSync(path.join(paths.models, 'choice.json'), JSON.stringify({ id }));
  } catch (err) {
    if (download?.cancelled) throw new Error('Téléchargement mis en pause.');
    throw new Error('Le téléchargement a échoué. Vérifie ta connexion : il reprendra où il s’est arrêté.');
  } finally {
    download = null;
    notify();
  }
  return status();
}

async function cancelInstall() {
  if (!download) return;
  download.cancelled = true;
  await download.downloader.cancel({ deleteTempFile: false });
}

async function useModel(id) {
  if (!fs.existsSync(modelPath(id))) throw new Error('Ce modèle n’est pas installé.');
  fs.writeFileSync(path.join(paths.models, 'choice.json'), JSON.stringify({ id }));
  await unload();
  notify();
  return status();
}

async function removeModel(id) {
  if (loaded?.id === id) await unload();
  fs.rmSync(modelPath(id), { force: true });
  notify();
  return status();
}

const cancel = (serverId) => sessions.get(serverId)?.controller.abort();
const busy = (serverId) => sessions.has(serverId);
const onStatus = (fn) => statusListeners.add(fn);

module.exports = { ask, cancel, busy, status, installModel, cancelInstall, useModel, removeModel, onStatus, MODELS, EXAMPLES };
