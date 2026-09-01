import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchProjects,
  fetchUploadStatus,
  formatBytes,
  uploadFile,
  type Gx10Project,
  type ListedFile,
  type UsbDrive,
} from '../api'

type StageItem = ListedFile

function joinRel(subfolder: string, rel: string) {
  const sub = subfolder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  const r = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  return sub ? `${sub}/${r}` : r
}

export function StudioScreen({
  configured,
  destination,
  onDestinationChange,
  subfolder,
  onSubfolderChange,
  onUploaded,
}: {
  configured: boolean
  destination: string
  onDestinationChange: (project: string) => void
  subfolder: string
  onSubfolderChange: (path: string) => void
  onUploaded?: () => void
}) {
  const [drives, setDrives] = useState<UsbDrive[]>([])
  const [projects, setProjects] = useState<Gx10Project[]>([])
  const [newProject, setNewProject] = useState('')
  const [staged, setStaged] = useState<StageItem[]>([])
  const [dropOver, setDropOver] = useState(false)
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [projectFilter, setProjectFilter] = useState('')

  const refreshDrives = useCallback(async () => {
    setDrives(await window.maximDesktop.listUsbDrives())
  }, [])

  const refreshProjects = useCallback(async () => {
    if (!configured) return
    try {
      const listed = await fetchProjects()
      const byName = new Map(listed.map((p) => [p.name, p]))
      try {
        const st = await fetchUploadStatus()
        for (const name of st.pendingProjects || []) {
          if (!byName.has(name)) {
            byName.set(name, {
              name,
              fileCount: 0,
              totalSizeBytes: 0,
              searchableCount: 0,
              lastUpdated: null,
            })
          }
        }
      } catch {
        // upload-status is optional for the chip list
      }
      setProjects(Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name)))
    } catch {
      setProjects([])
    }
  }, [configured])

  useEffect(() => {
    void refreshDrives()
    void refreshProjects()
    const t = setInterval(() => {
      void refreshDrives()
    }, 4000)
    return () => clearInterval(t)
  }, [refreshDrives, refreshProjects])

  const filteredProjects = useMemo(() => {
    const q = projectFilter.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p) => p.name.toLowerCase().includes(q))
  }, [projects, projectFilter])

  const effectiveDestination = (newProject.trim() || destination).trim()

  const totalBytes = useMemo(() => staged.reduce((s, f) => s + f.size, 0), [staged])

  const addFiles = (files: ListedFile[]) => {
    setStaged((prev) => {
      const map = new Map(prev.map((f) => [f.abs, f]))
      for (const f of files) map.set(f.abs, f)
      return Array.from(map.values()).sort((a, b) => a.rel.localeCompare(b.rel))
    })
  }

  const stageFolder = async (folderAbs: string, stripRootName = false) => {
    const files = await window.maximDesktop.listFiles(folderAbs)
    if (!files.length) {
      setStatus('No files found in that folder.')
      return
    }
    if (stripRootName) {
      // Keep paths relative to inside the folder (not including folder name as first segment)
      addFiles(files)
    } else {
      addFiles(files)
    }
    setStatus(`Staged ${files.length} file(s) from folder.`)
  }

  const stageUsbFolder = async (folderAbs: string, folderName: string) => {
    if (!destination && !newProject.trim()) {
      onDestinationChange(folderName)
    }
    await stageFolder(folderAbs, true)
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDropOver(false)
    if (!configured) {
      setStatus('Open Settings and enter the GX10 API key first.')
      return
    }
    const items = Array.from(e.dataTransfer.files)
    if (!items.length) return

    const collected: ListedFile[] = []
    for (const file of items) {
      const abs = window.maximDesktop.pathForFile(file)
      if (!abs) continue
      const exists = await window.maximDesktop.pathExists(abs)
      if (!exists) continue

      if (await window.maximDesktop.isDirectory(abs)) {
        const name = abs.replace(/\\/g, '/').split('/').filter(Boolean).pop() || ''
        if (!destination && !newProject.trim() && name) onDestinationChange(name)
        const listed = await window.maximDesktop.listFiles(abs)
        collected.push(...listed)
      } else {
        // Never trust browser file.size on folder drops — it's often 0 in Electron.
        const st = await window.maximDesktop.statPath(abs)
        const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
        collected.push({
          abs,
          rel: rel.replace(/\\/g, '/'),
          size: st.size,
          name: st.name,
        })
      }
    }

    if (collected.length) {
      addFiles(collected)
      const bytes = collected.reduce((n, f) => n + f.size, 0)
      const empty = collected.filter((f) => !f.size).length
      setStatus(
        empty
          ? `Staged ${collected.length} file(s) (${formatBytes(bytes)}) — ${empty} empty/cloud placeholders. Use Choose folder after opening those files locally.`
          : `Staged ${collected.length} file(s) (${formatBytes(bytes)}). Choose destination, then Send to Maxim.`
      )
    } else {
      setStatus('Could not read dropped paths. Use Choose folder or a USB project button.')
    }
  }

  const pickFolder = async () => {
    const folder = await window.maximDesktop.pickFolder()
    if (!folder) return
    const name = folder.replace(/\\/g, '/').split('/').filter(Boolean).pop() || ''
    if (!destination && !newProject.trim() && name) onDestinationChange(name)
    await stageFolder(folder, true)
  }

  const pickFiles = async () => {
    const files = await window.maximDesktop.pickFiles()
    if (files.length) {
      addFiles(files)
      setStatus(`Staged ${files.length} file(s).`)
    }
  }

  const loadUsbProject = async (drive: UsbDrive) => {
    const root = `${drive.DeviceID}\\`
    const folders = await window.maximDesktop.listTopFolders(root)
    if (!folders.length) {
      setStatus('No project folders on this USB. Put files inside a named folder first.')
      return
    }
    // Stage UI: if one folder, auto; else leave drives list with folder buttons
    setStatus(`Select a project folder from ${drive.VolumeName || drive.DeviceID} below.`)
    ;(drive as UsbDrive & { _folders?: Array<{ name: string; abs: string }> })._folders = folders
    setDrives((prev) =>
      prev.map((d) =>
        d.DeviceID === drive.DeviceID
          ? Object.assign(d, { _folders: folders })
          : d
      )
    )
  }

  const send = async () => {
    if (!configured) {
      setStatus('Configure GX10 in Settings first.')
      return
    }
    if (!effectiveDestination) {
      setStatus('Pick or create a Maxim project destination first.')
      return
    }
    if (!staged.length) {
      setStatus('Stage files by drag-drop, USB, or Choose folder.')
      return
    }
    setBusy(true)
    setProgress(0)
    let ok = 0
    try {
      for (let i = 0; i < staged.length; i++) {
        const f = staged[i]
        const rel = joinRel(subfolder, f.rel)
        setStatus(`Uploading ${i + 1}/${staged.length}: ${rel}`)
        setProgress(Math.round(((i + 1) / staged.length) * 100))
        await uploadFile(f.abs, rel, effectiveDestination)
        ok++
      }
      setStatus(`Done — ${ok} file(s) sent to “${effectiveDestination}”. Waiting for GX10 indexing…`)
      setProgress(100)
      setStaged([])
      // Promote "create new" into the destination chip so it stays selected while indexing
      if (newProject.trim()) {
        onDestinationChange(newProject.trim())
        setNewProject('')
      }
      void refreshProjects()
      onUploaded?.()
      // Poll until inbox drains or ~2 minutes so the globe/project list catch up
      for (let i = 0; i < 24; i++) {
        await new Promise((r) => setTimeout(r, 5000))
        try {
          const st = await fetchUploadStatus()
          void refreshProjects()
          onUploaded?.()
          const inbox = st.pendingFiles || 0
          const embedding = st.pendingDocuments || 0
          if (inbox === 0 && embedding === 0) {
            setStatus(`Indexed — “${effectiveDestination}” should appear in the globe (Refresh tree if needed).`)
            break
          }
          if (inbox > 0) {
            setStatus(`Filing… ${inbox} file(s) still in the GX10 inbox`)
          } else {
            setStatus(`Indexing… ${embedding} file(s) still embedding on the GX10`)
          }
        } catch {
          break
        }
      }
    } catch (err) {
      setStatus(`Upload failed after ${ok} file(s): ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="studio-intake">
      <header className="studio-intro">
        <h1>Intake</h1>
        <p>Drag from a USB or disk, choose the Maxim project, then send. Structure under the drop is preserved.</p>
      </header>

      {!configured && (
        <p className="banner warn">Settings incomplete — connect to the GX10 before uploading.</p>
      )}

      <section className="panel stack">
        <div className="dest-block">
          <label className="field">
            Destination project
            <input
              list="gx10-projects"
              value={destination}
              onChange={(e) => {
                setNewProject('')
                onDestinationChange(e.target.value)
              }}
              placeholder="Search or type existing project"
              disabled={Boolean(newProject.trim())}
            />
            <datalist id="gx10-projects">
              {filteredProjects.map((p) => (
                <option key={p.name} value={p.name} />
              ))}
            </datalist>
          </label>
          <label className="field">
            Or create new
            <input
              value={newProject}
              onChange={(e) => {
                setNewProject(e.target.value)
                if (e.target.value.trim()) onDestinationChange('')
              }}
              placeholder="e.g. VIA RAIL ONTC"
            />
          </label>
          <label className="field">
            Subfolder (optional)
            <input
              value={subfolder}
              onChange={(e) => onSubfolderChange(e.target.value)}
              placeholder="drawings/mechanical"
            />
          </label>
        </div>

        {projects.length > 0 && (
          <label className="field">
            Filter projects
            <input
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              placeholder="Filter list…"
            />
          </label>
        )}

        {filteredProjects.length > 0 && (
          <div className="chip-row">
            {filteredProjects.slice(0, 12).map((p) => (
              <button
                key={p.name}
                type="button"
                className={`chip ${destination === p.name && !newProject.trim() ? 'active' : ''}`}
                onClick={() => {
                  setNewProject('')
                  onDestinationChange(p.name)
                }}
              >
                {p.name}
                <span>{p.fileCount}</span>
              </button>
            ))}
          </div>
        )}

        <div
          className={`drop ${dropOver ? 'over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDropOver(true)
          }}
          onDragLeave={() => setDropOver(false)}
          onDrop={(e) => void onDrop(e)}
        >
          <p className="drop-title">Drop folders or files here</p>
          <p className="muted">From USB Explorer windows, or use the buttons below.</p>
          <div className="row" style={{ justifyContent: 'center', marginTop: '1rem' }}>
            <button type="button" className="cta secondary" disabled={busy} onClick={() => void pickFolder()}>
              Choose folder
            </button>
            <button type="button" className="cta secondary" disabled={busy} onClick={() => void pickFiles()}>
              Choose files
            </button>
          </div>
        </div>

        <div className="usb-block">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>USB drives</strong>
            <button type="button" className="cta secondary tiny" onClick={() => void refreshDrives()}>
              Refresh
            </button>
          </div>
          {drives.length === 0 ? (
            <p className="muted">No USB detected. Plug one in — this list refreshes automatically.</p>
          ) : (
            drives.map((d) => {
              const folders = (d as UsbDrive & { _folders?: Array<{ name: string; abs: string }> })._folders
              return (
                <div key={d.DeviceID} className="usb-card">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div>
                      <strong>{d.VolumeName || 'USB drive'}</strong>
                      <div className="muted">{d.DeviceID}</div>
                    </div>
                    <button
                      type="button"
                      className="cta secondary tiny"
                      disabled={busy || !configured}
                      onClick={() => void loadUsbProject(d)}
                    >
                      List folders
                    </button>
                  </div>
                  {folders && folders.length > 0 && (
                    <div className="chip-row" style={{ marginTop: '0.65rem' }}>
                      {folders.map((f) => (
                        <button
                          key={f.abs}
                          type="button"
                          className="chip"
                          disabled={busy}
                          onClick={() => void stageUsbFolder(f.abs, f.name)}
                        >
                          {f.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {staged.length > 0 && (
          <div className="stage-list">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>
                Staged · {staged.length} file{staged.length === 1 ? '' : 's'} · {formatBytes(totalBytes)}
              </strong>
              <button type="button" className="cta secondary tiny" disabled={busy} onClick={() => setStaged([])}>
                Clear
              </button>
            </div>
            <ul>
              {staged.slice(0, 40).map((f) => (
                <li key={f.abs}>
                  <span title={f.abs}>{f.rel}</span>
                  <span className="muted">{formatBytes(f.size)}</span>
                </li>
              ))}
              {staged.length > 40 && <li className="muted">…and {staged.length - 40} more</li>}
            </ul>
          </div>
        )}

        <button
          type="button"
          className="cta send"
          disabled={busy || !configured || !effectiveDestination || staged.length === 0}
          onClick={() => void send()}
        >
          {busy ? 'Sending…' : `Send to Maxim${effectiveDestination ? ` · ${effectiveDestination}` : ''}`}
        </button>

        {(busy || progress > 0) && (
          <div className="progress" aria-hidden>
            <span style={{ width: `${progress}%` }} />
          </div>
        )}
        {status && (
          <p className={status.startsWith('Done') ? 'ok' : status.toLowerCase().includes('fail') || status.includes('Could') || status.includes('Configure') || status.includes('Pick') ? 'warn' : 'muted'}>
            {status}
          </p>
        )}
      </section>
    </div>
  )
}
