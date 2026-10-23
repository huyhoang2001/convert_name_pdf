const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const pdf = require('./pdf.cjs');
const count = require('./count.cjs');
const translation = require('./translation.cjs');
const { isNewerVersion, isWindowsExecutable, portableUpdateScript } = require('./update.cjs');
const fs = require('node:fs');
const releasesApi = 'https://api.github.com/repos/huyhoang2001/convert_name_pdf/releases/latest';
const releasesPage = 'https://github.com/huyhoang2001/convert_name_pdf/releases/latest';
const completedPaths = new Set();
const completedReportPaths = new Set();
const completedCountReportPaths = new Set();
app.setPath('userData', path.join(app.getPath('appData'), app.getName()));
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let mainWindow;
const updateText = (en, vi) => getLanguage() === 'VI' ? vi : en;
function defaultDestinations() {
  const base = path.join(app.getPath('documents'), 'SAFE PDF RENAME');
  return { backup: path.join(base, 'Backup'), output: path.join(base, 'Output') };
}
function getSettings() { try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; } }
function getDestinations() { return { ...defaultDestinations(), ...getSettings().destinations }; }
function saveDestinations(destinations) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify({ ...getSettings(), destinations }, null, 2), 'utf8');
}
function getLanguage() { return getSettings().language === 'VI' ? 'VI' : 'EN'; }
function saveLanguage(language) {
  if (!['EN', 'VI'].includes(language)) throw Error('Unsupported language.');
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify({ ...getSettings(), language }, null, 2), 'utf8');
  setApplicationMenu();
  return language;
}

function getTheme() { return getSettings().theme === 'dark' ? 'dark' : 'light'; }
function saveTheme(theme) {
  if (!['light', 'dark'].includes(theme)) throw Error('Unsupported theme.');
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify({ ...getSettings(), theme }, null, 2), 'utf8');
  return theme;
}

function setApplicationMenu() {
  const text = (en, vi) => updateText(en, vi);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: text('File', 'Tệp'), submenu: [{ role: 'quit', label: text('Quit', 'Thoát') }] },
    { label: text('Edit', 'Chỉnh sửa'), submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: text('View', 'Xem'), submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { label: text('Window', 'Cửa sổ'), submenu: [
      { role: 'minimize' }, { role: 'close' }, { type: 'separator' },
      { label: text('Check for updates...', 'Kiểm tra bản cập nhật...'), click: () => void checkForUpdates() },
      { label: text('Install update from file...', 'Cài đặt bản cập nhật từ tệp...'), click: () => void importUpdate() }
    ] },
    { label: text('Help', 'Trợ giúp'), submenu: [{ label: text('About SAFE PDF RENAME', 'Giới thiệu SAFE PDF RENAME'), click: () => void dialog.showMessageBox(mainWindow, { type: 'info', title: 'SAFE PDF RENAME', message: `SAFE PDF RENAME ${app.getVersion()}` }) }] }
  ]));
}

function showUpdateMessage(en, vi, type = 'info') {
  return dialog.showMessageBox(mainWindow, { type, title: updateText('SAFE PDF RENAME updates', 'Cập nhật SAFE PDF RENAME'), message: updateText(en, vi), buttons: [updateText('OK', 'Đóng')] });
}

async function getLatestRelease() {
  const response = await fetch(releasesApi, { headers: { 'User-Agent': 'SAFE-PDF-RENAME' }, signal: AbortSignal.timeout(15000) });
  if (response.status === 404) return null;
  if (!response.ok) throw Error(`GitHub returned HTTP ${response.status}.`);
  return response.json();
}

function portableExecutablePath() {
  const value = process.env.PORTABLE_EXECUTABLE_FILE;
  if (!app.isPackaged || process.platform !== 'win32' || !value || !path.isAbsolute(value) || !fs.existsSync(value)) throw Error('Portable executable path is unavailable.');
  return path.resolve(value);
}

