const { app, BrowserWindow, Menu, dialog, ipcMain, shell, session, safeStorage } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const pdf = require('./pdf.cjs');
const count = require('./count.cjs');
const translation = require('./translation.cjs');
const translationWorkbook = require('./translation-workbook.cjs');
const signatureWorkbook = require('./signature-workbook.cjs');
const copies = require('./copies.cjs');
const copiesWorkbook = require('./copies-workbook.cjs');
const selectorSettings = require('./selector-settings.cjs');
const chatbot = require('./chatbot.cjs');
const { createChatKeyStore } = require('./chat-key.cjs');
const { isNewerVersion, isPortableReleaseAsset, isWindowsExecutable, portableUpdateScript } = require('./update.cjs');
const fs = require('node:fs');
const releasesApi = 'https://api.github.com/repos/huyhoang2001/convert_name_pdf/releases/latest';
const releasesPage = 'https://github.com/huyhoang2001/convert_name_pdf/releases/latest';
const completedPaths = new Set();
const completedReportPaths = new Set();
const completedCountReportPaths = new Set();
const importedTranslationWorkbooks = new Map();
const importedSignatureWorkbooks = new Map();
const importedCopiesWorkbooks = new Map();
app.setPath('userData', path.join(app.getPath('appData'), 'SAFE PDF RENAME'));
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const chatKeyFile = () => path.join(app.isPackaged ? path.dirname(process.env.PORTABLE_EXECUTABLE_FILE || process.execPath) : path.join(__dirname, '..'), '.env');
const chatKeyStore = createChatKeyStore({ file: path.join(app.getPath('userData'), 'openrouter-key.bin'), envFile: chatKeyFile(), safeStorage });
let mainWindow;
let updateCheckInProgress = false;
const updateText = (en, vi) => getLanguage() === 'VI' ? vi : en;
function defaultDestinations() {
  const base = path.join(app.getPath('documents'), 'B6H');
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
    { label: text('Help', 'Trợ giúp'), submenu: [{ label: text('About B6H', 'Giới thiệu B6H'), click: () => void dialog.showMessageBox(mainWindow, { type: 'info', title: 'B6H', message: `B6H ${app.getVersion()}` }) }] }
  ]));
}

function showUpdateMessage(en, vi, type = 'info') {
  return dialog.showMessageBox(mainWindow, { type, title: updateText('B6H updates', 'Cập nhật B6H'), message: updateText(en, vi), buttons: [updateText('OK', 'Đóng')] });
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
  const staged = path.join(updatesDir, 'B6H update.exe');
  const helper = path.join(updatesDir, 'install-update.vbs');
  const pending = path.join(updatesDir, 'pending.json');
  if (fs.existsSync(`${target}.previous`)) throw Error('A previous version backup already exists. Restore or remove it before updating.');
  try {
    fs.copyFileSync(filePath, staged);
    fs.writeFileSync(helper, portableUpdateScript, 'utf8');
    fs.writeFileSync(pending, JSON.stringify({ target }), 'utf8');
    if (path.dirname(filePath) === updatesDir && /^(?:SAFE PDF RENAME|B6H) downloaded update /.test(path.basename(filePath))) fs.rmSync(filePath, { force: true });
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
    const result = await dialog.showOpenDialog(mainWindow, { title: updateText('Select the new portable app', 'Chọn ứng dụng di động mới'), filters: [{ name: 'B6H portable app', extensions: ['exe'] }], properties: ['openFile'] });
    if (!result.canceled && result.filePaths[0]) await installPortableUpdate(result.filePaths[0]);
  } catch (error) {
    await showUpdateMessage(`Could not install the update: ${error.message}`, `Không thể cài đặt bản cập nhật: ${error.message}`, 'error');
  }
}

