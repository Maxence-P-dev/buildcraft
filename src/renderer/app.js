import { icon, LOGO } from './icons.js';
import { $, h, attempt, toast } from './ui.js';
import { createServerView } from './server-view.js';
import { welcome, newServer, knowledgePage, settingsPage } from './pages.js';

const bc = window.bc;

const S = {
  info: null,
  servers: [],
  page: 'server', // server | knowledge | settings | welcome
  current: null,
  memory: 0,
};
const progressListeners = new Set();
const localListeners = new Set();

/* ---------------------------------------------------------------- ctx */

const ctx = {
  info: () => S.info,
  settings: () => S.info.settings,
  mount(el) {
    $('#main').replaceChildren(el);
  },
  async setProvider(provider) {
    S.info.settings = await bc.setSettings({ provider });
  },
  async setTheme(theme) {
    S.info.settings = await bc.setSettings({ theme });
    applyTheme(S.info.settings.effectiveTheme);
  },
  refreshServers: (selectId) => loadServers(selectId),
  refreshMemoryCount,
  onProgress(fn) {
    progressListeners.add(fn);
    return () => progressListeners.delete(fn);
  },
  onLocalChange: (fn) => localListeners.add(fn),
  isPage: (p) => S.page === p,
  freePort() {
    const used = new Set(S.servers.map((s) => Number(s.settings.port)));
    let p = 19132;
    while (used.has(p) || used.has(p + 1)) p += 2;
    return p;
  },
  lanAddress: () => S.info.lan || 'adresse IP du PC',
};

const serverView = createServerView(ctx);

/* -------------------------------------------------------------- theme */

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $('#btn-theme').innerHTML = icon(t === 'dark' ? 'moon' : 'sun', 17);
}

/* ------------------------------------------------------------ sidebar */

const STATUS = { running: 'En ligne', starting: 'Démarrage…', stopping: 'Arrêt…', stopped: 'Arrêté', installing: 'Installation…', broken: 'Erreur' };

function renderSidebar() {
  const list = $('#server-list');
  $('#srv-count').textContent = S.servers.length || '';
  list.replaceChildren(
    ...S.servers.map((s) =>
      h(
        'button',
        { class: `srv${S.page === 'server' && S.current === s.id ? ' active' : ''}`, onclick: () => openServer(s.id) },
        h('div', { class: `srv-badge ${s.software}` }, s.software === 'pnx' ? 'PNX' : 'PM', h('span', { class: `st ${s.status}` })),
        h('div', { class: 'srv-txt' }, h('b', {}, s.name), h('span', {}, s.status === 'running' ? `En ligne · ${s.players.length} joueur${s.players.length > 1 ? 's' : ''} · :${s.settings.port}` : `${STATUS[s.status] || s.status} · ${s.softwareName}`))
      )
    )
  );
  if (!S.servers.length) list.append(h('div', { style: 'padding:16px 12px;color:var(--text-3);font-size:13px' }, 'Aucun serveur pour le moment.'));
  $('#sb-nav').replaceChildren(
    h('button', { class: `nav-item${S.page === 'knowledge' ? ' active' : ''}`, onclick: () => openPage('knowledge'), html: icon('brain', 17) + '<span>Mémoire de l’IA</span>' + (S.memory ? `<span class="count">${S.memory}</span>` : '') }),
    h('button', { class: `nav-item${S.page === 'settings' ? ' active' : ''}`, onclick: () => openPage('settings'), html: icon('gear', 17) + '<span>Paramètres</span>' })
  );
  const cur = S.servers.find((s) => s.id === S.current);
  $('#crumb').innerHTML = S.page === 'server' && cur ? `${icon('chevron', 12)}<b>${cur.name.replace(/</g, '&lt;')}</b>` : S.page === 'knowledge' ? `${icon('chevron', 12)}<b>Mémoire de l’IA</b>` : S.page === 'settings' ? `${icon('chevron', 12)}<b>Paramètres</b>` : '';
}

