const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const pdf = require('./pdf.cjs');
const count = require('./count.cjs');
const fs = require('node:fs');
const completedPaths = new Set();
const completedReportPaths = new Set();
const completedCountReportPaths = new Set();
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
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
  return language;
}

function getTheme() { return getSettings().theme === 'dark' ? 'dark' : 'light'; }
function saveTheme(theme) {
  if (!['light', 'dark'].includes(theme)) throw Error('Unsupported theme.');
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify({ ...getSettings(), theme }, null, 2), 'utf8');
  return theme;
}

function window() {
  const win = new BrowserWindow({ width: 1050, height: 760, minWidth: 800, minHeight: 600, title: 'SAFE PDF RENAME', icon: path.join(__dirname, '../dist/logo.ico'), webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
  if (app.isPackaged) win.loadFile(path.join(__dirname, '../dist/index.html')); else win.loadURL('http://localhost:5175');
}
app.whenReady().then(window);
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
ipcMain.handle('preview', (_, input) => pdf.preview({ ...input, destinations: getDestinations() }));
ipcMain.handle('run', async (_, input) => { if(!input || typeof input.token !== 'string') throw Error('Invalid run request'); const result=pdf.run(input); for(const key of ['backupPath','outputPath','reportPath']) completedPaths.add(path.resolve(result[key])); completedReportPaths.add(path.resolve(result.reportPath)); return result; });
ipcMain.handle('read-report', (_, value) => { if(typeof value !== 'string' || (!completedReportPaths.has(path.resolve(value)) && !completedCountReportPaths.has(path.resolve(value))) || !fs.existsSync(value)) throw Error('Invalid report'); return fs.readFileSync(path.resolve(value), 'utf8'); });
ipcMain.handle('open-path', async (_, value) => { if(typeof value !== 'string' || !completedPaths.has(path.resolve(value)) || !fs.existsSync(value)) throw Error('Chỉ có thể mở thư mục hoặc báo cáo của lần chạy hoàn tất.'); return shell.openPath(path.resolve(value)); });
