// Dev check of the local AI pipeline: electron scripts/local-test.cjs <dir> <serverName> "<demande>"
const { app } = require('electron');
const path = require('path');
const out = path.resolve(process.argv[2] || 'core-test');
app.setPath('userData', path.join(out, 'profile'));
process.on('uncaughtException', (e) => { console.error('FATAL', e); process.exit(1); });
app.whenReady().then(async () => {
  const servers = require('../app/core/servers');
  const localAi = require('../app/core/local-ai');
  servers.setRoot(path.join(out, 'servers'));
  const t0 = Date.now();
  const t = (label) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);
  let last = '';
  localAi.onStatus((st) => {
    const line = st.download ? 'téléchargement ' + st.download.id + ' ' + Math.floor((st.download.percent || 0) / 10) * 10 + '%' : '';
    if (line && line !== last && true) t((last = line));
  });
  if (!localAi.status().models.some((m) => m.id === 'light' && m.installed)) {
    t('installation du modèle léger');
    await localAi.installModel('light');
  }
  await localAi.useModel('light');
  const s = servers.list().find((x) => x.name === (process.argv[3] || 'Test pnx'));
  t(`serveur ${s.name} (${s.software})`);
  await new Promise((resolve) => {
    localAi.ask(s, process.argv[4] || 'Crée un plugin qui ajoute la commande /bonjour qui répond Bonjour au joueur.', (e) => {
      if (e.type === 'progress' && Math.random() > 0.02) return;
      t(`${e.type} ${JSON.stringify(e).slice(0, 220)}`);
      if (e.type === 'done' || e.type === 'error') resolve();
    });
  });
  await servers.stopAll();
  app.exit(0);
});