async function installPortableUpdate(filePath, confirmed = false) {
  const target = portableExecutablePath();
  if (path.resolve(filePath).toLowerCase() === target.toLowerCase() || !isWindowsExecutable(filePath)) throw Error('Choose a different valid Windows executable.');
  if (!confirmed) {
    const confirm = await dialog.showMessageBox(mainWindow, {
      type: 'warning', title: updateText('Install update', 'Cài đặt bản cập nhật'),
      message: updateText('The selected portable executable will replace the app after it closes. Your settings and PDF files will not be changed.', 'Tệp ứng dụng đã chọn sẽ thay thế ứng dụng sau khi đóng. Cài đặt và tệp PDF của bạn sẽ không bị thay đổi.'),
      buttons: [updateText('Install and restart', 'Cài đặt và khởi động lại'), updateText('Cancel', 'Hủy')], defaultId: 1, cancelId: 1
    });
    if (confirm.response !== 0) return;
  }

  const updatesDir = path.join(app.getPath('userData'), 'updates');
  fs.mkdirSync(updatesDir, { recursive: true });
  const staged = path.join(updatesDir, 'SAFE PDF RENAME update.exe');
  const helper = path.join(updatesDir, 'install-update.vbs');
  const pending = path.join(updatesDir, 'pending.json');
  if (fs.existsSync(`${target}.previous`)) throw Error('A previous version backup already exists. Restore or remove it before updating.');
  try {
    fs.copyFileSync(filePath, staged);
    fs.writeFileSync(helper, portableUpdateScript, 'utf8');
    fs.writeFileSync(pending, JSON.stringify({ target }), 'utf8');
    if (path.dirname(filePath) === updatesDir && path.basename(filePath).startsWith('SAFE PDF RENAME downloaded update ')) fs.rmSync(filePath, { force: true });
    await new Promise((resolve, reject) => {
      const child = spawn('wscript.exe', ['//B', '//NoLogo', helper, target, staged, String(process.ppid)], { detached: true, windowsHide: true, stdio: 'ignore' });
      child.once('error', reject);
      child.once('spawn', () => { child.unref(); resolve(); });
    });
  } catch (error) {
    try { fs.rmSync(staged, { force: true }); } catch {}
    try { fs.rmSync(pending, { force: true }); } catch {}
    throw error;
  }
  await showUpdateMessage('The update is staged. The app will close and reopen with the selected version.', 'Bản cập nhật đã sẵn sàng. Ứng dụng sẽ đóng và mở lại với phiên bản mới.');
  app.quit();
}

async function importUpdate() {
  try {
    portableExecutablePath();
    const result = await dialog.showOpenDialog(mainWindow, { title: updateText('Select the new portable app', 'Chọn ứng dụng di động mới'), filters: [{ name: 'SAFE PDF RENAME portable app', extensions: ['exe'] }], properties: ['openFile'] });
    if (!result.canceled && result.filePaths[0]) await installPortableUpdate(result.filePaths[0]);
  } catch (error) {
    await showUpdateMessage(`Could not install the update: ${error.message}`, `Không thể cài đặt bản cập nhật: ${error.message}`, 'error');
  }
}

async function checkForUpdates() {
  let downloaded;
  try {
    const release = await getLatestRelease();
    if (!release) return void await showUpdateMessage('No published releases were found.', 'Chưa tìm thấy bản phát hành nào.');
    if (!isNewerVersion(app.getVersion(), release.tag_name)) return void await showUpdateMessage(`You are using the latest version (${app.getVersion()}).`, `Bạn đang sử dụng phiên bản mới nhất (${app.getVersion()}).`);
    const asset = release.assets?.find(item => /^SAFE PDF RENAME \d.*\.exe$/i.test(item.name));
    if (!asset) {
      const result = await dialog.showMessageBox(mainWindow, { type: 'info', title: updateText('Update available', 'Có bản cập nhật'), message: updateText(`Version ${release.tag_name} is available. Open its release page to download the portable app.`, `Đã có phiên bản ${release.tag_name}. Mở trang phát hành để tải ứng dụng di động.`), buttons: [updateText('Open release page', 'Mở trang phát hành'), updateText('Later', 'Để sau')] });
      if (result.response === 0) await shell.openExternal(releasesPage);
      return;
    }
    const result = await dialog.showMessageBox(mainWindow, { type: 'info', title: updateText('Update available', 'Có bản cập nhật'), message: updateText(`Version ${release.tag_name} is available. Download and install it now?`, `Đã có phiên bản ${release.tag_name}. Tải và cài đặt ngay?`), buttons: [updateText('Download and install', 'Tải và cài đặt'), updateText('Later', 'Để sau')] });
    if (result.response !== 0) return;
    if (!asset.browser_download_url.startsWith('https://github.com/huyhoang2001/convert_name_pdf/releases/download/') || !Number.isSafeInteger(asset.size) || asset.size < 2 || asset.size > 500 * 1024 * 1024) throw Error('The published portable app download is invalid.');
    const response = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok || !response.body) throw Error(`Update download failed (HTTP ${response.status}).`);
    const updatesDir = path.join(app.getPath('userData'), 'updates');
    fs.mkdirSync(updatesDir, { recursive: true });
    downloaded = path.join(updatesDir, `SAFE PDF RENAME downloaded update ${Date.now()}.exe`);
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(downloaded, { flags: 'wx' }));
    if (fs.statSync(downloaded).size !== asset.size || !isWindowsExecutable(downloaded)) throw Error('The downloaded update did not pass file verification.');
    await installPortableUpdate(downloaded, true);
  } catch (error) {
    if (downloaded) try { fs.rmSync(downloaded, { force: true }); } catch {}
    await showUpdateMessage(`Could not check for updates: ${error.message}`, `Không thể kiểm tra bản cập nhật: ${error.message}`, 'error');
  }
}

