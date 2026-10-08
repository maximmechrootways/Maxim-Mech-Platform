import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { IconDownload } from '@/components/icons/NavIcons'
import { useUser } from '@/contexts/UserContext'
import { useDocuments } from '@/contexts/DocumentsContext'
import { getLibraryDocumentFileUrl } from '@/api/library'
import { canUserViewDocument } from '@/utils/documentAccess'
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

function DocumentRow({ doc }: { doc: DocumentRecord }) {
  const fileUrl = getLibraryDocumentFileUrl(doc.id)
  const sub = [doc.siteName, formatDate(doc.date)].filter(Boolean).join(' · ')

  return (
    <li className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4 border-b border-neutral-200/80 dark:border-neutral-700/80 last:border-0 last:pb-0 first:pt-0">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-neutral-900 dark:text-white break-words">{doc.name}</p>
        {sub ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">{sub}</p>
        ) : null}
      </div>
      <div className="flex gap-2 shrink-0">
        <Link
          to={`/documents/${doc.id}`}
          className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600"
        >
          Read
        </Link>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-[44px] px-4"
          leftIcon={<IconDownload />}
          onClick={() => window.open(fileUrl, '_blank', 'noopener,noreferrer')}
        >
          Download
        </Button>
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
    <div className="animate-fade-in max-w-2xl mx-auto px-4 py-6 pb-24">
      <Link to="/safety" className="text-brand-600 dark:text-brand-400 underline">
        ← Back to Bulletin Board
      </Link>
      <h1 className="text-2xl font-display font-semibold text-neutral-900 dark:text-white mt-2">
        Safety Posters
      </h1>
      <p className="text-neutral-600 dark:text-neutral-400 mt-2 text-base leading-relaxed">
        Posted safety visuals and reminders. Use Read to open in the app, or Download to save a copy.
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
          so they appear below with Read / Download (visibility: Everyone so all staff can open them).
        </p>
      )}

      {loadError ? (
        <p className="mt-4 text-sm text-amber-700 dark:text-amber-300" role="status">
          {loadError}
        </p>
      ) : null}

      <div className="mt-8 rounded-2xl bg-white dark:bg-neutral-900/60 border border-neutral-200/90 dark:border-neutral-700 px-4 py-2 shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide pt-4 pb-2">
          Posters
        </h2>
        {loading ? (
          <p className="text-neutral-500 py-6 text-sm">Loading…</p>
        ) : posters.length === 0 ? (
          <p className="text-neutral-500 dark:text-neutral-400 py-6 text-sm">
            Nothing here yet.
            {isOwnerOrHr ? <> Upload safety posters using the link above.</> : null}
          </p>
        ) : (
          <>
            <div className="mb-4">
              <Input
                label="Search posters"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type to filter by name…"
                className="w-full"
                autoComplete="off"
              />
            </div>
            {filtered.length === 0 ? (
              <p className="text-neutral-500 dark:text-neutral-400 py-4 text-sm">
                No documents match your search.
              </p>
            ) : (
              <ul>
                {filtered.map((d) => (
                  <DocumentRow key={d.id} doc={d} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <p className="mt-4 text-center text-sm text-neutral-500 dark:text-neutral-500">
        Not sure about something? Ask your supervisor.
      </p>
    </div>
  )
}
