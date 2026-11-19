const { app, BrowserWindow, ipcMain, screen, nativeTheme, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.setAppUserModelId('br.postit.demandas');

// Aviso do Windows (canto da tela) + pisca o ícone na barra de tarefas
function avisar(titulo, corpo, aoClicar) {
  try {
    if (Notification.isSupported()) {
      const n = new Notification({ title: titulo, body: corpo });
      if (aoClicar) n.on('click', aoClicar);
      n.show();
    }
  } catch (e) {}
  if (win && !win.isDestroyed()) win.flashFrame(true);
}
let versaoAvisada = null;

let win = null;
const arqEstado = () => path.join(app.getPath('userData'), 'janela.json');
function lerEstado() { try { return JSON.parse(fs.readFileSync(arqEstado(), 'utf8')); } catch (e) { return {}; } }
function salvarEstado() {
  if (!win || win.isDestroyed()) return;
  try { fs.writeFileSync(arqEstado(), JSON.stringify({ ...win.getBounds(), top: win.isAlwaysOnTop() })); } catch (e) {}
}

function criar() {
  const e = lerEstado();
  const wa = screen.getPrimaryDisplay().workArea;
  const w = e.width || 400, h = e.height || 640;
  const visivel = e.x !== undefined && screen.getAllDisplays().some(d =>
    e.x >= d.bounds.x - 50 && e.x < d.bounds.x + d.bounds.width && e.y >= d.bounds.y && e.y < d.bounds.y + d.bounds.height);
  win = new BrowserWindow({
    width: w, height: h,
    x: visivel ? e.x : wa.x + wa.width - w - 20,
    y: visivel ? e.y : wa.y + 40,
    minWidth: 380, minHeight: 320,
    frame: false,
    alwaysOnTop: e.top !== false,
    autoHideMenuBar: true,
    title: 'Post-it Demandas',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#09111B' : '#FFFFFF',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, 'index.html'));
  let t = null;
  const agendar = () => { clearTimeout(t); t = setTimeout(salvarEstado, 400); };
  win.on('move', agendar); win.on('resize', agendar); win.on('close', salvarEstado);
  win.on('closed', () => { win = null; });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
function iniciarAtualizacao() {
  if (!app.isPackaged) return;            // só no programa instalado
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // se ignorar o aviso, atualiza ao fechar
  autoUpdater.on('update-available', (info) => {
    if (win) win.webContents.send('update:disponivel', info.version);
    if (versaoAvisada !== info.version) {
      versaoAvisada = info.version;
      avisar('Atualização disponível', 'A versão ' + info.version + ' do Post-it está sendo baixada.');
    }
  });
  autoUpdater.on('update-downloaded', (info) => {
    if (win) win.webContents.send('update:pronta', info.version);
    avisar('Atualização pronta', 'Versão ' + info.version + ' baixada. Clique aqui para reiniciar e atualizar.', () => autoUpdater.quitAndInstall());
  });
  autoUpdater.on('error', () => {});       // sem internet/GitHub fora do ar: segue normal
  const checar = () => autoUpdater.checkForUpdates().catch(() => {});
  checar();
  setInterval(checar, 60 * 60 * 1000);     // e a cada 1 hora
  let ultima = Date.now();
  app.on('browser-window-focus', () => {   // e ao voltar para o post-it (no máximo a cada 15 min)
    if (Date.now() - ultima > 15 * 60 * 1000) { ultima = Date.now(); checar(); }
  });
}

app.whenReady().then(() => { criar(); iniciarAtualizacao(); });
app.on('window-all-closed', () => app.quit());

ipcMain.handle('top:get', () => win ? win.isAlwaysOnTop() : true);
ipcMain.handle('top:toggle', () => { const v = !win.isAlwaysOnTop(); win.setAlwaysOnTop(v); salvarEstado(); return v; });
ipcMain.on('win:min', () => win && win.minimize());
ipcMain.on('win:close', () => app.quit());
ipcMain.handle('auto:get', () => app.getLoginItemSettings().openAtLogin);
ipcMain.on('auto:set', (_e, v) => app.setLoginItemSettings({ openAtLogin: !!v }));
ipcMain.handle('app:versao', () => app.getVersion());
ipcMain.on('update:instalar', () => autoUpdater.quitAndInstall());
ipcMain.handle('update:checar', async () => {
  if (!app.isPackaged) return 'dev';
  try {
    const r = await autoUpdater.checkForUpdates();
    return r && r.updateInfo && r.updateInfo.version !== app.getVersion() ? 'nova' : 'atual';
  } catch (e) { return 'erro'; }
});
