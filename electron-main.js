'use strict';

const path = require('node:path');
const fs = require('node:fs');
const ofs = require('original-fs');
const https = require('node:https');
const { execFile, spawn } = require('node:child_process');
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
  if (!mainWindow.isVisible()) mainWindow.show();
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
  const windowOptions = {
    width: 1280,
    height: 840,
    minWidth: 420,
    minHeight: 520,
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
  };
  if (process.platform === 'darwin') {
    windowOptions.titleBarStyle = 'hiddenInset';
    windowOptions.trafficLightPosition = { x: 18, y: 16 };
  }
  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.on('minimize', (event) => {
    if (process.platform === 'darwin') {
      event.preventDefault();
      mainWindow.hide();
    }
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

const RELEASE_API = 'https://api.github.com/repos/taromm/WordNest/releases/latest';
let pendingUpdate = null;

function repoRoot() {
  const candidates = [__dirname, process.cwd()];
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, '.git'))) return dir;
  }
  return '';
}

function runGit(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: 90000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const detail = String(stderr || stdout || err.message || '').trim();
        reject(new Error(detail || 'git 失败'));
        return;
      }
      resolve(String(stdout || '').trim());
    });
  });
}

function isNewerVersion(remote, local) {
  const parse = (value) => String(value || '').replace(/^v/, '').split('.').map((part) => parseInt(part, 10) || 0);
  const left = parse(remote);
  const right = parse(local);
  for (let i = 0; i < 3; i += 1) {
    if ((left[i] || 0) !== (right[i] || 0)) return (left[i] || 0) > (right[i] || 0);
  }
  return false;
}

function fetchJson(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error('检查更新失败'));
      return;
    }
    const req = https.get(url, {
      headers: { 'User-Agent': 'Wordnest', Accept: 'application/vnd.github+json' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        fetchJson(res.headers.location, redirects + 1).then(resolve, reject);
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        if (res.statusCode === 404) {
          resolve(null);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error('检查更新失败'));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
  });
}

function downloadFile(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error('下载更新失败'));
      return;
    }
    const req = https.get(url, { headers: { 'User-Agent': 'Wordnest' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        downloadFile(res.headers.location, dest, redirects + 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error('下载更新失败'));
        return;
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close((err) => (err ? reject(err) : resolve())));
      file.on('error', (err) => file.close(() => reject(err)));
    });
    req.on('error', reject);
  });
}

function pickMacZip(assets) {
  const list = (assets || []).filter((item) => /-mac-.*\.zip$/i.test(item.name || '') && item.browser_download_url);
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return list.find((item) => item.name.includes(`-mac-${arch}.`))
    || list.find((item) => item.name.includes('-mac-universal.'))
    || null;
}

function currentAppBundle() {
  const bundle = path.resolve(process.execPath, '../../..');
  if (!bundle.endsWith('.app')) throw new Error('找不到正在运行的应用。');
  return bundle;
}

async function checkGitUpdate() {
  const root = repoRoot();
  if (!root) return { available: false };
  await runGit(['fetch', '--quiet', 'origin', 'main'], root);
  const local = await runGit(['rev-parse', 'HEAD'], root);
  const remote = await runGit(['rev-parse', 'origin/main'], root);
  if (!remote || remote === local) return { available: false };
  try {
    await runGit(['merge-base', '--is-ancestor', 'HEAD', 'origin/main'], root);
  } catch (_) {
    return { available: false };
  }
  return { available: true };
}

async function applyGitUpdate() {
  const root = repoRoot();
  if (!root) throw new Error('当前不是从项目目录打开的，没法在这里直接更新。');
  await runGit(['pull', '--ff-only', 'origin', 'main'], root);
  quitting = true;
  app.relaunch();
  app.exit(0);
}

async function checkReleaseUpdate() {
  if (process.platform !== 'darwin') return { available: false };
  const release = await fetchJson(RELEASE_API);
  if (!release) return { available: false };
  const version = String(release.tag_name || '').replace(/^v/, '');
  const asset = pickMacZip(release.assets);
  if (!asset || !isNewerVersion(version, app.getVersion())) {
    pendingUpdate = null;
    return { available: false };
  }
  pendingUpdate = { version, url: asset.browser_download_url };
  return { available: true, version };
}

