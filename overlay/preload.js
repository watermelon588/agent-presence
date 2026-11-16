const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ap', {
  // overlay
  onConfig: cb => ipcRenderer.on('config', (_, c) => cb(c)),
  onEvent: cb => ipcRenderer.on('event', (_, e) => cb(e)),
  onCmd: cb => ipcRenderer.on('cmd', (_, m) => cb(m)), // toasts and peek from the keyboard shortcuts
  onResetPositions: cb => ipcRenderer.on('reset-positions', () => cb()),
  mouse: over => ipcRenderer.send('mouse', over),
  reveal: (file, cwd) => ipcRenderer.send('reveal', file, cwd),
  menu: target => ipcRenderer.send('menu', target),
  // control room
  onRoom: cb => ipcRenderer.on('room', (_, d) => cb(d)),
  onFront: cb => ipcRenderer.on('front', (_, f) => cb(f)), // the app in front, for "Only over my apps"
  setAvatars: (key, files) => ipcRenderer.send('set-avatars', key, files),
  browse: key => ipcRenderer.send('browse', key),
  setConfig: patch => ipcRenderer.send('set-config', patch),
  setVisible: on => ipcRenderer.send('visible', on),
  resetPositions: () => ipcRenderer.send('reset-positions'),
  openFolder: () => ipcRenderer.send('open-folder'),
});