async function refreshMemoryCount() {
  const k = await bc.knowledge.summary().catch(() => null);
  S.memory = k ? k.lessons.length : 0;
  renderSidebar();
}

/* ------------------------------------------------------------ routing */

function openServer(id, opts) {
  const s = S.servers.find((x) => x.id === id);
  if (!s) return;
  S.page = 'server';
  S.current = id;
  bc.setSettings({ lastServer: id });
  serverView.show(s, opts);
  renderSidebar();
}

async function openPage(page) {
  S.page = page;
  renderSidebar();
  if (page === 'knowledge') refreshMemoryCount();
  const el = page === 'knowledge' ? await knowledgePage(ctx) : await settingsPage(ctx);
  if (S.page === page) ctx.mount(el);
}

async function loadServers(selectId) {
  S.servers = await bc.servers.list();
  if (selectId === null) S.current = null;
  if (selectId) S.current = selectId;
  if (!S.servers.length) {
    S.page = 'welcome';
    ctx.mount(welcome(ctx));
  } else if (S.page === 'welcome' || !S.servers.some((s) => s.id === S.current) || selectId) {
    if (!S.servers.some((s) => s.id === S.current)) S.current = S.servers[0].id;
    if (S.page === 'welcome' || selectId !== undefined) openServer(S.current);
  } else if (S.page === 'server') {
    serverView.update(S.servers.find((s) => s.id === S.current));
  }
  renderSidebar();
}

/* -------------------------------------------------------------- update */

function renderUpdate(st) {
  const pill = $('#update-pill');
  const show = ['available', 'downloading', 'ready'].includes(st.state);
  pill.hidden = !show;
  if (!show) return;
  pill.innerHTML = st.state === 'ready' ? `${icon('zap', 14)}<span>Redémarrer pour mettre à jour</span>` : st.state === 'downloading' ? `<span class="dot"></span><span>Téléchargement ${st.percent || 0} %</span>` : `<span class="dot"></span><span>Mise à jour ${st.version}</span>`;
  pill.onclick = () => (st.state === 'ready' ? bc.update.install() : st.state === 'available' ? bc.update.download() : null);
}

/* ---------------------------------------------------------------- init */

async function init() {
  S.info = await bc.info();
  applyTheme(S.info.settings.effectiveTheme);
  $('#brand').innerHTML = `${LOGO}<span>BuildCraft</span><small>v${S.info.version}</small>`;
  $('#btn-new').innerHTML = icon('plus', 17) + '<span>Nouveau serveur</span>';
  $('#btn-new').addEventListener('click', () => newServer(ctx));
  $('#btn-theme').addEventListener('click', () => ctx.setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

  bc.onServerStatus((s) => {
    const i = S.servers.findIndex((x) => x.id === s.id);
    if (i >= 0) S.servers[i] = s;
    else S.servers.push(s);
    if (S.page === 'server' && s.id === S.current) serverView.update(s);
    renderSidebar();
  });
  bc.onServerLog((id, lines) => serverView.log(id, lines));
  bc.onServerProgress((id, p) => progressListeners.forEach((fn) => fn(id, p)));
  bc.onAssistant((id, e) => {
    serverView.assistant(id, e);
    if (e.type === 'error' && id !== S.current) toast(`Assistant : ${e.message}`, 'error');
  });
  bc.onLocalStatus(() => localListeners.forEach((fn) => fn()));
  bc.onUpdate(renderUpdate);
  bc.onSystemTheme((t) => S.info.settings.theme === 'system' && applyTheme(t));
  renderUpdate(await bc.update.get());

  S.current = S.info.settings.lastServer;
  S.servers = await bc.servers.list();
  if (!S.servers.length) {
    S.page = 'welcome';
    ctx.mount(welcome(ctx));
  } else openServer(S.servers.some((s) => s.id === S.current) ? S.current : S.servers[0].id);
  refreshMemoryCount();
  document.body.classList.add('ready');
}

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    newServer(ctx);
  }
});

init().catch((err) => {
  document.body.classList.add('ready');
  toast(err.message, 'error');
});

void attempt;
