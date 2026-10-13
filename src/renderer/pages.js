import { icon, LOGO } from './icons.js';
import { h, toast, attempt, confirmBox, modal } from './ui.js';

const bc = window.bc;
const GAMEMODES = ['Survie', 'Créatif', 'Aventure', 'Spectateur'];
const DIFFICULTIES = ['Paisible', 'Facile', 'Normal', 'Difficile'];

/* ============================================================= welcome */

export function welcome(ctx) {
  return h(
    'div',
    { class: 'welcome' },
    h(
      'div',
      { class: 'welcome-card' },
      h('div', { html: LOGO }),
      h('h1', { html: 'Crée ton serveur <em>Bedrock</em>,<br>l’IA code le reste.' }),
      h('p', {}, 'BuildCraft installe un vrai serveur Minecraft Bedrock sur ton PC, puis une IA écrit, compile et teste les plugins que tu lui décris.'),
      h('button', { class: 'btn primary lg', onclick: () => newServer(ctx), html: icon('plus', 18) + '<span>Créer mon premier serveur</span>' }),
      h(
        'div',
        { class: 'steps' },
        [
          ['Choisis ton logiciel', 'PowerNukkitX (recommandé) ou PocketMine-MP. Java ou PHP sont installés pour toi.'],
          ['Décris ce que tu veux', '« Un /spawn avec 5 s d’attente », « un menu de téléportation »… en français.'],
          ['Joue tout de suite', 'L’IA compile, installe et redémarre. Connecte-toi depuis Minecraft.'],
        ].map(([b, s], i) => h('div', { class: 'card step' }, h('div', { class: 'num' }, `0${i + 1}`), h('b', {}, b), h('span', {}, s)))
      )
    )
  );
}

/* ======================================================= new server */

export function newServer(ctx) {
  const software = ctx.info().software;
  let choice = 'pnx';
  const ram = ctx.info().ram;
  modal(
    (box, close) => {
      const grid = h('div', { class: 'choice-grid' });
      let memField = null;
      const paint = () => {
        for (const c of grid.querySelectorAll('.choice')) c.classList.toggle('on', c.dataset.id === choice);
        warn.hidden = choice !== 'pocketmine';
        if (memField) memField.style.visibility = choice === 'pnx' ? '' : 'hidden';
      };
      software.forEach((sw) =>
        grid.append(
          h(
            'button',
            { class: 'choice', 'data-id': sw.id, onclick: () => ((choice = sw.id), paint()) },
            h('span', { class: `badge ${sw.maintained ? 'rec' : 'old'}` }, sw.maintained ? 'Recommandé' : 'Plus maintenu'),
            h('div', { class: 'choice-head' }, h('div', { class: `srv-badge ${sw.id}` }, sw.id === 'pnx' ? 'PNX' : 'PM'), h('div', {}, h('b', {}, sw.name), h('div', { style: 'font-size:12px;color:var(--text-3)' }, `Plugins en ${sw.language}`))),
            h('p', {}, sw.blurb)
          )
        )
      );
      const warn = h(
        'div',
        { class: 'notice warn', hidden: true },
        h('span', { html: icon('warn', 16) }),
        h('span', {}, 'PocketMine-MP n’est plus mis à jour depuis juillet 2026 : quand Minecraft sortira une nouvelle version, les joueurs à jour ne pourront plus se connecter. Préfère PowerNukkitX pour un serveur durable.')
      );
      const name = h('input', { class: 'input', value: 'Mon serveur', maxlength: 60 });
      const port = h('input', { class: 'input', type: 'number', value: ctx.freePort(), min: 1024, max: 65535 });
      const mode = h('select', { class: 'select' }, GAMEMODES.map((g, i) => h('option', { value: i }, g)));
      const diff = h('select', { class: 'select' }, DIFFICULTIES.map((d, i) => h('option', { value: i, selected: i === 1 }, d)));
      const players = h('input', { class: 'input', type: 'number', value: 20, min: 1, max: 500 });
      const memory = h('select', { class: 'select' }, [1024, 2048, 3072, 4096, 6144].filter((m) => m < ram * 0.6).map((m) => h('option', { value: m, selected: m === 2048 }, `${m / 1024} Go`)));
      const field = (label, el) => h('div', { class: 'field' }, h('label', {}, label), el);
      const createBtn = h('button', { class: 'btn primary', html: icon('zap', 16) + '<span>Créer le serveur</span>' });
      createBtn.addEventListener('click', () => {
        close();
        install(ctx, {
          name: name.value.trim() || 'Mon serveur',
          software: choice,
          memory: Number(memory.value) || 2048,
          settings: { port: Number(port.value) || 19132, gamemode: Number(mode.value), difficulty: Number(diff.value), maxPlayers: Number(players.value) || 20, motd: name.value.trim() || 'Mon serveur' },
        });
      });
      box.append(
        h('h2', {}, 'Nouveau serveur'),
        h('p', { class: 'sub' }, 'Choisis le logiciel serveur. BuildCraft télécharge tout ce qu’il faut.'),
        grid,
        h('div', { style: 'height:12px' }),
        warn,
        h('div', { style: 'height:16px' }),
        h('div', { class: 'form-grid' }, field('Nom du serveur', name), field('Port', port), field('Mode de jeu', mode), field('Difficulté', diff), field('Joueurs maximum', players), (memField = field('Mémoire allouée', memory))),
        h('div', { class: 'modal-actions' }, h('button', { class: 'btn ghost', onclick: close }, 'Annuler'), createBtn)
      );
      paint();
      setTimeout(() => (name.focus(), name.select()), 60);
    },
    { wide: true }
  );
}

