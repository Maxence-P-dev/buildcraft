// Dev check: the examples shown to the local AI must compile. electron scripts/examples-test.cjs <dir>
const { app } = require('electron');
const path = require('path');
const out = path.resolve(process.argv[2] || 'core-test');
app.setPath('userData', path.join(out, 'profile'));
app.whenReady().then(async () => {
  const servers = require('../app/core/servers');
  const builder = require('../app/core/builder');
  const { EXAMPLES } = require('../app/core/local-ai');
  servers.setRoot(path.join(out, 'servers'));
  let bad = 0;
  for (const s of servers.list()) {
    const ex = EXAMPLES[s.software];
    for (const f of ex.files) builder.writeFile(s, ex.plugin, f.path, f.content);
    const r = await builder.build(servers.get(s.id), ex.plugin);
    if (!r.ok) bad++;
    console.log(s.software, r.ok ? 'OK' : `ÉCHEC\n${r.log}`);
    builder.uninstall(servers.get(s.id), r.file ? path.basename(r.file) : `${ex.plugin}`, true);
  }
  app.exit(bad);
});
