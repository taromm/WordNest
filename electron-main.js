'use strict';

const path = require('node:path');
const fs = require('node:fs');
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  Notification,
  ipcMain,
  dialog,
  shell,
} = require('electron');
const { Store, dueCount, dueWords, BOOKS } = require('./src/store');
const { recognizeImage, tessdataPath } = require('./src/ocr');
const { lookupWord, lookupExamples } = require('./src/dictionary');

const BOOK_NAMES = {
  reading: '阅读',
  listening: '听力',
  writing: '写作',
  speaking: '口语',
};

let mainWindow = null;
let tray = null;
let store = null;
let quitting = false;
let reminderTimer = null;

app.setName('词栖');
const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();

app.on('second-instance', () => showWindow());

function dataFile() {
  return path.join(app.getPath('userData'), 'wordnest-data.json');
}

function showWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function iconImage() {
  const iconPath = path.join(__dirname, 'build', 'icon.png');
  if (fs.existsSync(iconPath)) return nativeImage.createFromPath(iconPath);
  return nativeImage.createEmpty();
}

function applyDockIcon() {
  if (process.platform !== 'darwin' || !app.dock) return;
  const image = iconImage();
  if (!image.isEmpty()) app.dock.setIcon(image);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#f4b8c5',
    icon: iconImage(),
    title: '词栖',
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on('close', (event) => {
    if (process.platform === 'darwin' && !quitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));
}

function installMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      label: '单词',
      submenu: [
        { label: '开始复习', accelerator: 'CmdOrCtrl+R', click: () => sendReview() },
        { label: '显示词栖', click: () => showWindow() },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function sendReview() {
  showWindow();
  if (mainWindow) mainWindow.webContents.send('review:start');
}

function dueSummary() {
  const state = store.getState();
  const due = dueWords(state);
  const byBook = {};
  for (const item of due) byBook[item.bookId] = (byBook[item.bookId] || 0) + 1;
  const parts = BOOKS.filter(id => byBook[id]).map(id => `${BOOK_NAMES[id]} ${byBook[id]} 词`);
  return { count: due.length, body: parts.join(' · ') || '有单词待复习' };
}

function updateBadgeAndTray() {
  const { count } = dueSummary();
  if (app.dock) app.dock.setBadge(count ? String(count) : '');
  if (tray) {
    tray.setToolTip(count ? `词栖 · ${count} 个单词待复习` : '词栖 · 暂无到期单词');
  }
}

function notifyReview() {
  const { count, body } = dueSummary();
  if (!count || !Notification.isSupported()) return;
  const note = new Notification({
    title: '词栖 · 该复习了',
    body,
    silent: false,
  });
  note.on('click', () => sendReview());
  note.show();
  store.updateSettings({ lastNotifiedAt: new Date().toISOString() });
}

function startReminderLoop() {
  if (reminderTimer) clearInterval(reminderTimer);
  const tick = () => {
    if (!store) return;
    const state = store.getState();
    updateBadgeAndTray();
    if (!state.settings.reminderEnabled) return;
    if (!dueCount(state)) return;
    if (!state.settings.lastNotifiedAt) {
      store.updateSettings({ lastNotifiedAt: new Date().toISOString() });
      return;
    }
    const minutes = Math.min(120, Math.max(60, Number(state.settings.reminderMinutes) || 90));
    const elapsed = Date.now() - Date.parse(state.settings.lastNotifiedAt);
    if (elapsed >= minutes * 60 * 1000) notifyReview();
  };
  tick();
  reminderTimer = setInterval(tick, 30 * 1000);
}

function createTray() {
  const image = iconImage().resize({ width: 18, height: 18 });
  tray = new Tray(image.isEmpty() ? nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAPUlEQVQ4T2NkYGD4z0ABYCSDQYMGMYARj0aG/4wMDAxwPch8RigbnyFYxYcMGAYjMA4YqY5h1DAaGGgAAGmQAxG0N2iFAAAAAElFTkSuQmCC') : image);
  tray.setToolTip('词栖');
  tray.on('click', () => showWindow());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开词栖', click: () => showWindow() },
    { label: '开始复习', click: () => sendReview() },
    { type: 'separator' },
    { label: '退出', click: () => { quitting = true; app.quit(); } },
  ]));
}

function registerIpc() {
  ipcMain.handle('store:get', () => store.getState());
  ipcMain.handle('store:addWords', (_, { bookId, words }) => store.addWords(bookId, words));
  ipcMain.handle('store:updateWord', (_, { bookId, id, patch }) => store.updateWord(bookId, id, patch));
  ipcMain.handle('store:deleteWord', (_, { bookId, id }) => store.deleteWord(bookId, id));
  ipcMain.handle('store:deleteWords', (_, { bookId, ids }) => store.deleteWords(bookId, ids));
  ipcMain.handle('store:reviewWord', (_, { bookId, id, rating }) => store.reviewWord(bookId, id, rating));
  ipcMain.handle('store:updateSettings', (_, patch) => {
    const state = store.updateSettings(patch);
    if (Object.prototype.hasOwnProperty.call(patch || {}, 'launchAtLogin')) {
      app.setLoginItemSettings({ openAtLogin: Boolean(patch.launchAtLogin) });
    }
    updateBadgeAndTray();
    return state;
  });
  ipcMain.handle('store:info', () => ({
    filePath: dataFile(),
    userData: app.getPath('userData'),
  }));
  ipcMain.handle('store:openFolder', () => shell.openPath(app.getPath('userData')));
  ipcMain.handle('store:export', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出单词本',
      defaultPath: `词栖备份-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    fs.writeFileSync(result.filePath, JSON.stringify(store.getState(), null, 2), 'utf8');
    return { canceled: false, filePath: result.filePath };
  });
  ipcMain.handle('store:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '导入单词本（合并，不删除现有单词）',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const incoming = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
    const summary = store.importMerge(incoming);
    updateBadgeAndTray();
    return { canceled: false, summary };
  });
  ipcMain.handle('ocr:recognize', async (_, payload) => {
    return recognizeImage({
      dataUrl: payload.dataUrl,
      regionDataUrls: payload.regionDataUrls || [],
      cachePath: tessdataPath(app.getPath('userData')),
      mode: payload.mode,
    });
  });
  ipcMain.handle('dict:lookup', async (_, word) => lookupWord(word));
  ipcMain.handle('dict:examples', async (_, payload) => lookupExamples((payload || {}).word, (payload || {}).sense));
}

app.whenReady().then(() => {
  store = new Store(dataFile());
  store.load();
  app.setLoginItemSettings({ openAtLogin: Boolean(store.getState().settings.launchAtLogin) });
  applyDockIcon();
  installMenu();
  createTray();
  registerIpc();
  createWindow();
  startReminderLoop();
  app.on('activate', () => showWindow());
});

app.on('before-quit', () => {
  quitting = true;
  if (reminderTimer) clearInterval(reminderTimer);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
