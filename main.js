const { app, BrowserWindow, ipcMain, screen, nativeTheme, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

// Mantém a pasta de dados antiga: assim as tarefas, recados e lembretes não se perdem com o novo nome.
app.setPath('userData', path.join(app.getPath('appData'), 'Post-it Demandas'));

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.setAppUserModelId('br.postit.demandas');

const janelas = new Map();     // id da folha -> janela
let encerrando = false;
let versaoAvisada = null;

// ---------- posição/tamanho de cada folha ----------
const arqEstado = () => path.join(app.getPath('userData'), 'janela.json');
function lerEstado() {
  try {
    const e = JSON.parse(fs.readFileSync(arqEstado(), 'utf8'));
    if (e.width && !e.folhas) return { folhas: { f1: { x: e.x, y: e.y, width: e.width, height: e.height, top: e.top } }, abertas: ['f1'], ultima: 'f1' };
    return { folhas: e.folhas || {}, abertas: e.abertas || [], ultima: e.ultima || 'f1' };
  } catch (err) { return { folhas: {}, abertas: [], ultima: 'f1' }; }
}
const estado = lerEstado();
function gravar() { try { fs.writeFileSync(arqEstado(), JSON.stringify(estado)); } catch (e) {} }
function guardar(id, win) {
  if (!win || win.isDestroyed()) return;
  estado.folhas[id] = { ...win.getBounds(), top: win.isAlwaysOnTop() };
  gravar();
}

// ---------- avisos do Windows ----------
function avisar(titulo, corpo, aoClicar) {
  try {
    if (Notification.isSupported()) {
      const n = new Notification({ title: titulo, body: corpo });
      if (aoClicar) n.on('click', aoClicar);
      n.show();
    }
  } catch (e) {}
  const w = [...janelas.values()][0];
  if (w && !w.isDestroyed()) w.flashFrame(true);
}
const paraTodas = (canal, ...args) => janelas.forEach(w => { if (!w.isDestroyed()) w.webContents.send(canal, ...args); });

// ---------- janelas ----------
function abrirFolha(id, referencia) {
  if (janelas.has(id)) {
    const w = janelas.get(id);
    if (w.isMinimized()) w.restore();
    w.show(); w.focus();
    return w;
  }
  const e = estado.folhas[id] || {};
  const wa = screen.getPrimaryDisplay().workArea;
  const w = e.width || 360, h = e.height || 520;
  let x = e.x, y = e.y;
  if (x === undefined || y === undefined) {
    const base = referencia || BrowserWindow.getFocusedWindow() || [...janelas.values()][0];
    if (base) { const b = base.getBounds(); x = b.x + 36; y = b.y + 36; }
    else { x = wa.x + wa.width - w - 20; y = wa.y + 40; }
  }
  const visivel = screen.getAllDisplays().some(d =>
    x >= d.bounds.x - 50 && x < d.bounds.x + d.bounds.width - 50 && y >= d.bounds.y && y < d.bounds.y + d.bounds.height - 50);
  if (!visivel) { x = wa.x + wa.width - w - 20; y = wa.y + 40; }

  const win = new BrowserWindow({
    width: w, height: h, x, y,
    minWidth: 240, minHeight: 220,
    frame: false,
    alwaysOnTop: e.top !== false,
    autoHideMenuBar: true,
    title: 'Gege Post-it',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#2C303C' : '#FFFDF6',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, 'index.html'), { query: { folha: id } });
  janelas.set(id, win);
  if (!estado.abertas.includes(id)) estado.abertas.push(id);
  gravar();

  let t = null;
  const agendar = () => { clearTimeout(t); t = setTimeout(() => guardar(id, win), 400); };
  win.on('move', agendar); win.on('resize', agendar);
  win.on('close', () => {
    guardar(id, win);
    if (!encerrando && janelas.size > 1) estado.abertas = estado.abertas.filter(x => x !== id);
    estado.ultima = id;
    gravar();
  });
  win.on('closed', () => { janelas.delete(id); });
  return win;
}
const idDe = (sender) => { for (const [id, w] of janelas) if (!w.isDestroyed() && w.webContents === sender) return id; return null; };

app.on('before-quit', () => { encerrando = true; });
app.on('second-instance', () => {
  const w = [...janelas.values()][0];
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
});
app.on('window-all-closed', () => app.quit());

// ---------- atualização automática ----------
function iniciarAtualizacao() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (info) => {
    paraTodas('update:disponivel', info.version);
    if (versaoAvisada !== info.version) {
      versaoAvisada = info.version;
      avisar('Atualização disponível', 'A versão ' + info.version + ' do Gege Post-it está sendo baixada.');
    }
  });
  autoUpdater.on('update-downloaded', (info) => {
    paraTodas('update:pronta', info.version);
    avisar('Atualização pronta', 'Versão ' + info.version + ' baixada. Clique aqui para reiniciar e atualizar.', () => autoUpdater.quitAndInstall());
  });
  autoUpdater.on('error', () => {});
  const checar = () => autoUpdater.checkForUpdates().catch(() => {});
  checar();
  setInterval(checar, 60 * 60 * 1000);
  let ultima = Date.now();
  app.on('browser-window-focus', () => {
    if (Date.now() - ultima > 15 * 60 * 1000) { ultima = Date.now(); checar(); }
  });
}

app.whenReady().then(() => {
  const ids = estado.abertas.length ? [...estado.abertas] : [estado.ultima || 'f1'];
  ids.forEach(id => abrirFolha(id));
  iniciarAtualizacao();
});

// ---------- comunicação com as folhas ----------
const janelaDe = (e) => BrowserWindow.fromWebContents(e.sender);
ipcMain.handle('top:get', (e) => { const w = janelaDe(e); return w ? w.isAlwaysOnTop() : true; });
ipcMain.handle('top:toggle', (e) => { const w = janelaDe(e); if (!w) return true; const v = !w.isAlwaysOnTop(); w.setAlwaysOnTop(v); const id = idDe(e.sender); if (id) guardar(id, w); return v; });
ipcMain.on('win:min', (e) => { const w = janelaDe(e); if (w) w.minimize(); });
ipcMain.on('win:close', (e) => { const w = janelaDe(e); if (w) w.close(); });
ipcMain.handle('folha:abrir', (e, id) => { abrirFolha(String(id), janelaDe(e)); return true; });
ipcMain.on('folha:fechar', (e, id) => { const w = janelas.get(String(id)); if (w && !w.isDestroyed()) w.close(); delete estado.folhas[String(id)]; estado.abertas = estado.abertas.filter(x => x !== String(id)); gravar(); });
ipcMain.handle('folha:abertas', () => [...janelas.keys()]);
ipcMain.on('notificar', (e, titulo, corpo) => { const w = janelaDe(e); avisar(String(titulo), String(corpo), () => { if (w && !w.isDestroyed()) { if (w.isMinimized()) w.restore(); w.focus(); } }); });
ipcMain.on('app:sair', () => app.quit());
ipcMain.handle('auto:get', () => app.getLoginItemSettings().openAtLogin);
ipcMain.on('auto:set', (_e, v) => app.setLoginItemSettings({ openAtLogin: !!v }));
ipcMain.handle('app:versao', () => app.getVersion());
ipcMain.on('update:instalar', () => autoUpdater.quitAndInstall());
ipcMain.handle('update:checar', async () => {
  if (!app.isPackaged) return 'dev';
  try {
    const r = await autoUpdater.checkForUpdates();
    return r && r.updateInfo && r.updateInfo.version !== app.getVersion() ? 'nova' : 'atual';
  } catch (err) { return 'erro'; }
});
