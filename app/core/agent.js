'use strict';

// The coding assistant powered by Claude: a tool-use loop that writes plugin code,
// builds it, restarts the server, reads the console and fixes errors on its own.

const fs = require('fs');
const path = require('path');
const servers = require('./servers');
const builder = require('./builder');
const knowledge = require('./knowledge');
const { SOFTWARE, GAMEMODES } = require('./software');

const MODEL = 'claude-opus-5-5';
const MAX_TURNS = 40;

let Anthropic = null;
const sdk = () => (Anthropic = Anthropic || require('@anthropic-ai/sdk').default);
const sessions = new Map(); // serverId -> { controller }

/* --------------------------------------------------------------- tools */

const str = (description) => ({ type: 'string', description });
const tool = (name, description, properties = {}, required = Object.keys(properties)) => ({
  name,
  description,
  eager_input_streaming: true,
  input_schema: { type: 'object', properties, required },
});

const TOOLS = [
  tool('create_plugin', 'Crée un nouveau projet de plugin à partir du modèle BuildCraft (plugin.yml + classe principale). Ne fait rien si le plugin existe déjà.', {
    name: str('Nom du plugin en PascalCase, lettres et chiffres uniquement (ex. SpawnTeleport).'),
    description: str('Description courte du plugin.'),
  }),
  tool('list_files', 'Liste les fichiers d’un plugin.', { plugin: str('Nom du plugin.') }),
  tool('read_file', 'Lit un fichier d’un plugin.', { plugin: str('Nom du plugin.'), path: str('Chemin relatif au plugin, ex. src/main/resources/plugin.yml.') }),
  tool('write_file', 'Écrit (ou remplace entièrement) un fichier d’un plugin. Donne toujours le contenu complet.', {
    plugin: str('Nom du plugin.'),
    path: str('Chemin relatif au plugin.'),
    content: str('Contenu complet du fichier.'),
  }),
  tool('delete_file', 'Supprime un fichier d’un plugin.', { plugin: str('Nom du plugin.'), path: str('Chemin relatif au plugin.') }),
  tool('build', 'Compile le plugin et l’installe dans le dossier plugins du serveur. Renvoie les erreurs de compilation avec fichier et ligne.', { plugin: str('Nom du plugin.') }),
  tool('restart_server', 'Redémarre le serveur (ou le démarre) pour charger les plugins installés, attend qu’il soit prêt et renvoie la console du démarrage.'),
  tool('server_log', 'Renvoie les dernières lignes de la console du serveur.', { lines: { type: 'integer', description: 'Nombre de lignes (max 300).' } }, []),
  tool('run_command', 'Exécute une commande dans la console du serveur (sans le /) et renvoie la sortie des secondes suivantes.', { command: str('Commande, ex. « hello » ou « say test ».') }),
  tool('search_docs', 'Cherche dans la base de connaissances : guides intégrés, pages lues et leçons apprises.', { query: str('Recherche.') }),
  tool('api_lookup', 'Consulte la vraie API du serveur : donne les signatures exactes d’une classe (nom simple ou complet), ou la liste des classes correspondantes.', { query: str('Nom de classe, ex. PlayerJoinEvent ou org.powernukkitx.Player.') }),
  tool('read_web_page', 'Lit une page de documentation sur le web et renvoie son texte. save=true la garde dans la base de connaissances.', {
    url: str('Adresse de la page.'),
    save: { type: 'boolean', description: 'Garder la page dans la base de connaissances.' },
  }, ['url']),
  tool('remember', 'Enregistre une leçon durable pour les prochaines fois (cause d’une erreur et solution, détail d’API piégeux). Une phrase ou deux, précise et réutilisable.', { lesson: str('La leçon.') }),
  tool('set_server_settings', 'Modifie les réglages du serveur. Ne donne que les champs à changer.', {
    motd: str('Nom affiché dans la liste des serveurs.'),
    maxPlayers: { type: 'integer' },
    gamemode: { type: 'integer', description: '0 survie, 1 créatif, 2 aventure, 3 spectateur.' },
    difficulty: { type: 'integer', description: '0 paisible, 1 facile, 2 normal, 3 difficile.' },
    pvp: { type: 'boolean' },
    whitelist: { type: 'boolean' },
  }, []),
];

const clip = (s, n = 8000) => (s.length > n ? `${s.slice(0, n / 2)}\n… (${s.length - n} caractères coupés) …\n${s.slice(-n / 2)}` : s);

function requireStrings(input, keys) {
  for (const k of keys) if (typeof input?.[k] !== 'string' || !input[k].length) throw new Error(`Paramètre manquant ou invalide : ${k}`);
}

