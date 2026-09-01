import { useEffect, useRef, useState } from 'react'
import {
  fetchCadViewerStatus,
  fetchCadViewerToken,
  prepareLocalCadViewer,
  type CadViewerStatus,
} from '@/api/cadViewer'

declare global {
  interface Window {
    Autodesk?: {
      Viewing: {
        Initializer: (opts: Record<string, unknown>, cb: () => void) => void
        GuiViewer3D: new (container: HTMLElement) => AutodeskViewer
        Document: {
          load: (
            urn: string,
            onSuccess: (doc: AutodeskDocument) => void,
            onError: (err: unknown) => void
          ) => void
        }
        theExtensionManager?: unknown
      }
    }
  }
}

type AutodeskViewer = {
  start: () => number
  loadDocumentNode: (doc: AutodeskDocument, node: unknown) => Promise<unknown>
  tearDown: () => void
  finish: () => void
}

type AutodeskDocument = {
  getRoot: () => { getDefaultGeometry: () => unknown }
}

const VIEWER_SCRIPT = 'https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/viewer3D.min.js'
const VIEWER_CSS = 'https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/style.min.css'

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
}

function loadCssOnce(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

/**
 * Autodesk APS Viewer — high-quality DWG/DXF/RVT (and other CAD) viewing.
 */
export function CadViewerPanel({
  documentId,
  fileName,
}: {
  documentId: string
  fileName: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<AutodeskViewer | null>(null)
  const [status, setStatus] = useState<CadViewerStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<'preparing' | 'translating' | 'loading' | 'ready' | 'failed'>('preparing')

  useEffect(() => {
    let cancelled = false
    let pollTimer: ReturnType<typeof setInterval> | null = null

    const run = async () => {
      setError(null)
      setPhase('preparing')
      try {
        let st = await prepareLocalCadViewer(documentId)
        if (cancelled) return
        setStatus(st)

        if (st.status === 'failed') {
          setPhase('failed')
          setError(st.error || 'CAD translation failed')
          return
        }

        if (st.status !== 'success') {
          setPhase('translating')
          await new Promise<void>((resolve, reject) => {
            pollTimer = setInterval(() => {
              void fetchCadViewerStatus(st.sourceKey)
                .then((next) => {
                  if (cancelled) return
                  setStatus(next)
                  st = next
                  if (next.status === 'success') {
                    if (pollTimer) clearInterval(pollTimer)
                    resolve()
                  } else if (next.status === 'failed') {
                    if (pollTimer) clearInterval(pollTimer)
                    reject(new Error(next.error || 'CAD translation failed'))
                  }
                })
                .catch((err) => {
                  if (pollTimer) clearInterval(pollTimer)
                  reject(err)
                })
            }, 2500)
          })
        }

        if (cancelled) return
        setPhase('loading')
        loadCssOnce(VIEWER_CSS)
        await loadScriptOnce(VIEWER_SCRIPT)
        if (cancelled || !containerRef.current || !window.Autodesk) return

        const token = await fetchCadViewerToken()
        const urn = st.urn
        if (!urn) throw new Error('Missing URN after translation')

        await new Promise<void>((resolve, reject) => {
          window.Autodesk!.Viewing.Initializer(
            {
              env: 'AutodeskProduction2',
              api: 'streamingV2',
              getAccessToken: (cb: (token: string, expires: number) => void) => {
                cb(token.access_token, token.expires_in)
              },
            },
            () => {
              try {
                if (viewerRef.current) {
                  viewerRef.current.tearDown()
                  viewerRef.current.finish()
                  viewerRef.current = null
                }
                const viewer = new window.Autodesk!.Viewing.GuiViewer3D(containerRef.current!)
                const started = viewer.start()
                if (started > 0) {
                  reject(new Error('Viewer failed to start'))
                  return
                }
                viewerRef.current = viewer
                const documentIdUrn = urn.startsWith('urn:') ? urn : `urn:${urn}`
                window.Autodesk!.Viewing.Document.load(
                  documentIdUrn,
                  (doc) => {
                    const defaultModel = doc.getRoot().getDefaultGeometry()
                    void viewer.loadDocumentNode(doc, defaultModel).then(() => {
                      setPhase('ready')
                      resolve()
                    })
                  },
                  (err) => reject(err)
                )
              } catch (err) {
                reject(err)
              }
            }
          )
        })
      } catch (err: unknown) {
        if (!cancelled) {
          setPhase('failed')
          setError(err instanceof Error ? err.message : 'Could not open CAD viewer')
        }
      }
    }

    void run()

    return () => {
      cancelled = true
      if (pollTimer) clearInterval(pollTimer)
      if (viewerRef.current) {
        try {
          viewerRef.current.tearDown()
          viewerRef.current.finish()
        } catch { /* ignore */ }
        viewerRef.current = null
      }
    }
  }, [documentId])

  return (
    <div className="flex h-full min-h-[70vh] flex-col bg-neutral-950">
      <div className="border-b border-white/10 px-4 py-2 text-sm text-white/80">
        <span className="font-medium text-white">{fileName}</span>
        <span className="ml-2 text-white/50">Autodesk Viewer</span>
        {phase === 'translating' && (
          <span className="ml-3 text-amber-300">
            Translating CAD{status?.progress ? ` (${status.progress})` : '…'} — first open can take a minute
          </span>
        )}
        {phase === 'preparing' && <span className="ml-3 text-white/50">Preparing…</span>}
        {phase === 'loading' && <span className="ml-3 text-white/50">Loading viewer…</span>}
      </div>
      {error && (
        <div className="px-4 py-6 text-center text-red-300">
          <p className="font-medium">Could not open drawing</p>
          <p className="mt-2 text-sm text-red-200/80">{error}</p>
          <p className="mt-4 text-xs text-white/40">
            High-quality DWG viewing uses Autodesk Platform Services. Ask an admin to set APS_CLIENT_ID / APS_CLIENT_SECRET.
          </p>
        </div>
      )}
      <div ref={containerRef} className="relative flex-1 min-h-[60vh]" />
    </div>
  )
}