async function applyReleaseUpdate() {
  if (!pendingUpdate) {
    const info = await checkReleaseUpdate();
    if (!info.available) throw new Error('现在已经是最新版本。');
  }
  const bundle = currentAppBundle();
  try {
    fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
  } catch (_) {
    throw new Error('请先把词栖拖进「应用程序」文件夹，再点更新。');
  }
  const tempRoot = path.join(app.getPath('temp'), 'wordnest-update');
  await new Promise((resolve, reject) => {
    execFile('rm', ['-rf', tempRoot], { timeout: 60000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(String(stderr || err.message || '清理更新目录失败').trim()));
      else resolve();
    });
  });
  ofs.mkdirSync(tempRoot, { recursive: true });
  const zipPath = path.join(tempRoot, 'update.zip');
  const extractDir = path.join(tempRoot, 'unpacked');
  ofs.mkdirSync(extractDir, { recursive: true });
  await downloadFile(pendingUpdate.url, zipPath);
  await new Promise((resolve, reject) => {
    execFile('ditto', ['-x', '-k', zipPath, extractDir], { timeout: 180000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(String(stderr || stdout || err.message || '解压更新失败').trim()));
      else resolve();
    });
  });
  const appName = ofs.readdirSync(extractDir).find((name) => name.endsWith('.app'));
  if (!appName) throw new Error('更新包里没有应用。');
  const scriptPath = path.join(tempRoot, 'apply.sh');
  fs.writeFileSync(scriptPath, `#!/bin/bash
pid="$1"
src="$2"
dest="$3"
case "$dest" in *.app) ;; *) exit 1 ;; esac
case "$src" in *.app) ;; *) exit 1 ;; esac
while kill -0 "$pid" 2>/dev/null; do
  sleep 0.3
done
rm -rf "$dest"
ditto "$src" "$dest"
xattr -dr com.apple.quarantine "$dest" 2>/dev/null || true
open "$dest"
`, { mode: 0o755 });
  const child = spawn('bash', [scriptPath, String(process.pid), path.join(extractDir, appName), bundle], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  setTimeout(() => {
    quitting = true;
    app.quit();
  }, 400);
  return { restarting: true };
}

async function checkAppUpdate() {
  if (app.isPackaged) return checkReleaseUpdate();
  return checkGitUpdate();
}

async function applyAppUpdate() {
  if (app.isPackaged) return applyReleaseUpdate();
  return applyGitUpdate();
}

function registerIpc() {
  ipcMain.handle('store:get', () => store.getState());
  ipcMain.handle('store:addWords', (_, { bookId, words }) => store.addWords(bookId, words));
  ipcMain.handle('store:updateWord', (_, { bookId, id, patch }) => store.updateWord(bookId, id, patch));
  ipcMain.handle('store:deleteWord', (_, { bookId, id }) => store.deleteWord(bookId, id));
  ipcMain.handle('store:deleteWords', (_, { bookId, ids }) => store.deleteWords(bookId, ids));
  ipcMain.handle('store:tagWords', (_, { bookId, ids, tags }) => store.tagWords(bookId, ids, tags));
  ipcMain.handle('store:reviewWord', (_, { bookId, id, rating }) => store.reviewWord(bookId, id, rating));
  ipcMain.handle('store:updateNotebook', (_, { bookId, text }) => store.updateNotebook(bookId, text));
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
  ipcMain.handle('store:importOverwrite', (_, incoming) => store.importOverwrite(incoming));
  ipcMain.handle('store:exportPublic', () => store.exportPublicState());
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
  ipcMain.handle('app:checkUpdate', () => checkAppUpdate());
  ipcMain.handle('app:applyUpdate', () => applyAppUpdate());
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
  setTimeout(() => {
    checkAppUpdate().then((info) => {
      if (info && info.available && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('app:update-available', info);
      }
    }).catch(() => {});
  }, 4000);
  setInterval(() => {
    checkAppUpdate().then((info) => {
      if (info && info.available && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('app:update-available', info);
      }
    }).catch(() => {});
  }, 30 * 60 * 1000);
  app.on('activate', () => showWindow());
});

app.on('before-quit', () => {
  quitting = true;
  if (reminderTimer) clearInterval(reminderTimer);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
