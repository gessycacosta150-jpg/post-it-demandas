const { app, BrowserWindow, ipcMain, screen, nativeTheme, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

// Mantém a pasta de dados antiga: assim as tarefas, recados e lembretes não se perdem com o novo nome.
app.setPath('userData', path.join(app.getPath('appData'), 'Post-it Demandas'));

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.setAppUserModelId('br.postit.demandas');

// Posicionar a janela no fundo da pilha (só na área de trabalho), sem cobrir os aplicativos.
// Usa a API do Windows; se não estiver disponível, a janela simplesmente se comporta como normal.
let SetWindowPos = null;
try {
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  SetWindowPos = user32.func('bool __stdcall SetWindowPos(intptr_t hWnd, intptr_t hWndInsertAfter, int X, int Y, int cx, int cy, uint32_t uFlags)');
} catch (e) { SetWindowPos = null; }
function paraFundo(win) {
  if (!SetWindowPos || !win || win.isDestroyed()) return;
  try {
    const b = win.getNativeWindowHandle();
    const hwnd = b.length >= 8 ? Number(b.readBigInt64LE(0)) : b.readInt32LE(0);
    SetWindowPos(hwnd, 1 /* HWND_BOTTOM */, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010 /* NOSIZE | NOMOVE | NOACTIVATE */);
  } catch (e) {}
}

const janelas = new Map();     // id da folha -> janela
const modoDe = (id) => (estado.folhas[id] && estado.folhas[id].modo) || 'fundo';   // fundo | normal | cima
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
  estado.folhas[id] = { ...win.getBounds(), modo: modoDe(id) };
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
    alwaysOnTop: modoDe(id) === 'cima',
    autoHideMenuBar: true,
    title: 'Gege Post-it',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#2C303C' : '#FFFDF6',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, 'index.html'), { query: { folha: id } });
  janelas.set(id, win);
  win.once('ready-to-show', () => { if (modoDe(id) === 'fundo') paraFundo(win); });
  win.on('blur', () => { if (modoDe(id) === 'fundo') setTimeout(() => paraFundo(win), 60); });
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
ipcMain.handle('modo:get', (e) => { const id = idDe(e.sender); return id ? modoDe(id) : 'normal'; });
ipcMain.handle('modo:set', (e, m) => {
  const id = idDe(e.sender), w = janelaDe(e); if (!id || !w) return 'normal';
  if (!['fundo', 'normal', 'cima'].includes(m)) m = 'fundo';
  estado.folhas[id] = { ...(estado.folhas[id] || {}), modo: m };
  w.setAlwaysOnTop(m === 'cima');
  if (m === 'fundo') paraFundo(w);
  guardar(id, w);
  return m;
});
// Encaixar na lateral ou no rodapé da tela (área útil: não invade a barra de tarefas)
ipcMain.on('janela:encaixar', (e, pos) => {
  const w = janelaDe(e), id = idDe(e.sender); if (!w || !id) return;
  const b = w.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  const larg = Math.min(Math.max(b.width, 260), 420);   // lateral: largura de post-it (não a tela toda)
  if (pos === 'direita')  w.setBounds({ x: wa.x + wa.width - larg, y: wa.y, width: larg, height: wa.height });
  if (pos === 'esquerda') w.setBounds({ x: wa.x, y: wa.y, width: larg, height: wa.height });
  if (pos === 'rodape')   { const h = Math.min(Math.max(b.height, 220), 300); w.setBounds({ x: wa.x, y: wa.y + wa.height - h, width: wa.width, height: h }); }
  guardar(id, w);
});
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
