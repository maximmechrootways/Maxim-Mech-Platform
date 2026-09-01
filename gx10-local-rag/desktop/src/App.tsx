import { useCallback, useEffect, useState } from 'react'
import { fetchHealth, fetchTree, type DesktopConfig, type HealthInfo, type TreeProject } from './api'
import { ArchiveGlobe, type GlobeSelection } from './screens/ArchiveGlobe'
import { SetupScreen } from './screens/Setup'
import { StudioScreen } from './screens/Studio'
import { ViewerScreen } from './screens/Viewer'

type View = 'studio' | 'viewer' | 'setup'

export function App() {
  const [view, setView] = useState<View>('studio')
  const [config, setConfig] = useState<DesktopConfig | null>(null)
  const [health, setHealth] = useState<HealthInfo | null>(null)
  const [destination, setDestination] = useState('')
  const [subfolder, setSubfolder] = useState('')
  const [tree, setTree] = useState<TreeProject[]>([])
  const [treeError, setTreeError] = useState('')
  const [viewerDoc, setViewerDoc] = useState<{ id: string; name: string; contentType?: string | null } | null>(null)

  const configured = Boolean(config?.apiKey && config?.apiUrl)

  const refreshHealth = useCallback(async () => {
    setHealth(await fetchHealth())
  }, [])

  const refreshTree = useCallback(async () => {
    if (!configured) {
      setTree([])
      return
    }
    try {
      setTreeError('')
      setTree(await fetchTree())
    } catch (err) {
      setTree([])
      setTreeError(err instanceof Error ? err.message : 'Could not load archive tree')
    }
  }, [configured])

  useEffect(() => {
    void window.maximDesktop.getConfig().then((cfg) => {
      setConfig(cfg)
      if (!cfg.apiKey) setView('setup')
    })
  }, [])

  useEffect(() => {
    void refreshHealth()
    void refreshTree()
    const t = setInterval(() => {
      void refreshHealth()
      void refreshTree()
    }, 12000)
    return () => clearInterval(t)
  }, [refreshHealth, refreshTree])

  const onGlobeSelect = (sel: GlobeSelection) => {
    if (sel.kind === 'project') {
      setDestination(sel.name)
      setSubfolder('')
    } else if (sel.kind === 'folder') {
      setDestination(sel.project)
      setSubfolder(sel.path)
    } else if (sel.kind === 'file') {
      setViewerDoc(sel)
      setView('viewer')
    }
  }

  const connected = Boolean(health?.ok)

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <p className="brand">Maxim</p>
          <p className="brand-sub">Local Archive</p>
        </div>
        <nav className="topnav">
          <button type="button" className={view === 'studio' ? 'active' : ''} onClick={() => setView('studio')}>
            Studio
          </button>
          <button
            type="button"
            className={view === 'viewer' ? 'active' : ''}
            onClick={() => setView('viewer')}
            disabled={!viewerDoc}
          >
            Viewer
          </button>
          <button type="button" className={view === 'setup' ? 'active' : ''} onClick={() => setView('setup')}>
            Settings
          </button>
        </nav>
        <div className={`pill ${connected ? 'ok' : 'off'}`}>
          <span className="dot" />
          {connected
            ? `GX10 · ${health?.projects ?? 0} projects · ${health?.documents ?? 0} docs`
            : configured
              ? 'GX10 unreachable'
              : 'Not configured'}
        </div>
      </header>

      {view === 'setup' && (
        <div className="setup-pane">
          <SetupScreen
            initial={config}
            onSaved={(cfg) => {
              setConfig(cfg)
              setView('studio')
              void refreshHealth()
              void refreshTree()
            }}
          />
        </div>
      )}

      {view === 'viewer' && (
        <div className="viewer-pane">
          <ViewerScreen doc={viewerDoc} />
        </div>
      )}

      {view === 'studio' && (
        <div className="studio-layout">
          <aside className="intake-pane">
            <StudioScreen
              configured={configured}
              destination={destination}
              onDestinationChange={setDestination}
              subfolder={subfolder}
              onSubfolderChange={setSubfolder}
              onUploaded={() => {
                void refreshHealth()
                void refreshTree()
              }}
            />
          </aside>
          <section className="globe-pane">
            <div className="globe-head">
              <div>
                <h2>Archive</h2>
                <p className="muted">GX10 projects and files. Click a project to set destination, or a file to open.</p>
              </div>
              <button type="button" className="cta secondary tiny" onClick={() => void refreshTree()}>
                Refresh tree
              </button>
            </div>
            {treeError ? <p className="warn">{treeError}</p> : null}
            <ArchiveGlobe
              projects={tree}
              highlightProject={destination || undefined}
              onSelect={onGlobeSelect}
            />
          </section>
        </div>
      )}
    </div>
  )
}
