import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IconDownload } from '@/components/icons/NavIcons'
import { PdfViewer } from '@/components/PdfViewer'
import { NotFound } from '@/components/ui/NotFound'
import { EditingPresence } from '@/components/EditingPresence'
import { useUser } from '@/contexts/UserContext'
import { useDocuments } from '@/contexts/DocumentsContext'
import { usePresence } from '@/contexts/PresenceContext'
import { fetchLibraryDocument, fetchPdfBlob } from '@/api/library'
import { canUserViewDocument } from '@/utils/documentAccess'
import type { DocumentRecord } from '@/types'

function mapDoc(d: any): DocumentRecord {
  return {
    id: d.id,
    name: d.name,
    type: d.type ?? 'other',
    siteId: d.siteId,
    siteName: d.siteName,
    date: d.date ?? new Date().toISOString().slice(0, 10),
    uploadedBy: d.uploadedBy,
    visibility: d.visibility ?? 'everyone',
    visibleToRoles: d.visibleToRoles ?? [],
    visibleToUserIds: d.visibleToUserIds ?? [],
    tags: d.tags ?? [],
    version: d.version ?? 1,
    acknowledgedBy: d.acknowledgedBy ?? [],
    lastOpenedAt: d.lastOpenedAt,
    lastOpenedBy: d.lastOpenedBy,
    lastEditedAt: d.lastEditedAt,
    lastEditedBy: d.lastEditedBy,
    filePath: d.filePath,
  }
}

