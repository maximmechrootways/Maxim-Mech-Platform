import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { IconDownload } from '@/components/icons/NavIcons'
import { useUser } from '@/contexts/UserContext'
import { useDocuments } from '@/contexts/DocumentsContext'
import { deleteLibraryDocument, getLibraryDocumentFileUrl } from '@/api/library'
import { formatAxiosError } from '@/api'
import { canUserViewDocument } from '@/utils/documentAccess'
import type { DocumentRecord } from '@/types'

function isSdsDocumentType(type: string | undefined): boolean {
  const n = (type || '').trim().toLowerCase()
  return n === 'sds' || n === 'msds' || n === '(m)sds'
}

function sortDocsNewestFirst(list: DocumentRecord[]): DocumentRecord[] {
  return [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
}

function formatDate(d: string | undefined): string {
  if (!d) return ''
  const parsed = Date.parse(d)
  if (Number.isNaN(parsed)) return d
  return new Date(parsed).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function DocumentRow({
  doc,
  canManage,
  deleting,
  onDelete,
}: {
  doc: DocumentRecord
  canManage: boolean
  deleting: boolean
  onDelete: (doc: DocumentRecord) => void
}) {
  const fileUrl = getLibraryDocumentFileUrl(doc.id)
  const sub = [doc.siteName, formatDate(doc.date)].filter(Boolean).join(' · ')

  return (
    <li className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4 border-b border-neutral-200/80 dark:border-neutral-700/80 last:border-0 last:pb-0 first:pt-0">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-neutral-900 dark:text-white break-words">{doc.name}</p>
        {sub ? <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">{sub}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2 shrink-0">
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
        {canManage && (
          <Button
            type="button"
            variant="danger"
            size="sm"
            className="min-h-[44px] px-4"
            disabled={deleting}
            onClick={() => onDelete(doc)}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        )}
      </div>
    </li>
  )
}

export function SdsLibrary() {
  const { user } = useUser()
  const { documents, refetch, loading } = useDocuments()
  const isOwnerOrHr = user?.role === 'owner' || user?.role === 'hr'
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    void refetch()
  }, [refetch])

  const sdsDocs = useMemo(() => {
    const visible = documents.filter((d) => user && canUserViewDocument(d, user) && isSdsDocumentType(d.type))
    return sortDocsNewestFirst(visible)
  }, [documents, user])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sdsDocs
    return sdsDocs.filter((d) => d.name.toLowerCase().includes(q))
  }, [sdsDocs, search])

  const handleDelete = async (doc: DocumentRecord) => {
    if (!window.confirm(`Delete "${doc.name}"? This cannot be undone. You can upload a new version afterward if needed.`)) {
      return
    }
    setActionError(null)
    setDeletingId(doc.id)
    try {
      await deleteLibraryDocument(doc.id)
      await refetch()
    } catch (e: unknown) {
      setActionError(formatAxiosError(e) || 'Failed to delete document.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="animate-fade-in max-w-2xl mx-auto px-4 py-6 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-semibold text-neutral-900 dark:text-white">Safety Data Sheets (SDS)</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-2 text-base leading-relaxed">
            Safety data sheets for chemicals and products used on site. Use Read to open a PDF, or Download to save it.
          </p>
        </div>
        {isOwnerOrHr && (
          <Link
            to="/library/upload-document?for=sds"
            className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600 shrink-0"
          >
            Upload SDS
          </Link>
        )}
      </div>

      {isOwnerOrHr && (
        <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-500 leading-relaxed">
          Upload SDS PDFs with type <span className="text-neutral-600 dark:text-neutral-400">SDS</span> so they appear here for the crew.
          Use Delete when a sheet is outdated or was uploaded by mistake, then Upload SDS to replace it.
        </p>
      )}

      {actionError && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {actionError}
        </p>
      )}

      <div className="mt-8 rounded-2xl bg-white dark:bg-neutral-900/60 border border-neutral-200/90 dark:border-neutral-700 px-4 py-2 shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide pt-4 pb-2">
          SDS library
        </h2>
        {loading ? (
          <p className="text-neutral-500 py-6 text-sm">Loading…</p>
        ) : sdsDocs.length === 0 ? (
          <p className="text-neutral-500 dark:text-neutral-400 py-6 text-sm">
            Nothing here yet.
            {isOwnerOrHr ? (
              <>
                {' '}
                Use Upload SDS above to add safety data sheets for the guys.
              </>
            ) : (
              <> Check back later or ask your supervisor.</>
            )}
          </p>
        ) : (
          <>
            <div className="mb-4">
              <Input
                label="Search SDS"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type to filter by product or chemical name…"
                className="w-full"
                autoComplete="off"
              />
            </div>
            {filtered.length === 0 ? (
              <p className="text-neutral-500 dark:text-neutral-400 py-4 text-sm">No documents match your search.</p>
            ) : (
              <ul>
                {filtered.map((d) => (
                  <DocumentRow
                    key={d.id}
                    doc={d}
                    canManage={isOwnerOrHr}
                    deleting={deletingId === d.id}
                    onDelete={handleDelete}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <p className="mt-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
        <Link to="/safety" className="text-brand-600 dark:text-brand-400 underline">
          ← Back to Bulletin Board
        </Link>
      </p>
    </div>
  )
}
