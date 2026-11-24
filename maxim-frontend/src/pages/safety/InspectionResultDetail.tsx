import { Link, useLocation, useParams } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useUser } from '@/contexts/UserContext'
import { fetchInspectionResults } from '@/api/inspections'
import * as inspectionAttachmentsApi from '@/api/inspectionAttachments'
import type { InspectionAttachmentRecord } from '@/api/inspectionAttachments'

export function InspectionResultDetail() {
  const { id } = useParams()
  const location = useLocation()
  const { user } = useUser()
  const fromCompletedForms = new URLSearchParams(location.search).get('from') === 'completed-forms'
  const healthSafetyTo = fromCompletedForms ? '/library?view=submissions&from=safety' : '/safety'
  const inspectionsTo = fromCompletedForms ? '/safety/inspections?from=completed-forms' : '/safety/inspections'
  const [results, setResults] = useState<{ id: string; scheduleId?: string; title?: string; siteName?: string; completedAt?: string; completedBy?: string; items?: { id: string; label: string; result?: string; note?: string }[]; submissionId?: string }[]>([])
  const [attachments, setAttachments] = useState<InspectionAttachmentRecord[]>([])
  const [attachmentsLoading, setAttachmentsLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingNotes, setPendingNotes] = useState('')
  const canUpload = user?.role === 'owner' || user?.role === 'hr' || user?.role === 'supervisor'

  useEffect(() => {
    fetchInspectionResults().then((list) => setResults(Array.isArray(list) ? list : [])).catch(() => setResults([]))
  }, [])
  const result = id ? results.find((r) => r.id === id) : undefined

  const loadAttachments = useCallback(() => {
    if (!canUpload || !result?.scheduleId) {
      setAttachments([])
      return
    }
    setAttachmentsLoading(true)
    inspectionAttachmentsApi.fetchInspectionAttachments(result.scheduleId)
      .then(setAttachments)
      .catch(() => setAttachments([]))
      .finally(() => setAttachmentsLoading(false))
  }, [canUpload, result?.scheduleId])

  useEffect(() => {
    loadAttachments()
  }, [loadAttachments])

  const handleUpload = async () => {
    if (!pendingFile || !result?.scheduleId) return
    setUploading(true)
    setAttachError(null)
    try {
      const added = await inspectionAttachmentsApi.uploadInspectionAttachment(pendingFile, {
        scheduleId: result.scheduleId,
        notes: pendingNotes.trim() || undefined,
      })
      setAttachments((prev) => [added, ...prev])
      setPendingFile(null)
      setPendingNotes('')
    } catch {
      setAttachError('Upload failed. Only PDF and images (PNG, JPEG) are allowed.')
    } finally {
      setUploading(false)
    }
  }

  const handlePreviewAttachment = (attachmentId: string) => {
    inspectionAttachmentsApi.getInspectionAttachmentFileUrl(attachmentId)
      .then(({ url }) => window.open(url, '_blank'))
      .catch(() => setAttachError('Could not open file'))
  }

  const handleDownloadAttachment = async (attachmentId: string, filename: string) => {
    try {
      const { url } = await inspectionAttachmentsApi.getInspectionAttachmentFileUrl(attachmentId)
      const res = await fetch(url, { mode: 'cors' })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename || 'inspection-file'
      a.click()
      URL.revokeObjectURL(blobUrl)
    } catch {
      setAttachError('Could not download file')
    }
  }

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!window.confirm('Remove this file?')) return
    try {
      await inspectionAttachmentsApi.deleteInspectionAttachment(attachmentId)
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId))
    } catch {
      setAttachError('Failed to remove file')
    }
  }

  if (!result) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={healthSafetyTo} className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">← Health & Safety</Link>
          <span className="text-neutral-400">·</span>
          <Link to={inspectionsTo} className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">Scheduled inspections</Link>
        </div>
        <p className="text-neutral-500 dark:text-neutral-400">Result not found.</p>
      </div>
    )
  }

  const items = result.items ?? []
  const passCount = items.filter((i) => i.result === 'pass').length
  const failCount = items.filter((i) => i.result === 'fail').length

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div className="flex flex-wrap items-center gap-2">
        <Link to={healthSafetyTo} className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">← Health & Safety</Link>
        <span className="text-neutral-400">·</span>
        <Link to={inspectionsTo} className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">Scheduled inspections</Link>
      </div>
      <div>
        <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">{result.title}</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">{result.siteName} · Completed {new Date(result.completedAt as string).toLocaleString()} by {result.completedBy}</p>
      </div>
      <Card padding="lg">
        <div className="flex gap-4 mb-4">
          <Badge variant="success">Pass: {passCount}</Badge>
          <Badge variant={failCount > 0 ? 'danger' : 'default'}>Fail: {failCount}</Badge>
        </div>
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-2 border-b border-neutral-100 dark:border-neutral-700 last:border-0">
              <Badge variant={item.result === 'pass' ? 'success' : item.result === 'fail' ? 'danger' : 'default'} className="shrink-0">{item.result ?? 'na'}</Badge>
              <div>
                <p className="font-medium text-neutral-900 dark:text-white">{item.label}</p>
                {item.note && <p className="text-sm text-neutral-500 dark:text-neutral-400">{item.note}</p>}
              </div>
            </li>
          ))}
        </ul>
        {result.submissionId && (
          <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
            <Link to={`/forms/${result.submissionId}`} className="text-brand-600 dark:text-brand-400 hover:underline">View linked submission</Link>
          </p>
        )}
      </Card>

      {canUpload && result.scheduleId && (
        <Card padding="lg">
          <h2 className="font-display font-semibold text-lg text-neutral-900 dark:text-white mb-3">Supporting Documents</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-3">Upload checklists, photos, or reports for this inspection (PDF or images).</p>
          {attachError && (
            <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-800 dark:text-red-200">
              {attachError}
            </div>
          )}
          <div className="space-y-3">
            <label className="block">
              <span className="sr-only">Choose file</span>
              <input
                type="file"
                accept=".pdf,image/*"
                className="block w-full text-sm text-neutral-600 dark:text-neutral-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-100 file:text-brand-700 dark:file:bg-brand-900/40 dark:file:text-brand-300"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  setPendingFile(file || null)
                  if (!file) setPendingNotes('')
                  setAttachError(null)
                  e.target.value = ''
                }}
              />
            </label>
            <div>
              <label htmlFor="inspection-result-file-notes" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Notes or description (optional)</label>
              <input
                id="inspection-result-file-notes"
                type="text"
                placeholder="e.g. Photos from walk-through"
                value={pendingNotes}
                onChange={(e) => setPendingNotes(e.target.value)}
                className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleUpload} disabled={!pendingFile || uploading}>
                {uploading ? 'Uploading…' : 'Upload file'}
              </Button>
              {pendingFile && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setPendingFile(null)
                    setPendingNotes('')
                    setAttachError(null)
                  }}
                  disabled={uploading}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
          {attachmentsLoading ? (
            <p className="mt-6 text-sm text-neutral-500">Loading files…</p>
          ) : attachments.length > 0 ? (
            <ul className="mt-6 space-y-2">
              {attachments.map((a) => (
                <li key={a.id} className="flex flex-col gap-1 py-2 px-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 text-sm">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-neutral-900 dark:text-white truncate">{a.name}</p>
                      <span className="text-neutral-500 dark:text-neutral-400">Uploaded {a.uploadedAt}</span>
                      {a.notes && <p className="text-neutral-600 dark:text-neutral-400 text-xs mt-0.5">{a.notes}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => handlePreviewAttachment(a.id)}>Preview</Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDownloadAttachment(a.id, a.name)}>Download</Button>
                      <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteAttachment(a.id)}>Remove</Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      )}
    </div>
  )
}