export function DocumentDetail() {
  const { id } = useParams()
  const { user } = useUser()
  const { documents, setDocuments } = useDocuments()
  const { getPresence, addPresence, removePresence } = usePresence()
  const [loading, setLoading] = useState(!!id)
  const doc = documents.find((d) => d.id === id)

  useEffect(() => {
    if (!id) return
    if (doc) {
      setLoading(false)
      return
    }
    setLoading(true)
    fetchLibraryDocument(id)
      .then((data) => {
        const mapped = mapDoc(data)
        setDocuments((prev) => (prev.some((d) => d.id === id) ? prev : [...prev, mapped]))
      })
      .catch(() => { })
      .finally(() => setLoading(false))
  }, [id, doc, setDocuments])
  const canView = doc && user && canUserViewDocument(doc, user)
  const thread: any = undefined
  const isSOP = doc?.type === 'SOP'
  const acknowledged = doc?.acknowledgedBy ?? []
  const userAcknowledged = user && acknowledged.some((a) => a.userId === user.id)
  const currentlyViewing = id ? getPresence('document', id) : []

  useEffect(() => {
    if (!id || !user || !canView) return
    addPresence('document', id, { id: user.id, name: user.name })
    setDocuments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, lastOpenedAt: new Date().toISOString(), lastOpenedBy: user.name } : d))
    )
    return () => removePresence('document', id, user.id)
  }, [id, user?.id, canView])

  // Fetch PDF blob and create object URL (avoids iframe being blocked by backend security headers)
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!doc?.filePath) return
    let revoked = false
    fetchPdfBlob(doc.filePath)
      .then((blob) => {
        if (revoked) return
        setPdfBlobUrl(URL.createObjectURL(blob))
      })
      .catch(() => { })
    return () => {
      revoked = true
      setPdfBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null })
    }
  }, [doc?.filePath])

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center text-neutral-500 dark:text-neutral-400">
        Loading…
      </div>
    )
  }

  if (!doc) {
    return (
      <NotFound
        title="Document not found."
        backAction={<Link to="/library?view=documents">Back to documents</Link>}
      />
    )
  }

  if (!canView) {
    return (
      <NotFound
        title="You don't have permission to view this document."
        backAction={<Link to="/library?view=documents">Back to documents</Link>}
      />
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-4 flex-wrap">
        <Link to="/documents" className="no-print touch-target p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-display font-bold text-xl text-neutral-900 dark:text-white truncate">{doc.name}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{doc.type} · {doc.date}{doc.visibility === 'restricted' ? ' · Restricted' : ''}</p>
        </div>
      </div>

      <EditingPresence
        currentlyViewing={currentlyViewing}
        lastOpenedAt={doc.lastOpenedAt}
        lastOpenedBy={doc.lastOpenedBy}
        lastEditedAt={doc.lastEditedAt}
        lastEditedBy={doc.lastEditedBy}
      />

      <Card padding="lg">
        <CardHeader>Document</CardHeader>
        <CardDescription>View the PDF in the app or open in a new tab — no download required.</CardDescription>
        {doc.filePath ? (
          pdfBlobUrl ? (
            <div className="mt-4">
              <PdfViewer fileDataUrl={pdfBlobUrl} fileName={doc.name} />
            </div>
          ) : (
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">Loading PDF…</p>
          )
        ) : (
          <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
            This document was added without an uploaded file. New uploads from Forms & Documents include the PDF so you can view it here.
          </p>
        )}
      </Card>

      {isSOP && (
        <Card padding="lg">
          <CardHeader>SOP acknowledgement</CardHeader>
          <CardDescription>Standard Operating Procedure. Acknowledge that you have read and understood.</CardDescription>
          {doc.tags?.length ? <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">Tags: {doc.tags.join(', ')}</p> : null}
          {doc.version != null && <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Version {doc.version}</p>}
          {acknowledged.length > 0 && (
            <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">Acknowledged by {acknowledged.length} user(s): {acknowledged.map((a) => a.acknowledgedAt).join(', ')}</p>
          )}
          {user && !userAcknowledged && (
            <Button size="sm" className="mt-3 no-print" onClick={() => setDocuments((prev) => prev.map((d) => d.id === id ? { ...d, acknowledgedBy: [...(d.acknowledgedBy ?? []), { userId: user.id, acknowledgedAt: new Date().toISOString() }], lastEditedAt: new Date().toISOString(), lastEditedBy: user.name } : d))}>
              I acknowledge
            </Button>
          )}
          {userAcknowledged && <p className="mt-3 text-sm text-green-600 dark:text-green-400">You have acknowledged this SOP.</p>}
        </Card>
      )}

      <Card padding="lg">
        <CardHeader>Metadata</CardHeader>
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between"><dt className="text-neutral-500">Type</dt><dd>{doc.type}</dd></div>
          <div className="flex justify-between"><dt className="text-neutral-500">Date</dt><dd>{doc.date}</dd></div>
          {doc.siteName && <div className="flex justify-between"><dt className="text-neutral-500">Site</dt><dd>{doc.siteName}</dd></div>}
          {doc.uploadedBy && <div className="flex justify-between"><dt className="text-neutral-500">Uploaded by</dt><dd>{doc.uploadedBy}</dd></div>}
          {doc.visibility && <div className="flex justify-between"><dt className="text-neutral-500">Visibility</dt><dd>{doc.visibility === 'everyone' ? 'Everyone' : 'Restricted (owner, HR + selected people)'}</dd></div>}
        </dl>
        <Button variant="outline" size="sm" className="mt-4 no-print" leftIcon={<IconDownload />} onClick={() => window.print()}>Save as PDF</Button>
      </Card>

      <Card padding="lg">
        <CardHeader>Signatures</CardHeader>
        <CardDescription>Signatures on this document</CardDescription>
        <ul className="mt-2 space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
        </ul>
      </Card>

      <Card padding="lg">
        <CardHeader>Related Submissions</CardHeader>
        <CardDescription>Forms linked to this document</CardDescription>
        <p className="mt-2 text-sm text-neutral-500">Site Inspection #f1</p>
      </Card>

      {thread && (
        <Card padding="lg">
          <CardHeader>Related Conversation</CardHeader>
          <CardDescription>Linked thread (external)</CardDescription>
          <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">{thread.subject}</p>
          <p className="text-xs text-neutral-500 mt-1">{thread.messages.length} messages · {thread.status}</p>
        </Card>
      )}
    </div>
  )
}