async function checkForUpdates() {
  if (updateCheckInProgress) return false;
  updateCheckInProgress = true;
  let downloaded;
  try {
    const release = await getLatestRelease();
    if (!release) { mainWindow?.webContents.send('update-status', { kind: 'dismiss' }); await showUpdateMessage('No published releases were found.', 'Chưa tìm thấy bản phát hành nào.'); return false; }
    if (!isNewerVersion(app.getVersion(), release.tag_name)) {
      mainWindow?.webContents.send('update-status', { kind: 'latest', version: app.getVersion(), checkedAt: new Date().toISOString() });
      return true;
    }
    mainWindow?.webContents.send('update-status', { kind: 'dismiss' });
    const asset = release.assets?.find(item => isPortableReleaseAsset(item.name));
    if (!asset) {
      const result = await dialog.showMessageBox(mainWindow, { type: 'info', title: updateText('Update available', 'Có bản cập nhật'), message: updateText(`Version ${release.tag_name} is available. Open its release page to download the portable app.`, `Đã có phiên bản ${release.tag_name}. Mở trang phát hành để tải ứng dụng di động.`), buttons: [updateText('Open release page', 'Mở trang phát hành'), updateText('Later', 'Để sau')] });
      if (result.response === 0) await shell.openExternal(releasesPage);
      return false;
    }
    const result = await dialog.showMessageBox(mainWindow, { type: 'info', title: updateText('Update available', 'Có bản cập nhật'), message: updateText(`Version ${release.tag_name} is available. Download and install it now?`, `Đã có phiên bản ${release.tag_name}. Tải và cài đặt ngay?`), buttons: [updateText('Download and install', 'Tải và cài đặt'), updateText('Later', 'Để sau')] });
    if (result.response !== 0) return false;
    if (!asset.browser_download_url.startsWith('https://github.com/huyhoang2001/convert_name_pdf/releases/download/') || !Number.isSafeInteger(asset.size) || asset.size < 2 || asset.size > 500 * 1024 * 1024) throw Error('The published portable app download is invalid.');
    const response = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok || !response.body) throw Error(`Update download failed (HTTP ${response.status}).`);
    const updatesDir = path.join(app.getPath('userData'), 'updates');
    fs.mkdirSync(updatesDir, { recursive: true });
    downloaded = path.join(updatesDir, `B6H downloaded update ${Date.now()}.exe`);
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(downloaded, { flags: 'wx' }));
    if (fs.statSync(downloaded).size !== asset.size || !isWindowsExecutable(downloaded)) throw Error('The downloaded update did not pass file verification.');
    await installPortableUpdate(downloaded, true);
    return false;
  } catch (error) {
    if (downloaded) try { fs.rmSync(downloaded, { force: true }); } catch {}
    mainWindow?.webContents.send('update-status', { kind: 'dismiss' });
    await showUpdateMessage(`Could not check for updates: ${error.message}`, `Không thể kiểm tra bản cập nhật: ${error.message}`, 'error');
    return false;
  } finally { updateCheckInProgress = false; }
}

