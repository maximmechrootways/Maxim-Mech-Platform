import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/Button'
import { CadViewerPanel } from '@/components/files/CadViewerPanel'
import { isCadFileName } from '@/api/cadViewer'
import { downloadBlob } from '@/utils/fileActions'

export type FileViewerSource = {
  fileName: string
  contentType?: string | null
  /** Project / folder crumb shown in the toolbar. */
  crumb?: string
  /** Local-archive document id — enables Autodesk CAD Viewer for DWG/DXF/…. */
  localDocumentId?: string
  /** Fetch bytes when the modal opens (PDF/images/download). Optional for CAD-only. */
  loadBlob?: () => Promise<Blob>
}

function isPdf(name: string, type?: string | null) {
  return (type || '').includes('pdf') || /\.pdf$/i.test(name)
}

function isImage(name: string, type?: string | null) {
  if ((type || '').startsWith('image/')) return true
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)
}

/**
 * Advanced in-app file viewer:
 * - PDF / images in-modal
 * - DWG/DXF/RVT/… via Autodesk APS Viewer (high quality)
 * - other types: download
 */
export function FileViewer({
  source,
  open,
  onClose,
}: {
  source: FileViewerSource | null
  open: boolean
  onClose: () => void
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const closeRef = useRef<HTMLButtonElement>(null)

  const kind = useMemo(() => {
    if (!source) return 'unknown' as const
    if (source.localDocumentId && isCadFileName(source.fileName)) return 'cad' as const
    if (isPdf(source.fileName, source.contentType)) return 'pdf' as const
    if (isImage(source.fileName, source.contentType)) return 'image' as const
    return 'other' as const
  }, [source])

  useEffect(() => {
    if (!open || !source || kind === 'cad') return
    if (!source.loadBlob) {
      setLoading(false)
      setError('No file loader provided.')
      return
    }
    let cancelled = false
    let objectUrl: string | null = null
    setLoading(true)
    setError(null)
    setBlob(null)
    setBlobUrl(null)
    setZoom(1)
    source
      .loadBlob()
      .then((b) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(b)
        setBlob(b)
        setBlobUrl(objectUrl)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load file.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [open, source, kind])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const t = setTimeout(() => closeRef.current?.focus(), 40)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
      clearTimeout(t)
    }
  }, [open, onClose])

  const download = useCallback(() => {
    if (!blob || !source) return
    downloadBlob(blob, source.fileName)
  }, [blob, source])

  if (!open || !source || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col bg-neutral-950/90 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={source.fileName}>
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-neutral-900/95 px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{source.fileName}</p>
          {source.crumb && <p className="truncate text-xs text-white/60 mt-0.5">{source.crumb}</p>}
        </div>
        {kind === 'image' && (
          <div className="flex items-center gap-1">
            <Button type="button" size="sm" variant="secondary" onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}>
              −
            </Button>
            <span className="text-xs w-12 text-center text-white/70">{Math.round(zoom * 100)}%</span>
            <Button type="button" size="sm" variant="secondary" onClick={() => setZoom((z) => Math.min(4, z + 0.2))}>
              +
            </Button>
          </div>
        )}
        {kind !== 'cad' && (
          <Button type="button" size="sm" variant="secondary" onClick={download} disabled={!blob}>
            Download
          </Button>
        )}
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-2 text-sm hover:bg-white/10"
          aria-label="Close viewer"
        >
          Close
        </button>
      </div>

      <div className="relative flex-1 min-h-0 overflow-auto">
        {kind === 'cad' && source.localDocumentId && (
          <CadViewerPanel documentId={source.localDocumentId} fileName={source.fileName} />
        )}
        {kind !== 'cad' && loading && <p className="p-8 text-center text-white/70">Loading…</p>}
        {kind !== 'cad' && error && <p className="p-8 text-center text-red-300">{error}</p>}
        {!loading && !error && blobUrl && kind === 'pdf' && (
          <iframe title={source.fileName} src={blobUrl} className="h-full w-full min-h-[70vh] border-0 bg-neutral-800" />
        )}
        {!loading && !error && blobUrl && kind === 'image' && (
          <div className="flex min-h-full items-center justify-center p-6">
            <img
              src={blobUrl}
              alt={source.fileName}
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
              className="max-w-full transition-transform duration-150"
              draggable={false}
            />
          </div>
        )}
        {!loading && !error && kind === 'other' && (
          <div className="flex flex-col items-center justify-center gap-4 p-12 text-center text-white/80">
            <p>Preview is not available for this file type.</p>
            <Button type="button" onClick={download} disabled={!blob}>
              Download {source.fileName}
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