function install(ctx, opts) {
  const steps = [];
  let listEl;
  let detailEl;
  let unsubscribe = () => {};
  const close = modal(
    (box) => {
      listEl = h('div', { class: 'install-steps' });
      detailEl = h('div', { class: 'progress', style: 'margin-top:14px' }, h('i', { style: 'width:0%' }));
      box.append(h('h2', {}, `Création de « ${opts.name} »`), h('p', { class: 'sub' }, 'La première fois, BuildCraft télécharge Java ou PHP : cela peut prendre une minute ou deux.'), listEl, detailEl);
    },
    { dismissable: false }
  );
  const paint = () => {
    listEl.replaceChildren(...steps.map((s, i) => h('div', { class: `install-step ${i === steps.length - 1 ? 'now' : 'done'}` }, h('span', { html: icon(i === steps.length - 1 ? 'restart' : 'checkCircle', 16) }), s)));
  };
  unsubscribe = ctx.onProgress((_id, p) => {
    if (!p) return;
    if (p.step && steps[steps.length - 1] !== p.step) {
      steps.push(p.step);
      paint();
    }
    const bar = detailEl.firstChild;
    bar.style.width = p.total ? `${Math.round((p.received / p.total) * 100)}%` : p.received ? '50%' : '100%';
  });
  steps.push('Préparation…');
  paint();
  bc.servers
    .create(opts)
    .then((s) => {
      toast(`« ${s.name} » est prêt : démarre-le !`);
      ctx.refreshServers(s.id);
    })
    .catch((err) => toast(err.message, 'error'))
    .finally(() => {
      unsubscribe();
      close();
    });
}

/* ========================================================== knowledge */