function window() {
  mainWindow = new BrowserWindow({ width: 1200, height: 800, minWidth: 800, minHeight: 600, title: 'B6H', icon: path.join(__dirname, '../dist/logo.ico'), webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
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
ipcMain.handle('check-for-updates', () => checkForUpdates());
ipcMain.handle('chat-online-status', async () => (await chatKeyStore.status()).configured);
ipcMain.handle('chat-key-status', () => chatKeyStore.status());
ipcMain.handle('chat-key-save', (_, value) => chatKeyStore.save(value));
ipcMain.handle('chat-key-remove', () => chatKeyStore.remove());
ipcMain.handle('chat-online', async (event, input) => chatbot.askOnline({ ...input, key: await chatKeyStore.resolve(), onProgress: text => event.sender.send('chat-online-progress', { id: input.id, text }) }));
const signatureSettingKeys = new Set(['field:number','field:date','field:person','field:document','field:certifier','field:copies','field:fee','field:notes','header:signatureHeaderNumber','header:signatureHeaderDate','header:signatureHeaderPerson','header:signatureHeaderDocument','header:signatureHeaderSigner','header:signatureHeaderCount','header:signatureHeaderFee','header:signatureHeaderNotes']);
const signatureSettingsFile = () => path.join(app.getPath('userData'), 'signature-settings.json');
function validateSignatureSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 200) throw Error('Invalid Signature Authentication settings.');
  const labels = {};
  for (const [key, label] of Object.entries(value)) {
    if ((!signatureSettingKeys.has(key) && !/^custom:[a-f0-9-]{36}:(?:label|header)$/.test(key)) || typeof label !== 'string') throw Error('Invalid Signature Authentication settings.');
    if (label.length > 1000) throw Error('Signature Authentication labels must be 1,000 characters or fewer.');
    labels[key] = label;
  }
  const customIds = new Set(Object.keys(labels).map(key => key.match(/^custom:([a-f0-9-]{36}):label$/)?.[1]).filter(Boolean));
  for (const id of customIds) if (!labels[`custom:${id}:label`]?.trim() || !labels[`custom:${id}:header`]?.trim()) throw Error('Custom field labels and Excel headers cannot be empty.');
  for (const key of Object.keys(labels)) { const id = key.match(/^custom:([a-f0-9-]{36}):header$/)?.[1]; if (id && !customIds.has(id)) throw Error('Invalid Signature Authentication settings.'); }
  return labels;
}
function readSignatureSettings() { try { return validateSignatureSettings(JSON.parse(fs.readFileSync(signatureSettingsFile(), 'utf8'))); } catch (error) { if (error.code === 'ENOENT') return {}; throw error; } }
ipcMain.handle('signature-settings-load', () => {
  return readSignatureSettings();
});
ipcMain.handle('signature-settings-save', (_, value) => {
  const labels = validateSignatureSettings(value);
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(signatureSettingsFile(), JSON.stringify(labels, null, 2), 'utf8');
  return labels;
});
ipcMain.handle('selector-settings-load', (_, selector) => selectorSettings.load(app.getPath('userData'), selector));
ipcMain.handle('selector-settings-save', (_, selector, value) => selectorSettings.save(app.getPath('userData'), selector, value));
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
function clearTranslationData() {
  fs.rmSync(path.join(app.getPath('userData'), 'translations.json'), { force: true });
  importedTranslationWorkbooks.clear();
  return [];
}
ipcMain.handle('translation-load', () => clearTranslationData());
ipcMain.handle('translation-clear-cache', async () => { clearTranslationData(); await Promise.all([session.defaultSession.clearCache(), session.defaultSession.clearStorageData({ storages: ['cookies', 'shadercache', 'serviceworkers', 'cachestorage'] })]); return true; });
ipcMain.handle('translation-save', (_, sheets) => { translation.validateSheets(sheets); fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(path.join(app.getPath('userData'), 'translations.json'), JSON.stringify(sheets, null, 2), 'utf8'); return sheets.length; });
ipcMain.handle('translation-parse-rows', (_, rows) => translation.fromRowsIfRegister(rows, selectorSettings.load(app.getPath('userData'), 'translation')));
ipcMain.handle('translation-import-workbook', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { title: 'Import translation workbook', properties: ['openFile'], filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }] });
  if (result.canceled) return null;
  const file = fs.realpathSync(result.filePaths[0]);
  const imported = await translationWorkbook.readWorkbook(file, selectorSettings.load(app.getPath('userData'), 'translation'));
  importedTranslationWorkbooks.set(file, imported.sourceMap);
  return imported;
});
ipcMain.handle('translation-refresh-workbook', async (_, value) => {
  const file = typeof value === 'string' ? path.resolve(value) : '';
  if (!importedTranslationWorkbooks.has(file)) throw Error('Import or create this workbook in the current session before refreshing it.');
  const refreshed = await translationWorkbook.readWorkbook(file, selectorSettings.load(app.getPath('userData'), 'translation'));
  importedTranslationWorkbooks.set(file, refreshed.sourceMap);
  return refreshed;
});
ipcMain.handle('translation-save-workbook', async (_, input) => {
  const file = typeof input?.file === 'string' ? path.resolve(input.file) : '';
  const sourceMap = importedTranslationWorkbooks.get(file);
  if (!sourceMap || JSON.stringify(Object.entries(sourceMap).sort()) !== JSON.stringify(Object.entries(input.sourceMap || {}).sort())) throw Error('Import this workbook in the current session before saving it.');
  const result = await translationWorkbook.saveWorkbook(file, input.sheets, sourceMap, 'VI', selectorSettings.load(app.getPath('userData'), 'translation'));
  importedTranslationWorkbooks.set(file, Object.fromEntries(input.sheets.map(sheet => [sheet.id, sheet.name])));
  return result;
});
ipcMain.handle('translation-new-workbook', async (_, sheets) => {
  translation.validateSheets(sheets);
  const result = await dialog.showSaveDialog(mainWindow, { title: 'Create translation workbook', defaultPath: path.join(app.getPath('documents'), 'dich-thuat.xlsx'), filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }] });
  if (result.canceled || !result.filePath) return null;
  const file = path.resolve(path.extname(result.filePath) ? result.filePath : `${result.filePath}.xlsx`);
  await translationWorkbook.createWorkbook(file, sheets, 'VI', selectorSettings.load(app.getPath('userData'), 'translation'));
  const sourceMap = Object.fromEntries(sheets.map(sheet => [sheet.id, sheet.name]));
  importedTranslationWorkbooks.set(file, sourceMap);
  return { file, sourceMap };
});
ipcMain.handle('signature-import-workbook', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { title: 'Import signature authentication workbook', properties: ['openFile'], filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }] });
  if (result.canceled) return null;
  const file = fs.realpathSync(result.filePaths[0]);
  const imported = await signatureWorkbook.readWorkbook(file, readSignatureSettings(), getLanguage());
  importedSignatureWorkbooks.set(file, imported.sourceMap);
  return imported;
});
ipcMain.handle('signature-clear-cache', async () => { importedSignatureWorkbooks.clear(); await Promise.all([session.defaultSession.clearCache(), session.defaultSession.clearStorageData({ storages: ['cookies', 'shadercache', 'serviceworkers', 'cachestorage'] })]); return true; });
ipcMain.handle('signature-refresh-workbook', async (_, value) => {
  const file = typeof value === 'string' ? path.resolve(value) : '';
  if (!importedSignatureWorkbooks.has(file)) throw Error('Import or create this signature workbook in the current session before refreshing it.');
  const refreshed = await signatureWorkbook.readWorkbook(file, readSignatureSettings(), getLanguage());
  importedSignatureWorkbooks.set(file, refreshed.sourceMap);
  return refreshed;
});
ipcMain.handle('signature-save-workbook', async (_, input) => {
  const file = typeof input?.file === 'string' ? path.resolve(input.file) : '';
  const sourceMap = importedSignatureWorkbooks.get(file);
  if (!sourceMap || JSON.stringify(Object.entries(sourceMap).sort()) !== JSON.stringify(Object.entries(input.sourceMap || {}).sort())) throw Error('Import or create this signature workbook in the current session before saving it.');
  await signatureWorkbook.saveWorkbook(file, input.sheets, sourceMap, readSignatureSettings(), getLanguage());
  importedSignatureWorkbooks.set(file, Object.fromEntries(input.sheets.map(sheet => [sheet.id, sheet.name])));
  return input.sheets.length;
});
ipcMain.handle('signature-new-workbook', async (_, sheets) => {
  const result = await dialog.showSaveDialog(mainWindow, { title: 'Create signature authentication workbook', defaultPath: path.join(app.getPath('documents'), 'so-chung-thuc-chu-ky.xlsx'), filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }] });
  if (result.canceled || !result.filePath) return null;
  const file = path.resolve(path.extname(result.filePath) ? result.filePath : `${result.filePath}.xlsx`);
  await signatureWorkbook.createWorkbook(file, sheets, readSignatureSettings(), getLanguage());
  const sourceMap = Object.fromEntries(sheets.map(sheet => [sheet.id, sheet.name]));
  importedSignatureWorkbooks.set(file, sourceMap);
  return { file, sourceMap };
});
ipcMain.handle('copies-import-workbook', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { title: 'Import copies workbook', properties: ['openFile'], filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }] });
  if (result.canceled) return null;
  const file = fs.realpathSync(result.filePaths[0]);
  const imported = await copiesWorkbook.readWorkbook(file, selectorSettings.load(app.getPath('userData'), 'copies'));
  importedCopiesWorkbooks.set(file, imported.sourceMap);
  return imported;
});
ipcMain.handle('copies-clear-cache', async () => { importedCopiesWorkbooks.clear(); await Promise.all([session.defaultSession.clearCache(), session.defaultSession.clearStorageData({ storages: ['cookies', 'shadercache', 'serviceworkers', 'cachestorage'] })]); return true; });
ipcMain.handle('copies-refresh-workbook', async (_, value) => {
  const file = typeof value === 'string' ? path.resolve(value) : '';
  if (!importedCopiesWorkbooks.has(file)) throw Error('Import or create this copies workbook in the current session before refreshing it.');
  const refreshed = await copiesWorkbook.readWorkbook(file, selectorSettings.load(app.getPath('userData'), 'copies'));
  importedCopiesWorkbooks.set(file, refreshed.sourceMap);
  return refreshed;
});
ipcMain.handle('copies-save-workbook', async (_, input) => {
  const file = typeof input?.file === 'string' ? path.resolve(input.file) : '';
  const sourceMap = importedCopiesWorkbooks.get(file);
  if (!sourceMap || JSON.stringify(Object.entries(sourceMap).sort()) !== JSON.stringify(Object.entries(input.sourceMap || {}).sort())) throw Error('Import or create this copies workbook in the current session before saving it.');
  const result = await copiesWorkbook.saveWorkbook(file, input.sheets, sourceMap, selectorSettings.load(app.getPath('userData'), 'copies'));
  importedCopiesWorkbooks.set(file, Object.fromEntries(input.sheets.map(sheet => [sheet.id, sheet.name])));
  return result;
});
ipcMain.handle('copies-new-workbook', async (_, sheets) => {
  copies.validateSheets(sheets);
  const result = await dialog.showSaveDialog(mainWindow, { title: 'Create copies workbook', defaultPath: path.join(app.getPath('documents'), 'copies.xlsx'), filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }] });
  if (result.canceled || !result.filePath) return null;
  const file = path.resolve(path.extname(result.filePath) ? result.filePath : `${result.filePath}.xlsx`);
  await copiesWorkbook.createWorkbook(file, sheets, selectorSettings.load(app.getPath('userData'), 'copies'));
  const sourceMap = Object.fromEntries(sheets.map(sheet => [sheet.id, sheet.name]));
  importedCopiesWorkbooks.set(file, sourceMap);
  return { file, sourceMap };
});
ipcMain.handle('copies-export-workbook', async (_, sheets) => {
  copies.validateSheets(sheets);
  const result = await dialog.showSaveDialog(mainWindow, { title: 'Export copies workbook', defaultPath: path.join(app.getPath('documents'), 'copies.xlsx'), filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }] });
  if (result.canceled || !result.filePath) return null;
  const file = path.resolve(path.extname(result.filePath) ? result.filePath : `${result.filePath}.xlsx`);
  return copiesWorkbook.writeWorkbook(file, sheets, selectorSettings.load(app.getPath('userData'), 'copies'));
});
ipcMain.handle('preview', (_, input) => pdf.preview({ ...input, destinations: getDestinations() }));
ipcMain.handle('run', async (_, input) => { if(!input || typeof input.token !== 'string') throw Error('Invalid run request'); const result=await pdf.run(input); for(const key of ['backupPath','outputPath','reportPath']) completedPaths.add(path.resolve(result[key])); completedReportPaths.add(path.resolve(result.reportPath)); return result; });
ipcMain.handle('read-report', (_, value) => { if(typeof value !== 'string' || (!completedReportPaths.has(path.resolve(value)) && !completedCountReportPaths.has(path.resolve(value))) || !fs.existsSync(value)) throw Error('Invalid report'); return fs.readFileSync(path.resolve(value), 'utf8'); });
ipcMain.handle('open-path', async (_, value) => { if(typeof value !== 'string' || !completedPaths.has(path.resolve(value)) || !fs.existsSync(value)) throw Error('Chỉ có thể mở thư mục hoặc báo cáo của lần chạy hoàn tất.'); return shell.openPath(path.resolve(value)); });
