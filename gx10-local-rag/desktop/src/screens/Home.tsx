import { useEffect, useState } from 'react'
import { uploadFile, type ListedFile, type UsbDrive } from '../api'

export function HomeScreen({ configured }: { configured: boolean }) {
  const [drives, setDrives] = useState<UsbDrive[]>([])
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [projectOverride, setProjectOverride] = useState('')

  const refresh = async () => {
    const list = await window.maximDesktop.listUsbDrives()
    setDrives(list)
  }

  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 4000)
    return () => clearInterval(t)
  }, [])

  const uploadRoot = async (root: string, asProject?: string) => {
    if (!configured) {
      setStatus('Open Settings and enter the GX10 API key first.')
      return
    }
    setBusy(true)
    setProgress(0)
    try {
      const files: ListedFile[] = await window.maximDesktop.listFiles(root)
      if (files.length === 0) {
        setStatus('No files found to upload.')
        return
      }
      // If uploading a USB root with top-level folders, keep relative paths
      // so each top-level folder becomes a project. Optional override forces one project.
      let ok = 0
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        setStatus(`Uploading ${i + 1}/${files.length}: ${f.rel}`)
        setProgress(Math.round(((i + 1) / files.length) * 100))
        const project = asProject || projectOverride.trim()
        // When no override: empty project so relpath's first segment is the project
        // (upload API treats project+relpath; if project empty, first folder in rel becomes project via inbox structure)
        await uploadFile(f.abs, f.rel, project)
        ok++
      }
      setStatus(`Done — ${ok} file(s) on the way to Maxim. Indexing runs on the GX10 automatically.`)
      setProgress(100)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  const uploadUsb = async (drive: UsbDrive) => {
    const root = `${drive.DeviceID}\\`
    await uploadRoot(root)
  }

  const pickFolder = async () => {
    const folder = await window.maximDesktop.pickFolder()
    if (!folder) return
    // Folder name becomes the project if override empty
    const name = projectOverride.trim() || folder.replace(/\\/g, '/').split('/').filter(Boolean).pop() || ''
    await uploadRoot(folder, name)
  }

  return (
    <div>
      <div className="hero">
        <h1>Upload USB to Maxim</h1>
        <p>
          Plug in the stick, then press the big button. Top-level folders become projects on maximmech.com —
          name them like the job or site (e.g. ONTC Station).
        </p>
      </div>

      {!configured && (
        <p className="warn panel" style={{ marginBottom: '1rem' }}>
          Settings incomplete — enter the GX10 API key before uploading.
        </p>
      )}

      <div className="panel stack">
        <label className="field">
          Force project name (optional)
          <input
            value={projectOverride}
            onChange={(e) => setProjectOverride(e.target.value)}
            placeholder="Leave blank to use USB folder names"
          />
        </label>

        {drives.length === 0 ? (
          <p className="muted">No USB drive detected. Plug one in — this list refreshes automatically.</p>
        ) : (
          drives.map((d) => (
            <div key={d.DeviceID} className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong>{d.VolumeName || 'USB drive'}</strong>
                <div className="muted">{d.DeviceID}</div>
              </div>
              <button type="button" className="cta" disabled={busy || !configured} onClick={() => void uploadUsb(d)}>
                {busy ? 'Uploading…' : 'Upload this USB'}
              </button>
            </div>
          ))
        )}

        <div className="row">
          <button type="button" className="cta secondary" disabled={busy} onClick={() => void refresh()}>
            Refresh drives
          </button>
          <button type="button" className="cta secondary" disabled={busy || !configured} onClick={() => void pickFolder()}>
            Choose folder instead
          </button>
        </div>

        {busy || progress > 0 ? (
          <div className="progress" aria-hidden>
            <span style={{ width: `${progress}%` }} />
          </div>
        ) : null}
        {status && <p className={status.startsWith('Done') ? 'ok' : status.includes('fail') || status.includes('Could') ? 'warn' : 'muted'}>{status}</p>}
      </div>

      <p className="muted" style={{ marginTop: '1.5rem' }}>
        Still works: double-click the old <strong>Upload USB to Maxim</strong> desktop shortcut (PowerShell / SMB).
        Prefer this app when you want progress and a library viewer.
      </p>
    </div>
  )
}
