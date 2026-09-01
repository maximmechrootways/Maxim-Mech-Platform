import { useEffect, useState } from 'react'
import { fetchTree, type TreeProject } from '../api'

export function LibraryScreen({
  onOpen,
}: {
  onOpen: (doc: { id: string; name: string; contentType?: string | null }) => void
}) {
  const [projects, setProjects] = useState<TreeProject[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setProjects(await fetchTree())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load library')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <div>
      <div className="hero row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1>Library</h1>
          <p>Everything indexed on the GX10. Open a file to view PDFs and images here.</p>
        </div>
        <button type="button" className="cta secondary" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="warn">{error}</p>}
      {!loading && !error && projects.length === 0 && (
        <p className="muted panel">Archive is empty. Upload a USB or folder from the Upload tab.</p>
      )}

      {projects.map((p) => (
        <details key={p.name} className="tree-project" open>
          <summary>
            {p.name} <span className="muted">· {p.fileCount} files</span>
          </summary>
          {p.folders.map((folder) => (
            <div key={`${p.name}:${folder.path}`}>
              {folder.path ? <div className="folder-label">{folder.path}</div> : null}
              {folder.files.map((f) => (
                <div key={f.id} className="file-row">
                  <div>
                    <div>{f.name}</div>
                    <div className="muted">
                      {f.status}
                      {f.sizeBytes ? ` · ${(f.sizeBytes / 1024).toFixed(0)} KB` : ''}
                    </div>
                  </div>
                  <button type="button" onClick={() => onOpen({ id: f.id, name: f.name, contentType: f.contentType })}>
                    Open
                  </button>
                </div>
              ))}
            </div>
          ))}
        </details>
      ))}
    </div>
  )
}
