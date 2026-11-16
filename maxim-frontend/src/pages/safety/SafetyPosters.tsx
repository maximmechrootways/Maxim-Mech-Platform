import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { IconDownload } from '@/components/icons/NavIcons'
import { useUser } from '@/contexts/UserContext'
import { useDocuments } from '@/contexts/DocumentsContext'
import { fetchLibraryDocumentBlob, getLibraryDocumentFileUrl } from '@/api/library'
import { canUserViewDocument } from '@/utils/documentAccess'
import { pdfBlobToFirstPageDataUrl } from '@/utils/pdfToImages'
import type { DocumentRecord } from '@/types'

function isSafetyPosterType(type: string | undefined): boolean {
  const n = (type || '').trim().toLowerCase()
  return n === 'safety poster' || n === 'safety posters' || n === 'poster' || n === 'posters'
}

function sortDocsNewestFirst(list: DocumentRecord[]): DocumentRecord[] {
  return [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
}

function formatDate(d: string | undefined): string {
  if (!d) return ''
  const parsed = Date.parse(d)
  if (Number.isNaN(parsed)) return d
  return new Date(parsed).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function isImageBlob(blob: Blob): boolean {
  return blob.type.startsWith('image/')
}

function PosterThumbnail({ docId, name }: { docId: string; name: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    async function loadPreview() {
      try {
        const blob = await fetchLibraryDocumentBlob(docId)
        if (cancelled) return

        if (isImageBlob(blob)) {
          objectUrl = URL.createObjectURL(blob)
          setSrc(objectUrl)
          return
        }

        const dataUrl = await pdfBlobToFirstPageDataUrl(blob, { scale: 0.85 })
        if (cancelled) return
        if (dataUrl) setSrc(dataUrl)
        else setFailed(true)
      } catch {
        if (!cancelled) setFailed(true)
      }
    }

    void loadPreview()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [docId])

  if (failed) {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center bg-neutral-100 text-neutral-400 text-xs px-3 text-center"
        aria-hidden
      >
        Preview unavailable
      </div>
    )
  }

  if (!src) {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center bg-neutral-100 animate-pulse"
        aria-hidden
      >
        <span className="text-xs text-neutral-400">Loading…</span>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={`Preview of ${name}`}
      className="absolute inset-0 h-full w-full object-contain p-2 bg-white"
      loading="lazy"
    />
  )
}

function BoardSlot({ doc }: { doc: DocumentRecord }) {
  const fileUrl = getLibraryDocumentFileUrl(doc.id)
  const sub = formatDate(doc.date)

  return (
    <li className="flex flex-col min-w-0 h-full">
      <div className="flex flex-col flex-1 min-h-0 rounded-md overflow-hidden border border-neutral-300 bg-white shadow-sm">
        {/* Yellow label strip */}
        <div className="shrink-0 bg-amber-400 px-2 py-1.5" title={doc.name}>
          <p className="text-[11px] font-semibold text-neutral-900 truncate text-center leading-snug">
            {doc.name}
          </p>
        </div>

        {/* Fixed-size paper preview — same height on every card */}
        <Link
          to={`/documents/${doc.id}`}
          className="relative block w-full aspect-[3/4] bg-neutral-50 border-t border-neutral-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
          aria-label={`Open ${doc.name}`}
        >
          <PosterThumbnail docId={doc.id} name={doc.name} />
        </Link>
      </div>

      {/* Footer always present so rows stay aligned */}
      <div className="mt-2 flex flex-col gap-1.5 shrink-0">
        <p className="text-[11px] text-neutral-500 truncate min-h-[1rem]">
          {sub || '\u00a0'}
        </p>
        <div className="flex gap-1.5">
          <Link
            to={`/documents/${doc.id}`}
            className="inline-flex flex-1 items-center justify-center min-h-[36px] px-2 rounded-lg text-xs font-medium bg-brand-600 text-white hover:bg-brand-700"
          >
            Read
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-[36px] px-2.5"
            leftIcon={<IconDownload />}
            aria-label={`Download ${doc.name}`}
            onClick={() => window.open(fileUrl, '_blank', 'noopener,noreferrer')}
          >
            <span className="sr-only sm:not-sr-only sm:inline">Download</span>
          </Button>
        </div>
      </div>
    </li>
  )
}

export function SafetyPosters() {
  const { user } = useUser()
  const { documents, refetch, loading, loadError } = useDocuments()
  const isOwnerOrHr = user?.role === 'owner' || user?.role === 'hr'
  const [search, setSearch] = useState('')

  useEffect(() => {
    void refetch()
  }, [refetch])

  const posters = useMemo(() => {
    const visible = documents.filter((d) => user && canUserViewDocument(d, user))
    return sortDocsNewestFirst(visible.filter((d) => isSafetyPosterType(d.type)))
  }, [documents, user])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return posters
    return posters.filter((d) => d.name.toLowerCase().includes(q))
  }, [posters, search])

  return (
    <div className="animate-fade-in max-w-5xl mx-auto px-4 py-6 pb-24">
      <Link to="/safety" className="text-brand-600 dark:text-brand-400 underline">
        ← Back to Bulletin Board
      </Link>
      <h1 className="text-2xl font-display font-semibold text-neutral-900 dark:text-white mt-2">
        Safety Posters
      </h1>
      <p className="text-neutral-600 dark:text-neutral-400 mt-2 text-base leading-relaxed max-w-2xl">
        Posted safety visuals and reminders. Tap a poster to open it, or download a copy.
      </p>

      {isOwnerOrHr && (
        <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-500 leading-relaxed">
          <span className="text-neutral-600 dark:text-neutral-400">Admin:</span>{' '}
          <Link
            to="/library/upload-document?for=safety-posters"
            className="text-brand-600 dark:text-brand-400 underline"
          >
            Upload safety posters
          </Link>{' '}
          so they appear on the board below (visibility: Everyone so all staff can open them).
        </p>
      )}

      {loadError ? (
        <p className="mt-4 text-sm text-amber-700 dark:text-amber-300" role="status">
          {loadError}
        </p>
      ) : null}

      <div className="mt-8 rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">
            Board
          </h2>
          {!loading && posters.length > 0 ? (
            <div className="w-full sm:w-64">
              <Input
                label="Search posters"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by name…"
                className="w-full"
                autoComplete="off"
              />
            </div>
          ) : null}
        </div>

        {loading ? (
          <p className="text-neutral-500 py-8 text-sm text-center">Loading…</p>
        ) : posters.length === 0 ? (
          <p className="text-neutral-500 py-8 text-sm text-center">
            Nothing here yet.
            {isOwnerOrHr ? <> Upload safety posters using the link above.</> : null}
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-neutral-500 py-8 text-sm text-center">
            No documents match your search.
          </p>
        ) : (
          <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
            {filtered.map((d) => (
              <BoardSlot key={d.id} doc={d} />
            ))}
          </ul>
        )}
      </div>

      <p className="mt-4 text-center text-sm text-neutral-500">
        Not sure about something? Ask your supervisor.
      </p>
    </div>
  )
}
