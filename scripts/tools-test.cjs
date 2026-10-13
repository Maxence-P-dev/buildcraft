// Dev check of the Claude agent tools without calling Claude: plays the tool calls an agent
// would make on a test server. electron scripts/tools-test.cjs <dir> <serverName>
const { app } = require('electron');
const path = require('path');
const out = path.resolve(process.argv[2] || 'core-test');
app.setPath('userData', path.join(out, 'profile'));
process.on('uncaughtException', (e) => { console.error('FATAL', e); process.exit(1); });

const PHP = `<?php

declare(strict_types=1);

namespace buildcraft\\toolsbc;

use pocketmine\\command\\Command;
use pocketmine\\command\\CommandSender;
use pocketmine\\plugin\\PluginBase;

class Main extends PluginBase {
    public function onCommand(CommandSender $sender, Command $command, string $label, array $args): bool {
        if ($command->getName() === "bonjour") {
            $sender->sendMessage("Bonjour " . $sender->getName() . " !");
            return true;
        }
        return false;
    }
}
`;
const YML = `name: ToolsBC
main: buildcraft\\toolsbc\\Main
version: 1.0.0
api: 5.0.0
author: BuildCraft
commands:
  bonjour:
    description: Dit bonjour
    permission: toolsbc.bonjour
permissions:
  toolsbc.bonjour:
    default: true
`;

app.whenReady().then(async () => {
  const servers = require('../app/core/servers');
  const agent = require('../app/core/agent');
  servers.setRoot(path.join(out, 'servers'));
  const s = servers.list().find((x) => x.name === (process.argv[3] || 'Test pocketmine'));
  const events = [];
  const emit = (e) => events.push(e);
  let failures = 0;
  const call = async (name, input, check) => {
    try {
      const r = String(await agent.runTool(s, name, input, emit));
      const ok = check ? check(r) : true;
      if (!ok) failures++;
      console.log(`${ok ? 'OK ' : 'NOK'} ${name}: ${r.replace(/\s+/g, ' ').slice(0, 150)}`);
    } catch (err) {
      const ok = check === 'throws';
      if (!ok) failures++;
      console.log(`${ok ? 'OK ' : 'NOK'} ${name} (erreur): ${err.message}`);
    }
  };
  await call('search_docs', { query: 'commande permission plugin.yml' }, (r) => r.length > 50);
  await call('api_lookup', { query: 'CommandSender' }, (r) => /sendMessage/.test(r));
  await call('create_plugin', { name: 'ToolsBC', description: 'Test des outils' }, (r) => /Main\.php/.test(r));
  await call('write_file', { plugin: 'ToolsBC', path: 'plugin.yml', content: YML });
  await call('write_file', { plugin: 'ToolsBC', path: 'src/buildcraft/toolsbc/Main.php', content: PHP });
  await call('write_file', { plugin: 'ToolsBC', path: '../../escape.txt', content: 'x' }, 'throws');
  await call('read_file', { plugin: 'ToolsBC', path: 'C:/Windows/win.ini' }, 'throws');
  await call('list_files', { plugin: 'ToolsBC' }, (r) => /plugin\.yml/.test(r));
  await call('build', { plugin: 'ToolsBC' }, (r) => r.startsWith('SUCCÈS'));
  await call('set_server_settings', { motd: 'Serveur de test des outils', maxPlayers: 12, port: 1 }, (r) => !/port/.test(r));
  await call('restart_server', {}, (r) => r.startsWith('Serveur prêt') && /ToolsBC/.test(r));
  await call('run_command', { command: '/bonjour' }, (r) => /Bonjour/.test(r));
  await call('server_log', { lines: 20 }, (r) => r.length > 0);
  await call('remember', { lesson: 'PocketMine : chaque commande de plugin.yml doit déclarer une permission.' });
  await call('nope', {}, 'throws');
  console.log(`événements UI : ${events.map((e) => e.type).join(', ')}`);
  console.log(failures ? `${failures} ÉCHEC(S)` : 'TOUS LES OUTILS OK');
  await servers.stopAll();
  app.exit(failures ? 1 : 0);
});
