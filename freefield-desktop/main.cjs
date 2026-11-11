// Freefield Studio: runs Freefield's own Node server (bundled from server/server.ts) inside Electron
// on a free local port and shows the studio in a window. The GPU backend stays where Freefield
// expects it: Modal or your own ComfyUI gateway, set in Settings (COMFY_BASE_URL + FREEFIELD_TOKEN).
const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const http = require('node:http');
const { pathToFileURL } = require('node:url');

const smokeArg = process.argv.find((a) => a.startsWith('--smoke'));
const KEYS = ['COMFY_BASE_URL', 'FREEFIELD_TOKEN', 'FREEFIELD_DRAFTS'];
let mainWindow = null;
let serverPort = 0;

const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf-8')); } catch { return {}; }
}
function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(cfgFile()), { recursive: true });
  fs.writeFileSync(cfgFile(), JSON.stringify(cfg, null, 2));
}
// KEY=VALUE lines of a .env placed next to the .exe (same format as Freefield's .env.example)
function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}
function getJson(port, route) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: route, timeout: 3000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => (res.statusCode === 200 ? resolve(JSON.parse(body)) : reject(new Error(`HTTP ${res.statusCode}`))));
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}
async function waitForServer(port, ms = 30000) {
  const end = Date.now() + ms;
  for (;;) {
    try { return await getJson(port, '/api/apps'); } catch (e) {
      if (Date.now() > end) throw e;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

async function startServer() {
  const exeDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
  const merged = { ...readEnvFile(path.join(exeDir, '.env')), ...loadConfig() };
  for (const [k, v] of Object.entries(merged)) if (v !== '' && v != null) process.env[k] = String(v);
  process.env.FREEFIELD_OUT = path.join(app.getPath('userData'), 'out');   // history and run count, writable per user
  process.env.FREEFIELD_HOST = '127.0.0.1';
  serverPort = await freePort();
  process.env.PORT = String(serverPort);
  await import(pathToFileURL(path.join(__dirname, 'server-dist', 'server.mjs')).href);
  return waitForServer(serverPort);
}

function openSettings(parent) {
  const win = new BrowserWindow({
    width: 560, height: 520, parent, modal: Boolean(parent), resizable: false, title: 'Freefield Studio — настройки',
    backgroundColor: '#09090a', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'settings.html'));
}

function buildMenu() {
  const template = [
    { label: 'Файл', submenu: [
      { label: 'Настройки бэкенда…', accelerator: 'CmdOrCtrl+,', click: () => openSettings(mainWindow) },
      { label: 'Открыть папку с результатами', click: () => shell.openPath(process.env.FREEFIELD_OUT) },
      { label: 'Открыть в браузере', click: () => shell.openExternal(`http://127.0.0.1:${serverPort}`) },
      { type: 'separator' },
      { role: 'quit', label: 'Выход' },
    ] },
    { label: 'Вид', submenu: [
      { role: 'reload', label: 'Обновить' }, { role: 'togglefullscreen', label: 'Во весь экран' },
      { type: 'separator' }, { role: 'zoomIn', label: 'Крупнее' }, { role: 'zoomOut', label: 'Мельче' }, { role: 'resetZoom', label: 'Обычный размер' },
      { type: 'separator' }, { role: 'toggleDevTools', label: 'Инструменты разработчика' },
    ] },
    { label: 'Справка', submenu: [
      { label: 'Freefield на GitHub', click: () => shell.openExternal('https://github.com/neuregex/freefield') },
      { label: 'Как запустить бэкенд (Modal или своя видеокарта)', click: () => shell.openExternal('https://github.com/neuregex/freefield#run-it') },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('settings:get', () => {
  const cfg = loadConfig();
  return Object.fromEntries(KEYS.map((k) => [k, cfg[k] ?? process.env[k] ?? '']));
});
ipcMain.handle('settings:save', (_e, values) => {
  const cfg = loadConfig();
  for (const k of KEYS) cfg[k] = typeof values[k] === 'string' ? values[k].trim() : '';
  saveConfig(cfg);
  app.relaunch();
  app.exit(0);
});

async function main() {
  if (smokeArg) {
    // CI check: the bundled server starts inside the packaged app and lists the apps, then quit
    const out = smokeArg.includes('=') ? smokeArg.split('=').slice(1).join('=') : path.join(app.getPath('userData'), 'smoke.json');
    try {
      const data = await startServer();
      fs.writeFileSync(out, JSON.stringify({ ok: true, apps: data.apps.length, port: serverPort }));
      app.exit(data.apps.length > 0 ? 0 : 1);
    } catch (e) {
      fs.writeFileSync(out, JSON.stringify({ ok: false, error: String(e && e.stack || e) }));
      app.exit(1);
    }
    return;
  }
  try {
    await startServer();
  } catch (e) {
    dialog.showErrorBox('Freefield Studio', `Не удалось запустить сервер студии:\n\n${e && e.stack || e}`);
    app.exit(1);
    return;
  }
  buildMenu();
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 960, minHeight: 600, title: 'Freefield Studio', backgroundColor: '#09090a', show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${serverPort}`)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (!process.env.COMFY_BASE_URL) {
      dialog.showMessageBox(mainWindow, {
        type: 'info', buttons: ['Открыть настройки', 'Позже'], defaultId: 0, title: 'Бэкенд не настроен',
        message: 'Студия работает, но генерация идёт на GPU-бэкенде Freefield.',
        detail: 'Укажите адрес бэкенда (Modal или свой ComfyUI-шлюз) и токен в настройках. Без них можно смотреть приложения и примеры.',
      }).then(({ response }) => { if (response === 0) openSettings(mainWindow); });
    }
  });
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
}

if (!smokeArg && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(main);
}
