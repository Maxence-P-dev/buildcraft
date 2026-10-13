import { icon } from './icons.js';
import { h, toast, attempt, confirmBox, consoleLine, markdown, since, menu } from './ui.js';
import { createCodeEditor } from './editor.js';

const bc = window.bc;

const TABS = [
  { id: 'assistant', label: 'Assistant IA', icon: 'sparkle', cls: 'ai' },
  { id: 'console', label: 'Console', icon: 'terminal' },
  { id: 'plugins', label: 'Plugins', icon: 'plug' },
  { id: 'code', label: 'Code', icon: 'code' },
  { id: 'settings', label: 'Réglages', icon: 'sliders' },
];

const STATUS = { running: 'En ligne', starting: 'Démarrage…', stopping: 'Arrêt…', stopped: 'Arrêté', installing: 'Installation…', broken: 'Erreur' };
const GAMEMODES = ['Survie', 'Créatif', 'Aventure', 'Spectateur'];
const DIFFICULTIES = ['Paisible', 'Facile', 'Normal', 'Difficile'];

const IDEAS = {
  pnx: [
    ['Commande /spawn', 'Téléporte au point d’apparition, avec 5 s d’attente'],
    ['Message de bienvenue', 'Un titre et un message quand un joueur arrive'],
    ['Menu de téléportation', 'Un formulaire avec des destinations à choisir'],
    ['Protection du spawn', 'Empêche de casser des blocs près du spawn'],
  ],
  pocketmine: [
    ['Commande /spawn', 'Téléporte au point d’apparition, avec 5 s d’attente'],
    ['Message de bienvenue', 'Un message coloré quand un joueur arrive'],
    ['Commande /heal', 'Soigne et nourrit le joueur (permission op)'],
    ['Protection du spawn', 'Empêche de casser des blocs près du spawn'],
  ],
};

