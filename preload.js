const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('postit', {
  getModo:   () => ipcRenderer.invoke('modo:get'),
  setModo:   (m) => ipcRenderer.invoke('modo:set', m),
  encaixar:  (pos) => ipcRenderer.send('janela:encaixar', pos),
  minimizar: () => ipcRenderer.send('win:min'),
  fechar:    () => ipcRenderer.send('win:close'),
  getAuto:   () => ipcRenderer.invoke('auto:get'),
  setAuto:   (v) => ipcRenderer.send('auto:set', v),
  versao:    () => ipcRenderer.invoke('app:versao'),
  abrirFolha:  (id) => ipcRenderer.invoke('folha:abrir', id),
  fecharFolha: (id) => ipcRenderer.send('folha:fechar', id),
  abertas:     () => ipcRenderer.invoke('folha:abertas'),
  notificar:   (t, c) => ipcRenderer.send('notificar', t, c),
  sair:        () => ipcRenderer.send('app:sair'),
  onAtualizacao: (cb) => ipcRenderer.on('update:pronta', (_e, v) => cb(v)),
  onDisponivel: (cb) => ipcRenderer.on('update:disponivel', (_e, v) => cb(v)),
  checar: () => ipcRenderer.invoke('update:checar'),
  instalarAtualizacao: () => ipcRenderer.send('update:instalar')
});