function window() {
  mainWindow = new BrowserWindow({ width: 1200, height: 800, minWidth: 800, minHeight: 600, title: 'SAFE PDF RENAME', icon: path.join(__dirname, '../dist/logo.ico'), webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
  const portablePath = process.env.PORTABLE_EXECUTABLE_FILE;
  if (portablePath) {
    const pending = path.join(app.getPath('userData'), 'updates', 'pending.json');
    try {
      if (JSON.parse(fs.readFileSync(pending, 'utf8')).target.toLowerCase() === path.resolve(portablePath).toLowerCase()) {
        mainWindow.once('ready-to-show', () => {
          try { fs.rmSync(`${portablePath}.previous`, { force: true }); fs.rmSync(pending, { force: true }); } catch {}
        });
      }
    } catch {}
  }
  if (app.isPackaged) mainWindow.loadFile(path.join(__dirname, '../dist/index.html')); else mainWindow.loadURL('http://localhost:5175');
}
app.whenReady().then(() => { setApplicationMenu(); window(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
ipcMain.handle('pick-folder', async () => (await dialog.showOpenDialog({ properties: ['openDirectory'] })).filePaths[0] || null);
ipcMain.handle('get-destinations', () => getDestinations());
ipcMain.handle('get-language', () => getLanguage());
ipcMain.handle('save-language', (_, language) => saveLanguage(language));
ipcMain.handle('get-theme', () => getTheme());
ipcMain.handle('save-theme', (_, theme) => saveTheme(theme));
ipcMain.handle('pick-destination', async (_, currentPath) => {
  if (typeof currentPath !== 'string' || !path.isAbsolute(currentPath)) throw Error('Invalid destination path');
  const result = await dialog.showOpenDialog({ defaultPath: fs.existsSync(currentPath) ? currentPath : app.getPath('documents'), properties: ['openDirectory', 'createDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('save-destinations', (_, input) => {
  if (!input || !['backup', 'output'].includes(input.kind) || typeof input.value !== 'string' || !path.isAbsolute(input.value)) throw Error('Invalid destination');
  const value = path.resolve(input.value);
  if (!fs.existsSync(value) || !fs.statSync(value).isDirectory()) throw Error('Choose an existing folder.');
  const destinations = { ...getDestinations(), [input.kind]: fs.realpathSync(value) };
  if (destinations.backup.toLowerCase() === destinations.output.toLowerCase()) throw Error('Backup and Output must use different folders.');
  saveDestinations(destinations);
  return destinations;
});
ipcMain.handle('scan', (_, root) => pdf.scan(root));
ipcMain.handle('count-scan', (_, root) => count.scan(root));
ipcMain.handle('count-existing-report', (_, folder) => {
  if (typeof folder !== 'string' || !path.isAbsolute(folder)) throw Error('Choose a valid folder.');
  const root = fs.realpathSync(folder);
  if (!fs.statSync(root).isDirectory()) throw Error('The selected path is not a folder.');
  const report = path.join(root, 'thong_ke.txt');
  try { if (!fs.lstatSync(report).isFile()) return null; return fs.readFileSync(report, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
});
ipcMain.handle('count-save-report', (_, input) => { const report = count.saveReport(input.root, input.language); completedCountReportPaths.add(path.resolve(report)); return report; });
ipcMain.handle('translation-load', () => { try { return translation.loadSheets(JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'translations.json'), 'utf8'))); } catch (error) { if (error.code === 'ENOENT') return translation.loadSheets([]); throw error; } });
ipcMain.handle('translation-save', (_, sheets) => { translation.validateSheets(sheets); fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(path.join(app.getPath('userData'), 'translations.json'), JSON.stringify(sheets, null, 2), 'utf8'); return sheets.length; });
ipcMain.handle('translation-parse-rows', (_, rows) => translation.fromRows(rows));
ipcMain.handle('preview', (_, input) => pdf.preview({ ...input, destinations: getDestinations() }));
ipcMain.handle('run', async (_, input) => { if(!input || typeof input.token !== 'string') throw Error('Invalid run request'); const result=pdf.run(input); for(const key of ['backupPath','outputPath','reportPath']) completedPaths.add(path.resolve(result[key])); completedReportPaths.add(path.resolve(result.reportPath)); return result; });
ipcMain.handle('read-report', (_, value) => { if(typeof value !== 'string' || (!completedReportPaths.has(path.resolve(value)) && !completedCountReportPaths.has(path.resolve(value))) || !fs.existsSync(value)) throw Error('Invalid report'); return fs.readFileSync(path.resolve(value), 'utf8'); });
ipcMain.handle('open-path', async (_, value) => { if(typeof value !== 'string' || !completedPaths.has(path.resolve(value)) || !fs.existsSync(value)) throw Error('Chỉ có thể mở thư mục hoặc báo cáo của lần chạy hoàn tất.'); return shell.openPath(path.resolve(value)); });
