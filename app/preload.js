'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Calls resolve with the value, or reject with the user-facing error message.
const call = (channel) => async (...args) => {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const on = (channel) => (cb) => ipcRenderer.on(channel, (_e, ...args) => cb(...args));

contextBridge.exposeInMainWorld('bc', {
  info: call('app:info'),
  setSettings: call('app:settings'),
  chooseRoot: call('app:chooseRoot'),
  open: call('app:open'),
  setKey: call('key:set'),
  clearKey: call('key:clear'),
  latest: call('software:latest'),
  servers: {
    list: call('servers:list'),
    create: call('servers:create'),
    update: call('servers:update'),
    remove: call('servers:remove'),
    start: call('servers:start'),
    stop: call('servers:stop'),
    restart: call('servers:restart'),
    command: call('servers:command'),
    log: call('servers:log'),
    plugins: call('servers:plugins'),
    reveal: call('servers:reveal'),
    uninstall: call('servers:uninstall'),
  },
  projects: {
    list: call('projects:list'),
    read: call('projects:read'),
    write: call('projects:write'),
    create: call('projects:create'),
    build: call('projects:build'),
  },
  assistant: {
    ask: call('assistant:ask'),
    cancel: call('assistant:cancel'),
    history: call('assistant:history'),
    busy: call('assistant:busy'),
    reset: call('assistant:reset'),
  },
  knowledge: {
    summary: call('knowledge:summary'),
    addUrl: call('knowledge:addUrl'),
    addText: call('knowledge:addText'),
    addLesson: call('knowledge:addLesson'),
    editLesson: call('knowledge:editLesson'),
    removeLesson: call('knowledge:removeLesson'),
    removeDoc: call('knowledge:removeDoc'),
    search: call('knowledge:search'),
  },
  local: {
    status: call('local:status'),
    install: call('local:install'),
    cancelInstall: call('local:cancelInstall'),
    use: call('local:use'),
    remove: call('local:remove'),
  },
  update: {
    get: call('update:get'),
    check: call('update:check'),
    download: call('update:download'),
    install: call('update:install'),
    notes: call('update:notes'),
  },
  onServerStatus: on('servers:status'),
  onServerLog: on('servers:log'),
  onServerProgress: on('servers:progress'),
  onAssistant: on('assistant:event'),
  onLocalStatus: on('local:status'),
  onUpdate: on('update:status'),
  onSystemTheme: on('app:systemTheme'),
});