export async function knowledgePage(ctx) {
  const k = await bc.knowledge.summary();
  let tab = 'lessons';
  const page = h('div', { class: 'pad' });
  const SW = { pnx: 'PowerNukkitX', pocketmine: 'PocketMine-MP', all: 'Tous' };
  const date = (t) => new Date(t).toLocaleDateString('fr', { day: 'numeric', month: 'short' });

  const render = async () => {
    const data = await bc.knowledge.summary();
    const seg = h(
      'div',
      { class: 'seg' },
      [
        ['lessons', `Leçons (${data.lessons.length})`],
        ['docs', `Documentation (${data.builtin.length + data.docs.length})`],
      ].map(([id, label]) => h('button', { class: tab === id ? 'on' : '', onclick: () => ((tab = id), render()) }, label))
    );
    let content;
    if (tab === 'lessons') {
      const input = h('input', { class: 'input', placeholder: 'Apprends-lui une règle, ex. « Les messages en jeu doivent être en français »' });
      const swSel = h('select', { class: 'select', style: 'width:180px' }, Object.entries(SW).map(([v, l]) => h('option', { value: v, selected: v === 'all' }, l)));
      const add = h('button', { class: 'btn soft', html: icon('plus', 15) + '<span>Ajouter</span>' });
      add.addEventListener('click', () => attempt(async () => (input.value.trim() && (await bc.knowledge.addLesson(input.value.trim(), swSel.value), toast('Leçon ajoutée'), render(), ctx.refreshMemoryCount()))));
      content = h(
        'div',
        {},
        h('div', { style: 'display:flex;gap:8px;margin-bottom:14px' }, input, swSel, add),
        h(
          'div',
          { class: 'card' },
          data.lessons.length
            ? data.lessons.map((l) =>
                h(
                  'div',
                  { class: 'lesson' },
                  h('span', { html: icon('brain', 17) }),
                  h('div', { class: 'txt' }, h('p', {}, l.text), h('small', {}, `${l.source === 'utilisateur' ? 'Ajoutée par toi' : 'Apprise par l’IA'} · ${SW[l.software]} · ${date(l.created)}`)),
                  h('button', {
                    class: 'icon-btn sm',
                    title: 'Modifier',
                    html: icon('pencil', 14),
                    onclick: async () => {
                      const text = window.prompt('Modifier la leçon', l.text);
                      if (text?.trim()) await attempt(() => bc.knowledge.editLesson(l.id, text.trim()));
                      render();
                    },
                  }),
                  h('button', {
                    class: 'icon-btn sm',
                    title: 'Oublier',
                    html: icon('trash', 14),
                    onclick: async () => {
                      await attempt(() => bc.knowledge.removeLesson(l.id));
                      render();
                      ctx.refreshMemoryCount();
                    },
                  })
                )
              )
            : h('div', { class: 'empty-box' }, h('div', { html: icon('brain', 28) }), 'Pas encore de leçon. L’IA en enregistre une à chaque fois qu’elle apprend quelque chose en corrigeant ses erreurs.')
        )
      );
    } else {
      const url = h('input', { class: 'input', placeholder: 'Adresse d’une page de documentation (https://…)' });
      const swSel = h('select', { class: 'select', style: 'width:180px' }, Object.entries(SW).map(([v, l]) => h('option', { value: v, selected: v === 'all' }, l)));
      const add = h('button', { class: 'btn soft', html: icon('download', 15) + '<span>Lire la page</span>' });
      add.addEventListener('click', () =>
        attempt(async () => {
          if (!/^https?:\/\//.test(url.value.trim())) throw new Error('Colle une adresse qui commence par https://');
          add.disabled = true;
          try {
            const r = await bc.knowledge.addUrl(url.value.trim(), swSel.value);
            toast(`Page lue : ${r.title} (${r.chunks} parties)`);
            render();
          } finally {
            add.disabled = false;
          }
        })
      );
      const row = (d, builtin) =>
        h(
          'div',
          { class: 'lesson' },
          h('span', { html: icon(builtin ? 'book' : 'web', 17), style: `color:var(${builtin ? '--emerald' : '--diamond'})` }),
          h('div', { class: 'txt' }, h('p', {}, d.title), h('small', {}, builtin ? `Intégrée · ${SW[d.software]}` : `${d.url} · ${d.chunks} parties · ${SW[d.software]}`)),
          builtin ? null : h('button', { class: 'icon-btn sm', title: 'Oublier', html: icon('trash', 14), onclick: async () => (await attempt(() => bc.knowledge.removeDoc(d.id)), render()) })
        );
      content = h(
        'div',
        {},
        h('div', { style: 'display:flex;gap:8px;margin-bottom:14px' }, url, swSel, add),
        h('div', { class: 'card' }, data.builtin.map((d) => row(d, true)), data.docs.map((d) => row(d, false)))
      );
    }
    page.replaceChildren(
      h(
        'div',
        { class: 'k-head' },
        h('div', {}, h('h1', { html: icon('brain', 26) + 'Mémoire de l’IA' }), h('p', {}, 'Ce que l’IA sait et retient : des guides vérifiés, les pages de documentation qu’elle a lues et les leçons tirées de ses erreurs. Elle s’en sert à chaque demande.')),
        seg
      ),
      h(
        'div',
        { class: 'k-stats' },
        h('div', { class: 'card stat lessons' }, h('b', {}, data.lessons.length), h('span', {}, 'leçons apprises')),
        h('div', { class: 'card stat docs' }, h('b', {}, data.docs.length), h('span', {}, 'pages lues')),
        h('div', { class: 'card stat builtin' }, h('b', {}, data.builtin.length), h('span', {}, 'guides intégrés'))
      ),
      content
    );
  };
  void k;
  await render();
  return page;
}

/* =========================================================== settings */

export async function settingsPage(ctx) {
  const page = h('div', { class: 'pad' });
  const render = async () => {
    const info = await bc.info();
    const local = await bc.local.status();
    const upd = await bc.update.get();
    const provider = info.settings.provider;

    const keyBox = h('div');
    if (info.claudeKey) {
      keyBox.append(
        h('div', { class: 'notice info' }, h('span', { html: icon('checkCircle', 16) }), h('span', {}, `Clé enregistrée et chiffrée sur ce PC · modèle ${info.model}`)),
        h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn ghost sm', onclick: () => attempt(async () => (await bc.clearKey(), render())) }, 'Retirer la clé'))
      );
    } else {
      const input = h('input', { class: 'input', type: 'password', placeholder: 'sk-ant-…', autocomplete: 'off' });
      const btn = h('button', { class: 'btn primary', html: icon('key', 15) + '<span>Activer</span>' });
      btn.addEventListener('click', () =>
        attempt(async () => {
          btn.disabled = true;
          try {
            await bc.setKey(input.value);
            toast('Clé vérifiée : Claude est prêt');
            render();
          } finally {
            btn.disabled = false;
          }
        })
      );
      keyBox.append(
        h('p', { class: 'lead', style: 'margin:0 0 10px' }, 'Crée une clé sur ', h('a', { href: 'https://console.anthropic.com/settings/keys', target: '_blank', style: 'color:var(--diamond)' }, 'console.anthropic.com'), ' et ajoute un peu de crédit. Un plugin coûte en général quelques dizaines de centimes.'),
        h('div', { style: 'display:flex;gap:8px' }, input, btn)
      );
    }

    const models = h(
      'div',
      {},
      local.models.map((m) => {
        const dl = local.download?.id === m.id ? local.download : null;
        const active = local.active === m.id;
        const actions = h('div', { style: 'display:flex;gap:6px;align-items:center' });
        if (dl) actions.append(h('div', { style: 'width:150px' }, h('div', { class: 'progress' }, h('i', { style: `width:${dl.percent}%` }))), h('span', { class: 'mono', style: 'font-size:12px;width:40px' }, `${dl.percent} %`), h('button', { class: 'btn ghost sm', onclick: () => bc.local.cancelInstall() }, 'Pause'));
        else if (!m.installed) actions.append(h('button', { class: 'btn soft sm', disabled: !!local.download, onclick: () => attempt(() => bc.local.install(m.id)).then(render), html: icon('download', 14) + `<span>Installer (${m.size})</span>` }));
        else {
          if (!active) actions.append(h('button', { class: 'btn soft sm', onclick: () => attempt(() => bc.local.use(m.id)).then(render) }, 'Utiliser'));
          actions.append(h('button', { class: 'icon-btn sm', title: 'Supprimer', html: icon('trash', 14), onclick: () => attempt(() => bc.local.remove(m.id)).then(render) }));
        }
        return h('div', { class: `model-row${active ? ' on' : ''}` }, h('div', { class: 'plugin-ic', html: icon(active ? 'checkCircle' : 'cpu', 17), style: active ? 'color:var(--diamond)' : '' }), h('div', { class: 'txt' }, h('b', {}, `${m.label} · ${m.name}`), h('span', {}, active ? 'Utilisé par BuildCraft' : m.installed ? 'Installé' : `${m.hint} · ${m.size}`)), actions);
      })
    );

    const choice = (id, title, desc, ic, badge) =>
      h(
        'button',
        { class: `choice ai${provider === id ? ' on' : ''}`, onclick: () => ctx.setProvider(id).then(render) },
        badge ? h('span', { class: `badge ${badge[0]}` }, badge[1]) : null,
        h('div', { class: 'choice-head' }, h('div', { class: 'plugin-ic own', html: icon(ic, 17) }), h('b', {}, title)),
        h('p', {}, desc)
      );

    const themeSeg = h(
      'div',
      { class: 'seg' },
      [
        ['dark', 'Sombre'],
        ['light', 'Clair'],
        ['system', 'Système'],
      ].map(([v, l]) => h('button', { class: info.settings.theme === v ? 'on' : '', onclick: () => ctx.setTheme(v).then(render) }, l))
    );

    page.replaceChildren(
      h(
        'div',
        { class: 'settings-page' },
        h('div', { class: 'k-head', style: 'margin-bottom:0' }, h('div', {}, h('h1', { html: icon('gear', 26).replace('class="ic ', 'style="color:var(--emerald)" class="ic ') + 'Paramètres' }))),
        h(
          'div',
          { class: 'card' },
          h('h3', { html: icon('sparkle', 18) + 'Intelligence artificielle' }),
          h('p', { class: 'lead' }, 'Choisis le moteur qui code tes plugins. Tu peux changer à tout moment, même dans la conversation.'),
          h(
            'div',
            { class: 'choice-grid' },
            choice('claude', 'Claude', 'Le meilleur pour coder : il lit l’API, teste sur le serveur et corrige seul. Rapide. Nécessite une clé API (payant à l’usage).', 'sparkle', ['rec', 'Recommandé']),
            choice('local', 'IA locale', 'Gratuite, sans compte et hors ligne : elle tourne sur ton PC. Plus lente et plus limitée, idéale pour des petits plugins.', 'cpu', ['fast', 'Gratuit'])
          ),
          h('div', { style: 'height:16px' }),
          provider === 'claude' ? keyBox : models
        ),
        h(
          'div',
          { class: 'card' },
          h('h3', { html: icon('monitor', 18) + 'Apparence' }),
          h('div', { class: 'toggle-row', style: 'border:none;padding-top:4px' }, h('div', {}, h('b', {}, 'Thème'), h('span', {}, 'Sombre par défaut, pensé pour la console et le code.')), themeSeg)
        ),
        h(
          'div',
          { class: 'card' },
          h('h3', { html: icon('folder', 18) + 'Serveurs' }),
          h('div', { class: 'toggle-row', style: 'border:none;padding-top:4px' }, h('div', {}, h('b', {}, 'Dossier des serveurs'), h('span', { class: 'mono' }, info.settings.serversRoot)), h('div', { style: 'display:flex;gap:6px' }, h('button', { class: 'btn ghost sm', onclick: () => bc.open(info.settings.serversRoot) }, 'Ouvrir'), h('button', { class: 'btn soft sm', onclick: () => attempt(async () => (await bc.chooseRoot()) && (ctx.refreshServers(null), render())) }, 'Changer…'))),
          h('div', { class: 'toggle-row' }, h('div', {}, h('b', {}, 'Environnements installés'), h('span', {}, `Java 25 : ${info.runtimes.java ? 'installé' : 'sera installé au premier serveur PowerNukkitX'} · PHP 8.4 : ${info.runtimes.php ? 'installé' : 'sera installé au premier serveur PocketMine'}`)))
        ),
        h(
          'div',
          { class: 'card' },
          h('h3', { html: icon('info', 18) + 'À propos' }),
          h(
            'div',
            { class: 'toggle-row', style: 'border:none;padding-top:4px' },
            h('div', {}, h('b', {}, `BuildCraft ${info.version}`), h('span', {}, upd.state === 'available' ? `Nouvelle version ${upd.version} disponible` : upd.state === 'latest' ? 'À jour' : upd.state === 'error' ? upd.error : 'Vérification des mises à jour…')),
            h(
              'div',
              { style: 'display:flex;gap:6px' },
              upd.state === 'available' ? h('button', { class: 'btn primary sm', onclick: () => bc.update.download() }, upd.canInstall ? 'Mettre à jour' : 'Télécharger') : h('button', { class: 'btn soft sm', onclick: () => bc.update.check().then(render) }, 'Vérifier'),
              h('button', { class: 'btn ghost sm', onclick: () => bc.open('https://github.com/Maxence-P-dev/buildcraft') }, 'GitHub')
            )
          ),
          h('p', { class: 'lead', style: 'margin:10px 0 0' }, 'Logiciels serveur : PowerNukkitX (LGPL) et PocketMine-MP (LGPL). Java : Eclipse Temurin. IA locale : Qwen2.5-Coder (Apache 2.0) via node-llama-cpp.')
        )
      )
    );
  };
  ctx.onLocalChange(() => ctx.isPage('settings') && render());
  await render();
  return page;
}

export { confirmBox };
