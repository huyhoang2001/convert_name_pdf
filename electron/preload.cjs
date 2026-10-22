const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pdfApp', {
  pickFolder: () => ipcRenderer.invoke('pick-folder'), pickDestination: current => ipcRenderer.invoke('pick-destination', current),
  getDestinations: () => ipcRenderer.invoke('get-destinations'), saveDestination: (kind, value) => ipcRenderer.invoke('save-destinations', { kind, value }), scan: root => ipcRenderer.invoke('scan', root),
  getLanguage: () => ipcRenderer.invoke('get-language'), saveLanguage: language => ipcRenderer.invoke('save-language', language),
  getTheme: () => ipcRenderer.invoke('get-theme'), saveTheme: theme => ipcRenderer.invoke('save-theme', theme),
  preview: input => ipcRenderer.invoke('preview', input), run: input => ipcRenderer.invoke('run', input),
  countScan: root => ipcRenderer.invoke('count-scan', root), getExistingCountReport: root => ipcRenderer.invoke('count-existing-report', root), saveCountReport: (root, language) => ipcRenderer.invoke('count-save-report', { root, language }),
  openPath: value => ipcRenderer.invoke('open-path', value), readReport: value => ipcRenderer.invoke('read-report', value)
});
