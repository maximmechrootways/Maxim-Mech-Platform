import { useEffect, useRef, useState } from 'react'
import ForceGraphFactory from 'force-graph'
import type { TreeProject } from '../api'

// force-graph's typings are awkward under Vite/ESM — treat the factory as callable.
type GraphApi = {
  backgroundColor: (c: string) => GraphApi
  width: (w: number) => GraphApi
  height: (h: number) => GraphApi
  nodeId: (id: string) => GraphApi
  nodeVal: (v: string) => GraphApi
  nodeLabel: (fn: (n: object) => string) => GraphApi
  nodeColor: (fn: (n: object) => string) => GraphApi
  linkColor: (fn: () => string) => GraphApi
  linkWidth: (n: number) => GraphApi
  nodeCanvasObject: (
    fn: (n: object, ctx: CanvasRenderingContext2D, globalScale: number) => void
  ) => GraphApi
  onNodeClick: (fn: (n: object) => void) => GraphApi
  graphData: (data: { nodes: GraphNode[]; links: GraphLink[] }) => GraphApi
  zoomToFit?: (ms?: number, pad?: number) => GraphApi
  _destructor?: () => void
}
type GraphFactory = () => (el: HTMLElement) => GraphApi
const ForceGraph = ((ForceGraphFactory as unknown as { default?: GraphFactory }).default ||
  ForceGraphFactory) as GraphFactory

export type GlobeSelection =
  | { kind: 'project'; name: string }
  | { kind: 'folder'; project: string; path: string }
  | { kind: 'file'; id: string; name: string; contentType?: string | null }

type GraphNode = {
  id: string
  name: string
  kind: 'root' | 'project' | 'folder' | 'file'
  val: number
  status?: string
  project?: string
  folderPath?: string
  fileId?: string
  contentType?: string | null
  color: string
}

type GraphLink = { source: string; target: string }

function statusColor(status?: string) {
  if (status === 'ingested') return '#5ec4a2'
  if (status === 'stored') return '#7aa2c8'
  if (status === 'failed') return '#d4726a'
  if (status === 'pending') return '#c9a227'
  return '#8b9bb4'
}

function statusLabel(status?: string) {
  if (status === 'ingested') return 'Searchable'
  if (status === 'stored') return 'Stored'
  if (status === 'failed') return 'Failed'
  if (status === 'pending') return 'Pending'
  return status || ''
}

function fileStatusHint(file: { status?: string; error?: string | null }) {
  const label = statusLabel(file.status)
  if (file.error) return `${label}: ${file.error}`
  if (file.status === 'stored') return `${label} — kept on GX10, not searchable`
  return label
}

function buildGraph(projects: TreeProject[]): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = [
    {
      id: 'root',
      name: 'Local Archive',
      kind: 'root',
      val: 14,
      color: '#d4a574',
    },
  ]
  const links: GraphLink[] = []

  for (const p of projects) {
    const pid = `project:${p.name}`
    nodes.push({
      id: pid,
      name: p.name,
      kind: 'project',
      val: Math.max(6, Math.min(18, 4 + Math.sqrt(p.fileCount) * 2)),
      color: '#6b8cae',
      project: p.name,
    })
    links.push({ source: 'root', target: pid })

    for (const folder of p.folders) {
      const folderKey = folder.path || '(root)'
      const fid = `folder:${p.name}:${folderKey}`
      nodes.push({
        id: fid,
        name: folder.path || 'Project root',
        kind: 'folder',
        val: Math.max(3, Math.min(10, 2 + folder.files.length)),
        color: '#4a6278',
        project: p.name,
        folderPath: folder.path,
      })
      links.push({ source: pid, target: fid })

      for (const file of folder.files) {
        const fileNodeId = `file:${file.id}`
        nodes.push({
          id: fileNodeId,
          name: file.name,
          kind: 'file',
          val: Math.max(1.5, Math.min(6, 1 + Math.log10((file.sizeBytes || 1) + 1))),
          status: file.status,
          color: statusColor(file.status),
          project: p.name,
          folderPath: file.folderPath,
          fileId: file.id,
          contentType: file.contentType,
        })
        links.push({ source: fid, target: fileNodeId })
      }
    }
  }

  return { nodes, links }
}

