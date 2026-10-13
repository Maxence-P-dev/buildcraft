'use strict';

const { app } = require('electron');
const path = require('path');

const user = app.getPath('userData');

module.exports = {
  user,
  runtimes: path.join(user, 'runtimes'),
  cache: path.join(user, 'cache'),
  knowledge: path.join(user, 'knowledge'),
  models: path.join(user, 'models'),
  settings: path.join(user, 'settings.json'),
  // Servers live in the user's documents so they are easy to find and back up.
  defaultServers: path.join(app.getPath('documents'), 'BuildCraft', 'serveurs'),
};
