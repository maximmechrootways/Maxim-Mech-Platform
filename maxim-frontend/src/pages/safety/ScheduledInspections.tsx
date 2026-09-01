import { useState, useEffect, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { useUser } from '@/contexts/UserContext'
import * as inspectionsApi from '@/api/inspections'
import * as inspectionAttachmentsApi from '@/api/inspectionAttachments'
import type { InspectionAttachmentRecord } from '@/api/inspectionAttachments'

export function ScheduledInspections() {
  const location = useLocation()
  const { user } = useUser()
  const [schedules, setSchedules] = useState<any[]>([])
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [attachments, setAttachments] = useState<InspectionAttachmentRecord[]>([])
  const [attachmentsLoading, setAttachmentsLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [nextScheduleId, setNextScheduleId] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingNotes, setPendingNotes] = useState('')
  const canUpload = user?.role === 'owner' || user?.role === 'hr' || user?.role === 'supervisor'
  const fromCompletedForms = new URLSearchParams(location.search).get('from') === 'completed-forms'
  const backTo = fromCompletedForms ? '/library?view=submissions&from=safety' : '/safety'
  const resultSuffix = fromCompletedForms ? '?from=completed-forms' : ''

  const loadAttachments = useCallback(() => {
    if (!canUpload) return
    setAttachmentsLoading(true)
    inspectionAttachmentsApi.fetchInspectionAttachments()
      .then(setAttachments)
      .catch(() => setAttachments([]))
      .finally(() => setAttachmentsLoading(false))
  }, [canUpload])

  useEffect(() => {
    loadAttachments()
  }, [loadAttachments])

  const handleUpload = async () => {
    if (!pendingFile) return
    setUploading(true)
    setAttachError(null)
    try {
      const added = await inspectionAttachmentsApi.uploadInspectionAttachment(pendingFile, {
        scheduleId: nextScheduleId || undefined,
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

  const clearPending = () => {
    setPendingFile(null)
    setPendingNotes('')
    setAttachError(null)
  }

  const handlePreviewAttachment = (id: string) => {
    inspectionAttachmentsApi.getInspectionAttachmentFileUrl(id).then(({ url }) => window.open(url, '_blank')).catch(() => setAttachError('Could not open file'))
  }

  const handleDownloadAttachment = async (id: string, filename: string) => {
    try {
      const { url } = await inspectionAttachmentsApi.getInspectionAttachmentFileUrl(id)
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

  const handleDeleteAttachment = async (id: string) => {
    if (!window.confirm('Remove this file?')) return
    try {
      await inspectionAttachmentsApi.deleteInspectionAttachment(id)
      setAttachments((prev) => prev.filter((a) => a.id !== id))
    } catch {
      setAttachError('Failed to remove file')
    }
  }

  useEffect(() => {
    Promise.all([inspectionsApi.fetchInspectionsDue(), inspectionsApi.fetchInspectionResults()])
      .then(([due, res]) => {
        setSchedules(Array.isArray(due) ? due : [])
        setResults(Array.isArray(res) ? res : [])
      })
      .catch(() => { setSchedules([]); setResults([]) })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6 animate-fade-in">
      <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">← Health & Safety</Link>
      <div>
        <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">Scheduled Inspections</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">Predefined checklists; complete on schedule and track results.</p>
      </div>
      <Card padding="lg">
        <h2 className="font-display font-semibold text-lg text-neutral-900 dark:text-white mb-3">Upcoming / due</h2>
        {loading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : schedules.length === 0 ? (
          <EmptyState title="No scheduled inspections" description="Upcoming items come from the inspections API. Add inspection schedules in Admin to see due items here." />
        ) : (
          <ul className="space-y-3">
            {schedules.map((s) => {
              const lastResult = results.filter((r) => r.scheduleId === s.id).sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0]
              return (
                <li key={s.id}>
                  <Card padding="md" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p className="font-medium text-neutral-900 dark:text-white">{s.title}</p>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">{s.siteName} · Due {s.nextDue} · {s.frequency}</p>
                      {lastResult && <p className="text-xs text-neutral-400 mt-1">Last completed {new Date(lastResult.completedAt).toLocaleDateString()} by {lastResult.completedBy}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="default">{s.assignedToRole ?? '—'}</Badge>
                      <Link to="/forms/new/t1"><Button size="sm" variant="outline">Start Inspection</Button></Link>
                    </div>
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
      <Card padding="lg">
        <h2 className="font-display font-semibold text-lg text-neutral-900 dark:text-white mb-3">Recent Results</h2>
        {loading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : results.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">No inspection results yet.</p>
        ) : (
          <ul className="space-y-2">
            {results.map((r) => (
              <li key={r.id}>
                    <Link to={`/safety/inspections/result/${r.id}${resultSuffix}`} className="block py-2 px-3 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800">
                  <span className="font-medium text-neutral-900 dark:text-white">{r.title}</span>
                  <span className="text-sm text-neutral-500 dark:text-neutral-400 ml-2">{r.siteName} · {new Date(r.completedAt).toLocaleString()} by {r.completedBy}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canUpload && (
        <Card padding="lg">
          <h2 className="font-display font-semibold text-lg text-neutral-900 dark:text-white mb-3">Inspection Files</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-2">Upload checklists, photos, or reports and add notes. Files are stored in the backend. <strong>Upcoming / due</strong> and <strong>Recent results</strong> come from the inspections API.</p>
          {attachError && (
            <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-800 dark:text-red-200">
              {attachError}
            </div>
          )}
          <div className="space-y-3 mt-4">
            <div className="flex flex-wrap items-end gap-3">
              <select
                aria-label="Attach to schedule"
                value={nextScheduleId ?? ''}
                onChange={(e) => setNextScheduleId(e.target.value || null)}
                className="min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
              >
                <option value="">General</option>
                {schedules.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
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
            </div>
            <div>
              <label htmlFor="inspection-file-notes" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Notes or description (optional)</label>
              <input
                id="inspection-file-notes"
                type="text"
                placeholder="e.g. North site walk-through, follow-up items"
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
                <Button variant="outline" onClick={clearPending} disabled={uploading}>Cancel</Button>
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