export function createServerView(ctx) {
  let server = null;
  let tab = 'assistant';
  let root = null;
  let headEl = null;
  let bodyEl = null;
  let consoleEl = null;
  let chat = null; // assistant panel state
  let codeState = { plugin: null, file: null, dirty: false, editor: null };
  let uptimeTimer = null;

  /* ------------------------------------------------------------ header */

  function renderHead() {
    const st = server.status;
    const running = st === 'running';
    const busy = ['starting', 'stopping', 'installing'].includes(st);
    const address = `127.0.0.1:${server.settings.port}`;
    headEl.replaceChildren(
      h(
        'div',
        { class: 'srv-top' },
        h('div', { class: `srv-badge ${server.software}` }, server.software === 'pnx' ? 'PNX' : 'PM'),
        h(
          'div',
          { class: 'srv-title' },
          h('h1', {}, server.name, h('span', { class: `status ${st}` }, STATUS[st] || st)),
          h(
            'div',
            { class: 'srv-meta' },
            h('span', { class: 'chip' }, `${server.softwareName} ${server.version}`),
            !server.maintained ? h('span', { class: 'chip warn', title: 'PocketMine-MP n’est plus maintenu' }, h('span', { html: icon('warn', 13) }), 'Plus maintenu') : null,
            h(
              'span',
              {
                class: 'chip mono click',
                title: 'Copier l’adresse',
                onclick: () => navigator.clipboard.writeText(address).then(() => toast('Adresse copiée : ajoute-la dans Minecraft, onglet Serveurs')),
              },
              h('span', { html: icon('globe', 13) }),
              address
            ),
            h('span', { class: 'chip' }, h('span', { html: icon('users', 13) }), `${server.players.length} / ${server.settings.maxPlayers}`),
            running && server.startedAt ? h('span', { class: 'chip', id: 'uptime' }, h('span', { html: icon('clock', 13) }), since(server.startedAt)) : null
          )
        ),
        h(
          'div',
          { class: 'srv-controls' },
          h('button', { class: 'btn ghost', title: 'Ouvrir le dossier du serveur', onclick: () => bc.servers.reveal(server.id), html: icon('folder', 17) }),
          running ? h('button', { class: 'btn soft', disabled: busy, onclick: () => attempt(() => bc.servers.restart(server.id)), html: icon('restart', 16) + '<span>Redémarrer</span>' }) : null,
          running || st === 'stopping'
            ? h('button', { class: 'btn danger', disabled: busy, onclick: () => attempt(() => bc.servers.stop(server.id)), html: icon('stop', 15) + '<span>Arrêter</span>' })
            : h('button', { class: 'btn primary', disabled: busy || st === 'broken', onclick: () => attempt(() => bc.servers.start(server.id)), html: icon('play', 15) + '<span>Démarrer</span>' })
        )
      ),
      h(
        'div',
        { class: 'tabs' },
        TABS.map((t) => h('button', { class: `tab ${t.cls || ''}${t.id === tab ? ' active' : ''}`, onclick: () => setTab(t.id), html: icon(t.icon, 16) + `<span>${t.label}</span>` }))
      )
    );
    clearInterval(uptimeTimer);
    if (running && server.startedAt)
      uptimeTimer = setInterval(() => {
        const el = document.getElementById('uptime');
        if (el) el.lastChild.textContent = since(server.startedAt);
      }, 30000);
  }

  function setTab(id) {
    if (tab === 'code' && codeState.dirty && !window.confirm('Des modifications ne sont pas enregistrées. Quitter quand même ?')) return;
    tab = id;
    renderHead();
    renderBody();
  }

  /* --------------------------------------------------------- assistant */

  function renderAssistant() {
    const list = h('div', { class: 'chat-inner' });
    const scroller = h('div', { class: 'chat' }, list);
    const input = h('textarea', { rows: '1', placeholder: 'Décris le plugin ou la modification que tu veux… (Entrée pour envoyer)' });
    const sendBtn = h('button', { class: 'send', title: 'Envoyer', html: icon('send', 17) });
    const providerBtn = h('button', { class: 'provider' });
    chat = { list, scroller, input, sendBtn, busy: false, streaming: null, pendingAction: null, providerBtn };

    const paintProvider = () => {
      const local = ctx.settings().provider === 'local';
      providerBtn.innerHTML = icon(local ? 'cpu' : 'sparkle', 14) + `<span>${local ? 'IA locale' : 'Claude'}</span>` + icon('chevronDown', 12);
    };
    paintProvider();
    providerBtn.addEventListener('click', () =>
      menu(providerBtn, [
        { label: 'Claude (meilleur code)', icon: 'sparkle', active: ctx.settings().provider !== 'local', action: () => ctx.setProvider('claude').then(paintProvider) },
        { label: 'IA locale (gratuite, hors ligne)', icon: 'cpu', active: ctx.settings().provider === 'local', action: () => ctx.setProvider('local').then(paintProvider) },
        { label: 'Nouvelle conversation', icon: 'restart', action: () => attempt(async () => (await bc.assistant.reset(server.id), renderBody())) },
      ])
    );

    const autosize = () => {
      input.style.height = 'auto';
      input.style.height = `${Math.min(220, input.scrollHeight)}px`;
    };
    const submit = () => {
      const text = input.value.trim();
      if (chat.busy) return attempt(() => bc.assistant.cancel(server.id));
      if (!text) return;
      input.value = '';
      autosize();
      ask(text);
    };
    input.addEventListener('input', autosize);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    });
    sendBtn.addEventListener('click', submit);

    bodyEl.replaceChildren(
      scroller,
      h('div', { class: 'composer-wrap' }, h('div', { class: 'composer' }, input, h('div', { class: 'composer-bar' }, providerBtn, h('span', { style: 'font-size:12px;color:var(--text-3)' }, 'Maj + Entrée pour aller à la ligne'), sendBtn)))
    );

    bc.assistant.history(server.id).then(async (events) => {
      if (!events.length) renderIdeas();
      else for (const e of events) addEvent(e, true);
      setBusy(await bc.assistant.busy(server.id));
      scroll(true);
    });
    setTimeout(() => input.focus(), 50);
  }

  function renderIdeas() {
    chat.list.replaceChildren(
      h(
        'div',
        { class: 'chat-empty' },
        h('div', { class: 'ai-avatar', html: icon('sparkle', 26) }),
        h('h2', {}, 'Que veux-tu créer sur ce serveur ?'),
        h('p', {}, `L’IA écrit le plugin en ${server.software === 'pnx' ? 'Java' : 'PHP'}, le compile, redémarre le serveur et corrige les erreurs toute seule. Elle retient ce qu’elle apprend.`),
        h(
          'div',
          { class: 'ideas' },
          IDEAS[server.software].map(([title, desc]) => h('button', { class: 'idea', onclick: () => ask(`${title} : ${desc}`) }, h('b', {}, title), h('span', {}, desc)))
        )
      )
    );
  }

  const scroll = (force) => {
    const s = chat.scroller;
    if (force || s.scrollHeight - s.scrollTop - s.clientHeight < 140) s.scrollTop = s.scrollHeight;
  };

  function setBusy(v) {
    chat.busy = v;
    chat.sendBtn.classList.toggle('stop', v);
    chat.sendBtn.innerHTML = icon(v ? 'stop' : 'send', v ? 15 : 17);
    chat.sendBtn.title = v ? 'Arrêter' : 'Envoyer';
    chat.list.querySelector('.thinking')?.remove();
    if (v) chat.list.append(h('div', { class: 'thinking' }, h('span', { class: 'dots' }, h('i'), h('i'), h('i')), h('span', { class: 'thinking-label' }, 'L’IA réfléchit…')));
    scroll();
  }

  async function ask(text) {
    if (chat.list.querySelector('.chat-empty')) chat.list.replaceChildren();
    await attempt(async () => {
      await bc.assistant.ask(server.id, text);
      setBusy(true);
    });
  }

  function lastActions() {
    const last = chat.list.lastElementChild?.classList.contains('thinking') ? chat.list.lastElementChild.previousElementSibling : chat.list.lastElementChild;
    if (last?.classList.contains('actions')) return last;
    const el = h('div', { class: 'actions' });
    insert(el);
    return el;
  }

  function insert(el) {
    const thinking = chat.list.querySelector('.thinking');
    if (thinking) chat.list.insertBefore(el, thinking);
    else chat.list.append(el);
  }

  function addEvent(e, replay = false) {
    if (!chat) return;
    switch (e.type) {
      case 'user':
        chat.streaming = null;
        insert(h('div', { class: 'msg-user' }, e.text));
        break;
      case 'text': {
        if (!chat.streaming) {
          const body = h('div', { class: 'ai-body' });
          chat.streaming = { body, text: '' };
          insert(h('div', { class: 'msg-ai' }, h('div', { class: 'ai-avatar', html: icon('sparkle', 16) }), body));
        }
        chat.streaming.text += e.delta;
        chat.streaming.body.innerHTML = markdown(chat.streaming.text);
        break;
      }
      case 'assistant':
        if (replay || !chat.streaming) insert(h('div', { class: 'msg-ai' }, h('div', { class: 'ai-avatar', html: icon('sparkle', 16) }), h('div', { class: 'ai-body', html: markdown(e.text) })));
        chat.streaming = null;
        break;
      case 'action': {
        chat.streaming = null;
        const box = lastActions();
        box.querySelector('.act.pending, .act.stale')?.remove();
        const cls = e.pending ? 'pending' : e.icon === 'check' ? 'ok' : e.icon === 'error' ? 'err' : e.icon === 'warn' ? 'warn' : '';
        const ic = e.pending ? 'restart' : e.icon === 'check' ? 'checkCircle' : e.icon;
        box.append(h('div', { class: `act ${replay && e.pending ? 'stale' : cls}` }, h('span', { html: icon(ic, 15) }), h('span', {}, e.text), e.lines ? h('small', {}, `${e.lines} lignes`) : null));
        if (e.detail) insert(h('div', { class: 'act-detail' }, e.detail));
        break;
      }
      case 'progress': {
        const label = chat.list.querySelector('.thinking-label');
        if (label) label.textContent = e.text;
        break;
      }
      case 'learned':
        chat.streaming = null;
        insert(h('div', { class: 'learned' }, h('span', { html: icon('brain', 16) }), h('div', {}, h('b', {}, 'Mémorisé'), e.text)));
        ctx.refreshMemoryCount();
        break;
      case 'error':
        chat.streaming = null;
        insert(h('div', { class: 'msg-error' }, e.message));
        if (!replay) setBusy(false);
        break;
      case 'done':
        chat.streaming = null;
        if (!replay) {
          setBusy(false);
          ctx.refreshServers();
        }
        break;
    }
    if (!replay) scroll();
  }

  /* ------------------------------------------------------------ console */

  function renderConsole() {
    consoleEl = h('div', { class: 'console' });
    const input = h('input', { placeholder: server.status === 'running' ? 'Tape une commande serveur (ex. help, say Bonjour, op Pseudo)…' : 'Démarre le serveur pour envoyer des commandes', spellcheck: 'false' });
    const history = [];
    let hi = -1;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        const cmd = input.value.trim().replace(/^\//, '');
        history.unshift(cmd);
        hi = -1;
        input.value = '';
        attempt(() => bc.servers.command(server.id, cmd));
      } else if (e.key === 'ArrowUp' && history.length) {
        hi = Math.min(history.length - 1, hi + 1);
        input.value = history[hi];
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        hi = Math.max(-1, hi - 1);
        input.value = hi < 0 ? '' : history[hi];
      }
    });
    bodyEl.replaceChildren(
      h(
        'div',
        { class: 'console-wrap' },
        h(
          'div',
          { class: 'console-bar' },
          h('span', { class: 'lights' }, h('i'), h('i'), h('i')),
          h('span', {}, `${server.softwareName} · ${server.name}`),
          h('span', { style: 'flex:1' }),
          h('button', { class: 'btn ghost sm', onclick: () => bc.servers.reveal(server.id, server.software === 'pnx' ? 'logs' : ''), html: icon('folder', 14) + '<span>Journaux</span>' }),
          h('button', { class: 'btn ghost sm', onclick: () => consoleEl.replaceChildren(), html: icon('trash', 14) + '<span>Effacer</span>' })
        ),
        consoleEl,
        h('div', { class: 'console-input' }, h('span', {}, '>'), input)
      )
    );
    bc.servers.log(server.id).then((lines) => {
      if (!lines.length) consoleEl.append(consoleLine('§8Le serveur n’a pas encore démarré depuis l’ouverture de BuildCraft.'));
      appendLog(lines);
      consoleEl.scrollTop = consoleEl.scrollHeight;
    });
    setTimeout(() => input.focus(), 50);
  }

  function appendLog(lines) {
    if (!consoleEl) return;
    const stick = consoleEl.scrollHeight - consoleEl.scrollTop - consoleEl.clientHeight < 60;
    const frag = document.createDocumentFragment();
    for (const l of lines) frag.append(consoleLine(l));
    consoleEl.append(frag);
    while (consoleEl.childElementCount > 3000) consoleEl.firstChild.remove();
    if (stick) consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  /* ------------------------------------------------------------ plugins */

  async function renderPlugins() {
    const list = await bc.servers.plugins(server.id);
    const kb = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);
    bodyEl.replaceChildren(
      h(
        'div',
        { class: 'pad' },
        h(
          'div',
          { class: 'section-title' },
          h('div', {}, h('h3', {}, 'Plugins installés'), h('p', {}, 'Les plugins créés par l’IA portent l’étiquette BuildCraft. Redémarre le serveur après un changement.')),
          h('button', { class: 'btn ai', onclick: () => setTab('assistant'), html: icon('sparkle', 16) + '<span>Créer avec l’IA</span>' })
        ),
        h(
          'div',
          { class: 'card' },
          list.length
            ? list.map((p) =>
                h(
                  'div',
                  { class: 'plugin-row' },
                  h('div', { class: `plugin-ic${p.own ? ' own' : ''}`, html: icon(p.own ? 'sparkle' : 'plug', 17) }),
                  h('div', { class: 'txt' }, h('div', { class: 'name-line' }, h('b', {}, p.name), p.own ? h('span', { class: 'tag' }, 'BuildCraft') : null), h('span', {}, `${p.file} · ${kb(p.size)} · modifié il y a ${since(p.modified)}`)),
                  p.own ? h('button', { class: 'btn ghost sm', onclick: () => ((codeState.plugin = p.name), (codeState.file = null), setTab('code')), html: icon('code', 14) + '<span>Code</span>' }) : null,
                  h('button', {
                    class: 'icon-btn sm',
                    title: 'Supprimer',
                    html: icon('trash', 15),
                    onclick: async () => {
                      if (!(await confirmBox({ title: `Supprimer ${p.name} ?`, text: p.own ? 'Le plugin installé et son code source BuildCraft seront supprimés.' : 'Le fichier du plugin sera supprimé du serveur.', ok: 'Supprimer', danger: true }))) return;
                      await attempt(() => bc.servers.uninstall(server.id, p.file, p.own));
                      renderPlugins();
                    },
                  })
                )
              )
            : h('div', { class: 'empty-box' }, h('div', { html: icon('plug', 28) }), 'Aucun plugin pour l’instant. Demande-en un à l’assistant IA.')
        ),
        h('p', { style: 'color:var(--text-3);font-size:12.5px;margin-top:12px' }, 'Tu peux aussi déposer des plugins téléchargés (.jar ou .phar) dans le dossier plugins du serveur.'),
        h('button', { class: 'btn soft sm', onclick: () => bc.servers.reveal(server.id, 'plugins'), html: icon('folder', 14) + '<span>Ouvrir le dossier plugins</span>' })
      )
    );
  }

  /* --------------------------------------------------------------- code */

  async function renderCode() {
    const projects = await bc.projects.list(server.id);
    if (!projects.length) {
      bodyEl.replaceChildren(h('div', { class: 'pad' }, h('div', { class: 'card empty-box' }, h('div', { html: icon('code', 28) }), 'Aucun plugin BuildCraft sur ce serveur. Demande à l’assistant IA d’en créer un, puis retrouve son code ici.')));
      return;
    }
    if (!codeState.plugin || !projects.some((p) => p.name === codeState.plugin)) codeState.plugin = projects[0].name;
    const proj = projects.find((p) => p.name === codeState.plugin);
    if (!codeState.file || !proj.files.includes(codeState.file)) codeState.file = proj.files.find((f) => /Main\.(java|php)$/.test(f)) || proj.files[0];

    const tree = h('div', { class: 'file-tree' });
    for (const p of projects) {
      tree.append(h('div', { class: 'tree-plugin' }, p.name));
      for (const f of p.files) {
        tree.append(
          h(
            'button',
            {
              class: `tree-file${p.name === codeState.plugin && f === codeState.file ? ' active' : ''}`,
              title: f,
              onclick: () => {
                if (codeState.dirty && !window.confirm('Des modifications ne sont pas enregistrées. Continuer ?')) return;
                codeState.plugin = p.name;
                codeState.file = f;
                renderCode();
              },
            },
            h('span', { html: icon('file', 14) }),
            f.split('/').pop()
          )
        );
      }
    }
    const pathEl = h('span', {}, `${codeState.plugin} / ${codeState.file}`);
    const saveBtn = h('button', { class: 'btn ghost sm', html: icon('save', 14) + '<span>Enregistrer</span>' });
    const buildBtn = h('button', { class: 'btn primary sm', html: icon('build', 14) + '<span>Compiler et installer</span>' });
    const out = h('div', { class: 'build-out', hidden: true });
    const host = h('div', { class: 'editor-host' });
    bodyEl.replaceChildren(h('div', { class: 'code-view' }, tree, h('div', { class: 'editor-pane' }, h('div', { class: 'editor-bar' }, pathEl, h('span', { class: 'spacer' }), saveBtn, buildBtn), host, out)));

    const save = async () => {
      await attempt(() => bc.projects.write(server.id, codeState.plugin, codeState.file, codeState.editor.value()));
      codeState.dirty = false;
      pathEl.textContent = `${codeState.plugin} / ${codeState.file}`;
    };
    codeState.editor = createCodeEditor(host, {
      onChange: () => {
        codeState.dirty = true;
        pathEl.textContent = `${codeState.plugin} / ${codeState.file} •`;
      },
      onSave: () => save().then(() => toast('Enregistré')),
    });
    codeState.editor.load(codeState.file, await bc.projects.read(server.id, codeState.plugin, codeState.file));
    codeState.dirty = false;
    saveBtn.addEventListener('click', () => save().then(() => toast('Enregistré')));
    buildBtn.addEventListener('click', async () => {
      if (codeState.dirty) await save();
      buildBtn.disabled = true;
      out.hidden = false;
      out.className = 'build-out';
      out.textContent = 'Compilation…';
      const r = await attempt(() => bc.projects.build(server.id, codeState.plugin));
      buildBtn.disabled = false;
      if (!r) return (out.hidden = true);
      out.className = `build-out ${r.ok ? 'ok' : 'err'}`;
      out.textContent = r.ok ? `${r.log}\n\nRedémarre le serveur pour charger la nouvelle version.` : r.log;
    });
  }

  /* ----------------------------------------------------------- settings */

  function renderSettings() {
    const s = { ...server.settings };
    const field = (label, control, hint) => h('div', { class: 'field' }, h('label', {}, label), control, hint ? h('div', { class: 'hint' }, hint) : null);
    const text = (key, attrs = {}) => {
      const el = h('input', { class: 'input', value: s[key], ...attrs });
      el.addEventListener('input', () => (s[key] = attrs.type === 'number' ? Number(el.value) : el.value));
      return el;
    };
    const select = (key, options) => {
      const el = h('select', { class: 'select' }, options.map((o, i) => h('option', { value: i, selected: Number(s[key]) === i }, o)));
      el.addEventListener('change', () => (s[key] = Number(el.value)));
      return el;
    };
    const toggle = (key, title, desc) => {
      const cb = h('input', { type: 'checkbox', checked: !!s[key] });
      cb.addEventListener('change', () => (s[key] = cb.checked));
      return h('div', { class: 'toggle-row' }, h('div', {}, h('b', {}, title), h('span', {}, desc)), h('label', { class: 'switch' }, cb, h('span')));
    };
    const name = h('input', { class: 'input', value: server.name });
    const memory = h('select', { class: 'select' }, [1024, 2048, 3072, 4096, 6144, 8192].filter((m) => m < ctx.info().ram).map((m) => h('option', { value: m, selected: server.memory === m }, `${m / 1024} Go`)));

    bodyEl.replaceChildren(
      h(
        'div',
        { class: 'pad' },
        h(
          'div',
          { class: 'settings-page' },
          h(
            'div',
            { class: 'card' },
            h('h3', { html: icon('server', 18) + 'Serveur' }),
            h('p', { class: 'lead' }, 'Les changements s’appliquent au prochain démarrage du serveur.'),
            h(
              'div',
              { class: 'form-grid' },
              field('Nom dans BuildCraft', name),
              field('Message affiché dans Minecraft (MOTD)', text('motd')),
              field('Port', text('port', { type: 'number', min: 1024, max: 65535 }), 'Par défaut 19132. Chaque serveur lancé en même temps a besoin du sien.'),
              field('Joueurs maximum', text('maxPlayers', { type: 'number', min: 1, max: 500 })),
              field('Mode de jeu', select('gamemode', GAMEMODES)),
              field('Difficulté', select('difficulty', DIFFICULTIES)),
              field('Distance de vue', text('viewDistance', { type: 'number', min: 4, max: 32 }), 'En chunks. Plus c’est grand, plus le serveur travaille.'),
              server.software === 'pnx' ? field('Mémoire pour le serveur', memory) : null
            ),
            h('div', { style: 'margin-top:12px' }),
            toggle('pvp', 'PvP', 'Les joueurs peuvent s’attaquer entre eux.'),
            toggle('whitelist', 'Liste blanche', 'Seuls les joueurs autorisés peuvent entrer (commande whitelist add Pseudo).'),
            toggle('onlineMode', 'Vérification Xbox', 'Recommandé : vérifie que les joueurs sont connectés à leur compte Microsoft.'),
            h(
              'div',
              { class: 'modal-actions' },
              h('button', {
                class: 'btn primary',
                html: icon('save', 15) + '<span>Enregistrer</span>',
                onclick: () =>
                  attempt(async () => {
                    server = await bc.servers.update(server.id, { name: name.value, settings: s, memory: Number(memory.value) || server.memory });
                    toast(server.status === 'running' ? 'Enregistré : redémarre le serveur pour appliquer' : 'Réglages enregistrés');
                    ctx.refreshServers();
                  }),
              })
            )
          ),
          h(
            'div',
            { class: 'card' },
            h('h3', { html: icon('globe', 18) + 'Rejoindre le serveur' }),
            h('p', { class: 'lead' }, 'Dans Minecraft Bedrock : Jouer → Serveurs → Ajouter un serveur.'),
            h(
              'div',
              { class: 'form-grid' },
              field('Sur ce PC', h('input', { class: 'input mono', value: `127.0.0.1  ·  port ${server.settings.port}`, readonly: true })),
              field('Depuis un autre appareil du réseau', h('input', { class: 'input mono', value: `${ctx.lanAddress()}  ·  port ${server.settings.port}`, readonly: true }), 'Pour des amis sur Internet, il faut ouvrir le port sur ta box.')
            )
          ),
          h(
            'div',
            { class: 'card danger-zone' },
            h('h3', { html: icon('trash', 18) + 'Supprimer le serveur' }),
            h('p', { class: 'lead' }, 'Le dossier du serveur (mondes, plugins, réglages) part dans la corbeille.'),
            h('button', {
              class: 'btn danger',
              onclick: async () => {
                if (!(await confirmBox({ title: `Supprimer « ${server.name} » ?`, text: 'Le serveur sera arrêté et son dossier déplacé dans la corbeille.', ok: 'Supprimer', danger: true }))) return;
                await attempt(async () => {
                  await bc.servers.remove(server.id);
                  toast('Serveur déplacé dans la corbeille');
                  ctx.refreshServers(null);
                });
              },
              html: icon('trash', 15) + '<span>Supprimer ce serveur</span>',
            })
          )
        )
      )
    );
  }

  /* --------------------------------------------------------------- body */

  function renderBody() {
    consoleEl = null;
    chat = null;
    bodyEl.replaceChildren();
    if (tab === 'assistant') renderAssistant();
    else if (tab === 'console') renderConsole();
    else if (tab === 'plugins') renderPlugins();
    else if (tab === 'code') renderCode();
    else renderSettings();
  }

  return {
    show(s, { tab: wanted } = {}) {
      const changed = !server || server.id !== s.id;
      server = s;
      if (wanted) tab = wanted;
      if (changed) codeState = { plugin: null, file: null, dirty: false, editor: null };
      root = h('div', { class: 'view' });
      headEl = h('div', { class: 'srv-head' });
      bodyEl = h('div', { class: 'view' });
      root.append(headEl, bodyEl);
      ctx.mount(root);
      renderHead();
      renderBody();
    },
    update(s) {
      if (!server || s.id !== server.id) return;
      const statusChanged = s.status !== server.status;
      server = s;
      renderHead();
      if (statusChanged && tab === 'console') {
        const input = bodyEl.querySelector('.console-input input');
        if (input) input.placeholder = s.status === 'running' ? 'Tape une commande serveur (ex. help, say Bonjour, op Pseudo)…' : 'Démarre le serveur pour envoyer des commandes';
      }
    },
    log(id, lines) {
      if (server && id === server.id) appendLog(lines);
    },
    assistant(id, e) {
      if (server && id === server.id) addEvent(e);
    },
    current: () => server,
  };
}