function ArchiveTreeList({
  projects,
  highlightProject,
  onSelect,
}: {
  projects: TreeProject[]
  highlightProject?: string
  onSelect: (sel: GlobeSelection) => void
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const next: Record<string, boolean> = {}
    for (const p of projects) {
      next[`p:${p.name}`] = true
      for (const folder of p.folders) {
        next[`f:${p.name}:${folder.path || '(root)'}`] = true
      }
    }
    setOpen((prev) => ({ ...next, ...prev }))
  }, [projects])

  if (projects.length === 0) {
    return (
      <div className="archive-tree empty">
        <p className="muted">Nothing indexed yet — after Send, wait for GX10 ingest.</p>
      </div>
    )
  }

  return (
    <div className="archive-tree">
      {projects.map((p) => {
        const pKey = `p:${p.name}`
        const pOpen = open[pKey] !== false
        return (
          <div key={p.name} className="tree-project">
            <button
              type="button"
              className={`tree-row project ${highlightProject === p.name ? 'active' : ''}`}
              onClick={() => {
                setOpen((o) => ({ ...o, [pKey]: !pOpen }))
                onSelect({ kind: 'project', name: p.name })
              }}
            >
              <span className="tree-twist">{pOpen ? '▾' : '▸'}</span>
              <strong>{p.name}</strong>
              <span className="muted">{p.fileCount} files</span>
            </button>
            {pOpen &&
              p.folders.map((folder) => {
                const fKey = `f:${p.name}:${folder.path || '(root)'}`
                const fOpen = open[fKey] !== false
                const label = folder.path || 'Project root'
                return (
                  <div key={fKey} className="tree-folder">
                    <button
                      type="button"
                      className="tree-row folder"
                      onClick={() => {
                        setOpen((o) => ({ ...o, [fKey]: !fOpen }))
                        onSelect({ kind: 'folder', project: p.name, path: folder.path || '' })
                      }}
                    >
                      <span className="tree-twist">{fOpen ? '▾' : '▸'}</span>
                      <span>{label}</span>
                      <span className="muted">{folder.files.length}</span>
                    </button>
                    {fOpen &&
                      folder.files.map((file) => (
                        <button
                          key={file.id}
                          type="button"
                          className="tree-row file"
                          title={fileStatusHint(file)}
                          onClick={() =>
                            onSelect({
                              kind: 'file',
                              id: file.id,
                              name: file.name,
                              contentType: file.contentType,
                            })
                          }
                        >
                          <span
                            className="tree-dot"
                            style={{ background: statusColor(file.status) }}
                            title={fileStatusHint(file)}
                          />
                          <span className="tree-file-name">{file.name}</span>
                          <span className="muted">{statusLabel(file.status)}</span>
                        </button>
                      ))}
                  </div>
                )
              })}
          </div>
        )
      })}
    </div>
  )
}