async function runTool(server, name, input, emit) {
  const sv = () => servers.get(server.id);
  switch (name) {
    case 'create_plugin': {
      requireStrings(input, ['name']);
      const n = builder.scaffold(sv(), input.name, input.description);
      emit({ type: 'action', icon: 'plugin', text: `Plugin ${n} créé` });
      return `Projet ${n} prêt. Fichiers :\n${builder.listFiles(sv(), n).join('\n')}`;
    }
    case 'list_files':
      requireStrings(input, ['plugin']);
      return builder.listFiles(sv(), input.plugin).join('\n') || '(aucun fichier)';
    case 'read_file':
      requireStrings(input, ['plugin', 'path']);
      return clip(builder.readFile(sv(), input.plugin, input.path), 30000);
    case 'write_file': {
      requireStrings(input, ['plugin', 'path']);
      if (typeof input.content !== 'string') throw new Error('Paramètre manquant : content');
      const rel = builder.writeFile(sv(), input.plugin, input.path, input.content);
      emit({ type: 'action', icon: 'file', text: `Écrit ${input.plugin}/${rel}`, lines: input.content.split('\n').length });
      return `Fichier écrit : ${rel} (${input.content.length} caractères)`;
    }
    case 'delete_file':
      requireStrings(input, ['plugin', 'path']);
      builder.deleteFile(sv(), input.plugin, input.path);
      emit({ type: 'action', icon: 'trash', text: `Supprimé ${input.plugin}/${input.path}` });
      return 'Fichier supprimé.';
    case 'build': {
      requireStrings(input, ['plugin']);
      emit({ type: 'action', icon: 'build', text: `Compilation de ${input.plugin}…`, pending: true });
      const r = await builder.build(sv(), input.plugin);
      emit({ type: 'action', icon: r.ok ? 'check' : 'error', text: r.ok ? `${input.plugin} compilé et installé` : `Erreurs de compilation (${r.errors.length || 1})`, detail: r.ok ? null : clip(r.log, 2000) });
      return r.ok ? `SUCCÈS. ${r.log}` : `ÉCHEC de la compilation.\n${clip(r.log)}`;
    }
    case 'restart_server': {
      emit({ type: 'action', icon: 'restart', text: 'Redémarrage du serveur…', pending: true });
      const before = servers.logOf(server.id).length;
      let failure = null;
      try {
        await servers.restart(server.id);
      } catch (err) {
        failure = err.message;
      }
      await new Promise((r) => setTimeout(r, 1500));
      const lines = servers.logOf(server.id).slice(before);
      const problems = lines.filter((l) => /error|exception|critical|could not|failed|impossible/i.test(l));
      emit({ type: 'action', icon: failure ? 'error' : problems.length ? 'warn' : 'check', text: failure ? 'Le serveur n’a pas démarré' : problems.length ? `Serveur démarré, ${problems.length} alerte(s) dans la console` : 'Serveur démarré sans erreur' });
      return `${failure ? `ÉCHEC : ${failure}\n` : 'Serveur prêt.\n'}Console du démarrage :\n${clip(lines.join('\n'), 12000)}`;
    }
    case 'server_log': {
      const n = Math.min(300, Math.max(10, Number(input?.lines) || 80));
      return servers.logOf(server.id).slice(-n).join('\n') || '(console vide : le serveur n’a pas encore tourné)';
    }
    case 'run_command': {
      requireStrings(input, ['command']);
      const before = servers.logOf(server.id).length;
      servers.command(server.id, input.command.replace(/^\//, ''));
      emit({ type: 'action', icon: 'terminal', text: `Commande : ${input.command}` });
      await new Promise((r) => setTimeout(r, 2500));
      return servers.logOf(server.id).slice(before).join('\n') || '(aucune sortie)';
    }
    case 'search_docs': {
      requireStrings(input, ['query']);
      const hits = knowledge.search(input.query, server.software, 6);
      emit({ type: 'action', icon: 'book', text: `Recherche dans la doc : ${input.query}` });
      return hits.length ? hits.map((h) => `### ${h.kind === 'lesson' ? 'Leçon' : h.title}${h.url ? ` (${h.url})` : ''}\n${h.text}`).join('\n\n') : 'Aucun résultat.';
    }
    case 'api_lookup': {
      requireStrings(input, ['query']);
      emit({ type: 'action', icon: 'api', text: `Lecture de l’API : ${input.query}` });
      return await knowledge.apiLookup(sv(), input.query);
    }
    case 'read_web_page': {
      requireStrings(input, ['url']);
      if (!/^https?:\/\//i.test(input.url)) throw new Error('Adresse invalide.');
      emit({ type: 'action', icon: 'web', text: `Lecture de ${input.url}` });
      if (input.save) {
        const r = await knowledge.addUrl(input.url, server.software);
        emit({ type: 'learned', text: `Page ajoutée à la mémoire : ${r.title}` });
      }
      const res = await fetch(input.url, { headers: { 'User-Agent': 'BuildCraft (documentation reader)' } });
      if (!res.ok) throw new Error(`Page inaccessible (${res.status}).`);
      const body = await res.text();
      return clip(/html/.test(res.headers.get('content-type') || '') ? knowledge.htmlToText(body) : body, 20000);
    }
    case 'remember': {
      requireStrings(input, ['lesson']);
      const l = knowledge.remember(input.lesson, server.software, 'ia');
      if (l) emit({ type: 'learned', text: input.lesson });
      return l ? 'Leçon enregistrée.' : 'Cette leçon était déjà connue.';
    }
    case 'set_server_settings': {
      const allowed = ['motd', 'maxPlayers', 'gamemode', 'difficulty', 'pvp', 'whitelist'];
      const patch = Object.fromEntries(Object.entries(input || {}).filter(([k]) => allowed.includes(k)));
      servers.update(server.id, { settings: patch });
      emit({ type: 'action', icon: 'settings', text: 'Réglages du serveur modifiés' });
      return `Réglages appliqués : ${JSON.stringify(patch)}. Ils prennent effet au prochain démarrage.`;
    }
    default:
      throw new Error(`Outil inconnu : ${name}`);
  }
}

/* -------------------------------------------------------------- prompt */

function systemPrompt(server, request) {
  const sw = SOFTWARE[server.software];
  const projects = builder.listProjects(server).map((p) => p.name);
  const lessons = knowledge.lessonsFor(server.software, request);
  return `Tu es l'assistant de BuildCraft, une application qui crée et fait tourner de vrais serveurs Minecraft Bedrock. Tu écris des plugins pour le serveur de l'utilisateur, tu les compiles, tu les testes sur le serveur et tu corriges jusqu'à ce qu'ils fonctionnent.

Serveur : « ${server.name} »
Logiciel : ${sw.name} ${server.version} (plugins en ${sw.language}, API ${sw.api}${server.software === 'pnx' ? ', Java 25, paquet org.powernukkitx' : ', PHP 8.4'})
Réglages : port ${server.settings.port}, ${server.settings.maxPlayers} joueurs max, mode ${GAMEMODES[server.settings.gamemode]}, difficulté ${server.settings.difficulty}, PvP ${server.settings.pvp ? 'oui' : 'non'}.
Plugins BuildCraft existants : ${projects.length ? projects.join(', ') : 'aucun'}.

Méthode de travail :
1. Si tu n'es pas sûr d'une classe ou d'une méthode, vérifie avec api_lookup (c'est la vraie API installée) ou search_docs avant d'écrire. Les tutoriels du web sont souvent périmés.
2. Crée le plugin avec create_plugin (ou travaille sur un plugin existant), puis écris chaque fichier en entier avec write_file.
3. Lance build et corrige toutes les erreurs jusqu'au succès.
4. Lance restart_server et vérifie dans la console que le plugin est chargé (« Enabling … ») sans erreur. Si la console montre une erreur, corrige et recommence.
5. Si une commande peut se tester depuis la console, teste-la avec run_command.
6. Quand tu as appris quelque chose de non évident (cause d'une erreur et solution, piège de l'API), enregistre-le avec remember pour ne plus refaire l'erreur.
7. Termine par un message court en français pour l'utilisateur : ce que fait le plugin, comment l'utiliser en jeu (commandes, permissions), et ce qui reste à faire s'il y a lieu. Pas de code dans ce message.

Règles : un code propre, commenté sobrement, en ${sw.language} moderne. Messages en jeu en français. Ne touche qu'aux plugins BuildCraft. Si la demande est floue, fais un choix raisonnable et dis-le.
${lessons.length ? `\nLeçons apprises lors des sessions précédentes :\n${lessons.map((l) => `- ${l}`).join('\n')}` : ''}`;
}

/* ---------------------------------------------------------------- loop */

const chatFile = (server) => path.join(server.dir, 'buildcraft', 'assistant.json');

function loadChat(server) {
  try {
    return JSON.parse(fs.readFileSync(chatFile(server), 'utf8'));
  } catch {
    return { messages: [], ui: [] };
  }
}

function saveChat(server, chat) {
  fs.mkdirSync(path.dirname(chatFile(server)), { recursive: true });
  fs.writeFileSync(chatFile(server), JSON.stringify(chat));
}

function friendly(err) {
  const A = sdk();
  if (err instanceof A.APIUserAbortError || err?.name === 'AbortError') return 'Arrêté.';
  if (err instanceof A.AuthenticationError) return 'Clé API refusée : vérifie-la dans les paramètres.';
  if (err instanceof A.RateLimitError) return 'Trop de demandes d’un coup, réessaie dans un instant.';
  if (err instanceof A.BadRequestError && /credit|billing|balance/i.test(err.message)) return 'Crédit insuffisant sur ton compte Anthropic.';
  if (err instanceof A.APIConnectionError) return 'Pas de connexion Internet.';
  if (err instanceof A.InternalServerError) return 'Claude est momentanément indisponible.';
  if (err instanceof A.APIError) return `Erreur de l’API (${err.status}).`;
  return err?.message || 'Erreur inattendue.';
}

/**
 * Runs one user request to completion. `emit(event)` streams progress to the UI:
 * { type: 'text', delta } | { type: 'action', ... } | { type: 'learned', text } | { type: 'done' } | { type: 'error', message }
 */
async function ask(server, request, apiKey, emit) {
  if (sessions.has(server.id)) throw new Error('L’assistant travaille déjà sur ce serveur.');
  const controller = new AbortController();
  sessions.set(server.id, { controller });
  const chat = loadChat(server);
  const ui = (e) => {
    chat.ui.push({ ...e, at: Date.now() });
    emit(e);
  };
  ui({ type: 'user', text: request });
  chat.messages.push({ role: 'user', content: request });
  const client = new (sdk())({ apiKey, maxRetries: 3 });
  const system = systemPrompt(server, request);

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const stream = client.beta.messages.stream(
        {
          model: MODEL,
          max_tokens: 32000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'high' },
          cache_control: { type: 'ephemeral' },
          system,
          tools: TOOLS,
          messages: chat.messages,
        },
        { signal: controller.signal }
      );
      let text = '';
      stream.on('text', (delta) => {
        text += delta;
        emit({ type: 'text', delta });
      });
      let message;
      try {
        message = await stream.finalMessage();
      } catch (err) {
        if (err instanceof sdk().APIError || controller.signal.aborted) throw err;
        if (turn < MAX_TURNS - 1) continue; // tool input could not be parsed: re-issue the turn
        throw err;
      }
      if (text.trim()) chat.ui.push({ type: 'assistant', text, at: Date.now() });
      chat.messages.push({ role: 'assistant', content: message.content });
      saveChat(server, chat);

      if (message.stop_reason === 'refusal') throw new Error('Claude a refusé cette demande.');
      if (message.stop_reason === 'pause_turn') continue;
      const calls = message.content.filter((b) => b.type === 'tool_use');
      if (!calls.length) break;
      if (message.stop_reason === 'max_tokens') throw new Error('La réponse était trop longue. Découpe la demande en étapes.');

      const results = [];
      for (const call of calls) {
        let content;
        let isError = false;
        try {
          content = await runTool(server, call.name, call.input, ui);
        } catch (err) {
          content = `Erreur : ${err.message}`;
          isError = true;
        }
        results.push({ type: 'tool_result', tool_use_id: call.id, content: String(content), ...(isError ? { is_error: true } : {}) });
      }
      chat.messages.push({ role: 'user', content: results });
      saveChat(server, chat);
    }
    ui({ type: 'done' });
  } catch (err) {
    // Keep the conversation valid: drop a trailing assistant turn whose tools were never answered.
    const last = chat.messages[chat.messages.length - 1];
    if (last?.role === 'assistant' && Array.isArray(last.content) && last.content.some((b) => b.type === 'tool_use')) chat.messages.pop();
    ui({ type: 'error', message: friendly(err) });
  } finally {
    saveChat(server, chat);
    sessions.delete(server.id);
  }
}

function cancel(serverId) {
  sessions.get(serverId)?.controller.abort();
}

const busy = (serverId) => sessions.has(serverId);
const history = (server) => loadChat(server).ui;

function reset(server) {
  if (sessions.has(server.id)) throw new Error('L’assistant travaille encore.');
  fs.rmSync(chatFile(server), { force: true });
}

async function checkKey(apiKey) {
  const client = new (sdk())({ apiKey, maxRetries: 1 });
  await client.models.retrieve(MODEL);
  return true;
}

module.exports = { ask, cancel, busy, history, reset, checkKey, friendly, runTool, systemPrompt, MODEL };
