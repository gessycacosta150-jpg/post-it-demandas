const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('postit', {
  toggleTop: () => ipcRenderer.invoke('top:toggle'),
  getTop:    () => ipcRenderer.invoke('top:get'),
  minimizar: () => ipcRenderer.send('win:min'),
  fechar:    () => ipcRenderer.send('win:close'),
  getAuto:   () => ipcRenderer.invoke('auto:get'),
  setAuto:   (v) => ipcRenderer.send('auto:set', v),
  versao:    () => ipcRenderer.invoke('app:versao'),
  onAtualizacao: (cb) => ipcRenderer.on('update:pronta', (_e, v) => cb(v)),
  instalarAtualizacao: () => ipcRenderer.send('update:instalar')
});
