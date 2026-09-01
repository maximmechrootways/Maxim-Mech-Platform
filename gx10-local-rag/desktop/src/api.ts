export type DesktopConfig = { apiUrl: string; apiKey: string }

export type UsbDrive = {
  DeviceID: string
  VolumeName?: string
  Size?: number
  FreeSpace?: number
}

export type ListedFile = { abs: string; rel: string; size: number; name: string }

export type TreeFile = {
  id: string
  name: string
  contentType: string | null
  sizeBytes: number
  status: string
  project: string
  folderPath: string
  chunkCount?: number
  error?: string | null
}

export type TreeProject = {
  name: string
  fileCount: number
  folders: Array<{
    path: string
    files: TreeFile[]
  }>
}

export type Gx10Project = {
  name: string
  fileCount: number
  totalSizeBytes: number
  searchableCount: number
  lastUpdated: string | null
}

export type HealthInfo = {
  ok: boolean
  documents: number
  chunks: number
  projects: number
  model?: string
}

declare global {
  interface Window {
    maximDesktop: {
      getConfig: () => Promise<DesktopConfig>
      setConfig: (cfg: DesktopConfig) => Promise<DesktopConfig>
      listUsbDrives: () => Promise<UsbDrive[]>
      listFiles: (rootPath: string) => Promise<ListedFile[]>
      listTopFolders: (rootPath: string) => Promise<Array<{ name: string; abs: string }>>
      pickFolder: () => Promise<string | null>
      pickFiles: () => Promise<ListedFile[]>
      openPath: (p: string) => Promise<string>
      readFile: (absPath: string) => Promise<{ size: number; base64: string }>
      statPath: (absPath: string) => Promise<{ abs: string; name: string; size: number; isDirectory: boolean }>
      pathExists: (p: string) => Promise<boolean>
      isDirectory: (p: string) => Promise<boolean>
      pathForFile: (file: File) => string
    }
  }
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function gx10Fetch(path: string, init?: RequestInit) {
  const cfg = await window.maximDesktop.getConfig()
  if (!cfg.apiUrl || !cfg.apiKey) throw new Error('Configure the GX10 URL and API key first.')
  const res = await fetch(`${cfg.apiUrl.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: {
      'X-API-Key': cfg.apiKey,
      ...(init?.headers || {}),
    },
  })
  return res
}

export async function fetchHealth(): Promise<HealthInfo | null> {
  try {
    const cfg = await window.maximDesktop.getConfig()
    if (!cfg.apiUrl) return null
    const res = await fetch(`${cfg.apiUrl.replace(/\/$/, '')}/health`, {
      headers: cfg.apiKey ? { 'X-API-Key': cfg.apiKey } : undefined,
    })
    if (!res.ok) return null
    return (await res.json()) as HealthInfo
  } catch {
    return null
  }
}

export async function fetchProjects(): Promise<Gx10Project[]> {
  const res = await gx10Fetch('/projects')
  if (!res.ok) throw new Error(await res.text())
  const data = (await res.json()) as { projects: Gx10Project[] }
  return data.projects || []
}

export async function uploadFile(fileAbs: string, relpath: string, project: string) {
  const raw = await window.maximDesktop.readFile(fileAbs)
  const bytes = base64ToUint8Array(raw.base64 || '')
  if (!bytes.byteLength) {
    throw new Error(
      `Refusing to upload empty file: ${relpath}. If this is OneDrive/Google Drive, open the file once locally, then Choose folder again.`
    )
  }
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const blob = new Blob([copy])
  const body = new FormData()
  body.append('file', blob, relpath.split('/').pop() || 'file')
  body.append('relpath', relpath)
  if (project) body.append('project', project)
  const res = await gx10Fetch('/upload', { method: 'POST', body })
  if (!res.ok) throw new Error(await res.text())
  const result = (await res.json()) as { ok?: boolean; sizeBytes?: number }
  if (!result.sizeBytes) {
    throw new Error(`Upload reported 0 bytes for ${relpath} — file did not transfer`)
  }
  return result
}

export async function fetchTree(project?: string): Promise<TreeProject[]> {
  const qs = project ? `?project=${encodeURIComponent(project)}` : ''
  const res = await gx10Fetch(`/tree${qs}`)
  if (!res.ok) throw new Error(await res.text())
  const data = (await res.json()) as { projects: TreeProject[] }
  return data.projects || []
}

export async function fetchFileBlob(id: string): Promise<Blob> {
  const res = await gx10Fetch(`/documents/${encodeURIComponent(id)}/file`)
  if (!res.ok) throw new Error(await res.text())
  return res.blob()
}

export async function fetchUploadStatus(): Promise<{
  pendingFiles: number
  pendingDocuments?: number
  embedQueue?: number
  counts?: { ingested: number; stored: number; failed: number; pending: number }
  pendingProjects?: string[]
  recent: Array<{ name: string; project: string; status: string }>
}> {
  const res = await gx10Fetch('/upload-status')
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
