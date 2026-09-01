const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { execFile } = require('child_process')
const { promisify } = require('util')

const execFileAsync = promisify(execFile)
const isDev = !app.isPackaged

const JUNK_DIRS = new Set([
  'System Volume Information',
  '$RECYCLE.BIN',
  '.Trashes',
  '.Spotlight-V100',
  '.fseventsd',
])

function configPath() {
  return path.join(app.getPath('userData'), 'config.json')
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'))
  } catch {
    return { apiUrl: 'http://192.168.1.198:8080', apiKey: '' }
  }
}

function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true })
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2))
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    title: 'Maxim Local Archive',
    backgroundColor: '#0c1118',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.once('ready-to-show', () => win.show())

  if (isDev) {
    win.loadURL('http://127.0.0.1:5179')
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('config:get', () => readConfig())
ipcMain.handle('config:set', (_e, cfg) => {
  writeConfig(cfg)
  return readConfig()
})

ipcMain.handle('usb:list', async () => {
  if (process.platform !== 'win32') return []
  const ps = `
    Get-CimInstance Win32_LogicalDisk -Filter "DriveType=2" |
      Where-Object { $_.Size -gt 0 } |
      Select-Object DeviceID, VolumeName, Size, FreeSpace |
      ConvertTo-Json -Compress
  `
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true })
    const raw = stdout.trim()
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return []
  }
})

ipcMain.handle('fs:listFiles', async (_e, rootPath) => {
  const results = []
  function walk(dir, rel = '') {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      if (ent.name.startsWith('.') || JUNK_DIRS.has(ent.name)) continue
      const abs = path.join(dir, ent.name)
      const nextRel = rel ? `${rel}/${ent.name}` : ent.name
      if (ent.isDirectory()) walk(abs, nextRel)
      else if (ent.isFile()) {
        try {
          const st = fs.statSync(abs)
          results.push({ abs, rel: nextRel.replace(/\\/g, '/'), size: st.size, name: ent.name })
        } catch {
          /* skip */
        }
      }
    }
  }
  walk(rootPath)
  return results
})

ipcMain.handle('fs:listTopFolders', async (_e, rootPath) => {
  try {
    return fs
      .readdirSync(rootPath, { withFileTypes: true })
      .filter((ent) => ent.isDirectory() && !ent.name.startsWith('.') && !JUNK_DIRS.has(ent.name))
      .map((ent) => ({
        name: ent.name,
        abs: path.join(rootPath, ent.name),
      }))
  } catch {
    return []
  }
})

ipcMain.handle('dialog:pickFolder', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (res.canceled || !res.filePaths[0]) return null
  return res.filePaths[0]
})

ipcMain.handle('dialog:pickFiles', async () => {
  const res = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
  })
  if (res.canceled || !res.filePaths.length) return []
  return res.filePaths.map((abs) => {
    const st = fs.statSync(abs)
    return { abs, rel: path.basename(abs), size: st.size, name: path.basename(abs) }
  })
})

ipcMain.handle('shell:openPath', async (_e, p) => shell.openPath(p))

ipcMain.handle('fs:readFile', async (_e, absPath) => {
  // Base64 avoids Electron IPC stripping binary Uint8Array/Buffer payloads to empty.
  const buf = fs.readFileSync(absPath)
  return {
    size: buf.length,
    base64: buf.toString('base64'),
  }
})

ipcMain.handle('fs:statPath', async (_e, absPath) => {
  const st = fs.statSync(absPath)
  return {
    abs: absPath,
    name: path.basename(absPath),
    size: st.size,
    isDirectory: st.isDirectory(),
  }
})

ipcMain.handle('fs:pathExists', async (_e, p) => {
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
})

ipcMain.handle('fs:isDirectory', async (_e, p) => {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
})
