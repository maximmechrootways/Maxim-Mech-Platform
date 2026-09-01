const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('maximDesktop', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (cfg) => ipcRenderer.invoke('config:set', cfg),
  listUsbDrives: () => ipcRenderer.invoke('usb:list'),
  listFiles: (rootPath) => ipcRenderer.invoke('fs:listFiles', rootPath),
  listTopFolders: (rootPath) => ipcRenderer.invoke('fs:listTopFolders', rootPath),
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  pickFiles: () => ipcRenderer.invoke('dialog:pickFiles'),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  readFile: (absPath) => ipcRenderer.invoke('fs:readFile', absPath),
  statPath: (absPath) => ipcRenderer.invoke('fs:statPath', absPath),
  pathExists: (p) => ipcRenderer.invoke('fs:pathExists', p),
  isDirectory: (p) => ipcRenderer.invoke('fs:isDirectory', p),
  /** Resolve absolute path from a File dropped into the renderer (Electron 33+). */
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return file.path || ''
    }
  },
})
