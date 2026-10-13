// Dev check of the core modules on a throwaway profile: electron scripts/core-test.cjs <dir>
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const out = path.resolve(process.argv[2] || 'core-test');
app.setPath('userData', path.join(out, 'profile'));
process.on('uncaughtException', (e) => { console.error('FATAL', e); process.exit(1); });
app.whenReady().then(async () => {
  const servers = require('../app/core/servers');
  const builder = require('../app/core/builder');
  const knowledge = require('../app/core/knowledge');
  servers.setRoot(path.join(out, 'servers'));
  servers.events.on('progress', (id, p) => p && p.step && !p.received && console.log('  …', p.step));
  const t = (label) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);
  const t0 = Date.now();
  for (const software of process.argv.slice(3).length ? process.argv.slice(3) : ['pnx', 'pocketmine']) {
    t(`== ${software}: création`);
    const s = await servers.create({ name: `Test ${software}`, software, memory: 1024, settings: { port: software === 'pnx' ? 19140 : 19150 } });
    t(`créé ${s.softwareName} ${s.version} dans ${s.dir}`);
    const name = builder.scaffold(s, 'HelloBC', 'Test');
    t(`projet ${name}: ${builder.listFiles(s, name).join(', ')}`);
    const b = await builder.build(servers.get(s.id), name);
    t(`build ok=${b.ok} ${b.log.split('\n').pop()}`);
    await servers.start(s.id);
    t('serveur prêt');
    const log = servers.logOf(s.id);
    console.log('  plugin:', log.filter((l) => /HelloBC/.test(l)).join(' | '));
    console.log('  motd/port:', log.filter((l) => /19140|19150|Opening|interface running/.test(l)).slice(0, 2).join(' | '));
    servers.command(s.id, 'version');
    await new Promise((r) => setTimeout(r, 2000));
    const api = await knowledge.apiLookup(servers.get(s.id), 'PlayerJoinEvent');
    t(`api_lookup PlayerJoinEvent: ${api.split('\n').slice(0, 3).join(' / ')}`);
    await servers.stop(s.id);
    t('arrêté');
    console.log('  search:', knowledge.search('commande plugin.yml', software, 2).map((h) => h.title).join(' | '));
  }
  app.exit(0);
});
