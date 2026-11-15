const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ap', {
  onConfig: cb => ipcRenderer.on('config', (_, c) => cb(c)),
  onEvent: cb => ipcRenderer.on('event', (_, e) => cb(e)),
  mouse: over => ipcRenderer.send('mouse', over),
  reveal: (file, cwd) => ipcRenderer.send('reveal', file, cwd),
  menu: () => ipcRenderer.send('menu'),
});