function ArchiveMap({
  projects,
  highlightProject,
  onSelect,
}: {
  projects: TreeProject[]
  highlightProject?: string
  onSelect: (sel: GlobeSelection) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<GraphApi | null>(null)
  const onSelectRef = useRef(onSelect)
  const dataRef = useRef({ projects, highlightProject })
  onSelectRef.current = onSelect
  dataRef.current = { projects, highlightProject }

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    let disposed = false
    let ro: ResizeObserver | null = null
    let tries = 0

    const applyData = (graph: GraphApi) => {
      const { nodes, links } = buildGraph(dataRef.current.projects)
      const highlight = dataRef.current.highlightProject
      graph
        .nodeColor((n: object) => {
          const node = n as GraphNode
          if (highlight && node.project === highlight) {
            if (node.kind === 'project') return '#d4a574'
            if (node.kind === 'folder') return '#b8956a'
          }
          return node.color
        })
        .graphData({ nodes, links })
      if (nodes.length > 1) {
        setTimeout(() => {
          if (!disposed) graph.zoomToFit?.(400, 40)
        }, 350)
      }
    }

    const boot = () => {
      if (disposed || !wrapRef.current) return
      const host = wrapRef.current
      const { clientWidth, clientHeight } = host
      if (clientWidth < 40 || clientHeight < 40) {
        if (tries++ < 120) requestAnimationFrame(boot)
        return
      }

      const graph = ForceGraph()(host)
        .backgroundColor('#0c1118')
        .width(clientWidth)
        .height(clientHeight)
        .nodeId('id')
        .nodeVal('val')
        .nodeLabel((n: object) => {
          const node = n as GraphNode
          if (node.kind === 'file') return `${node.name}\n${statusLabel(node.status)}`
          if (node.kind === 'folder') return `${node.project} / ${node.name}`
          return node.name
        })
        .nodeColor((n: object) => (n as GraphNode).color)
        .linkColor(() => 'rgba(180, 200, 220, 0.4)')
        .linkWidth(1)
        .nodeCanvasObject((n: object, ctx, globalScale) => {
          const node = n as GraphNode & { x?: number; y?: number }
          const x = node.x || 0
          const y = node.y || 0
          const r = Math.max(3, (node.val || 4) * 0.9)
          ctx.beginPath()
          ctx.arc(x, y, r, 0, 2 * Math.PI)
          ctx.fillStyle = node.color
          ctx.fill()
          if (globalScale > 0.7 && (node.kind === 'project' || node.kind === 'root')) {
            ctx.font = `${12 / globalScale}px sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'top'
            ctx.fillStyle = 'rgba(232, 238, 245, 0.85)'
            ctx.fillText(node.name, x, y + r + 2)
          }
        })
        .onNodeClick((n: object) => {
          const node = n as GraphNode
          if (node.kind === 'project' && node.project) {
            onSelectRef.current({ kind: 'project', name: node.project })
          } else if (node.kind === 'folder' && node.project) {
            onSelectRef.current({ kind: 'folder', project: node.project, path: node.folderPath || '' })
          } else if (node.kind === 'file' && node.fileId) {
            onSelectRef.current({
              kind: 'file',
              id: node.fileId,
              name: node.name,
              contentType: node.contentType,
            })
          }
        })

      graphRef.current = graph
      applyData(graph)

      const resize = () => {
        if (!wrapRef.current || !graphRef.current) return
        const { clientWidth: w, clientHeight: h } = wrapRef.current
        graphRef.current.width(w).height(h)
      }
      ro = new ResizeObserver(resize)
      ro.observe(host)
    }

    const t = window.setTimeout(() => requestAnimationFrame(boot), 40)

    return () => {
      disposed = true
      window.clearTimeout(t)
      ro?.disconnect()
      graphRef.current?._destructor?.()
      graphRef.current = null
      if (wrapRef.current) wrapRef.current.innerHTML = ''
    }
  }, [])

  useEffect(() => {
    if (!graphRef.current) return
    const { nodes, links } = buildGraph(projects)
    graphRef.current
      .nodeColor((n: object) => {
        const node = n as GraphNode
        if (highlightProject && node.project === highlightProject) {
          if (node.kind === 'project') return '#d4a574'
          if (node.kind === 'folder') return '#b8956a'
        }
        return node.color
      })
      .graphData({ nodes, links })
    setTimeout(() => graphRef.current?.zoomToFit?.(400, 40), 350)
  }, [projects, highlightProject])

  return <div ref={wrapRef} className="globe-canvas" />
}

export function ArchiveGlobe({
  projects,
  highlightProject,
  onSelect,
}: {
  projects: TreeProject[]
  highlightProject?: string
  onSelect: (sel: GlobeSelection) => void
}) {
  const fileCount = projects.reduce((n, p) => n + p.fileCount, 0)

  return (
    <div className="globe-wrap">
      <div className="archive-tree-head">
        <strong>Archive tree</strong>
        <span className="muted">
          {projects.length} project{projects.length === 1 ? '' : 's'} · {fileCount} file
          {fileCount === 1 ? '' : 's'} — click a file to open
        </span>
      </div>
      <ArchiveTreeList projects={projects} highlightProject={highlightProject} onSelect={onSelect} />
      <div className="globe-legend">
        <span><i style={{ background: '#5ec4a2' }} /> Searchable</span>
        <span><i style={{ background: '#7aa2c8' }} /> Stored</span>
        <span><i style={{ background: '#d4726a' }} /> Failed</span>
        <span className="muted">Map below · drag to pan · scroll to zoom</span>
      </div>
      <div className="globe-canvas-wrap">
        <ArchiveMap projects={projects} highlightProject={highlightProject} onSelect={onSelect} />
      </div>
    </div>
  )
}

export type { TreeFile } from '../api'
