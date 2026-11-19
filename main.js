const { app, BrowserWindow, ipcMain, screen, nativeTheme } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

if (!app.requestSingleInstanceLock()) { app.quit(); }

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
  autoUpdater.on('update-downloaded', (info) => { if (win) win.webContents.send('update:pronta', info.version); });
  autoUpdater.on('error', () => {});       // sem internet/GitHub fora do ar: segue normal
  const checar = () => autoUpdater.checkForUpdates().catch(() => {});
  checar();
  setInterval(checar, 4 * 60 * 60 * 1000); // e a cada 4 horas
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
