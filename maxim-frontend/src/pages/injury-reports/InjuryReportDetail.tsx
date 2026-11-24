import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useUser } from '@/contexts/UserContext'
import { useRootCause } from '@/contexts/RootCauseContext'
import { useInjuryReports } from '@/contexts/InjuryReportsContext'
import { useSubcontractors } from '@/contexts/SubcontractorsContext'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { fetchJobs } from '@/api/jobs'
import * as injuryReportsApi from '@/api/injuryReports'
import type { InjuryReportAttachmentRecord } from '@/api/injuryReports'
import { localDateString } from '@/utils/dates'
import type { InjuryReport } from '@/types'

export function InjuryReportDetail() {
  const { id } = useParams()
  const { user } = useUser()
  const { getByLinked, fetchForInjury } = useRootCause()
  const { getReport, fetchReport, updateReport } = useInjuryReports()
  const { subcontractors } = useSubcontractors()
  const [jobsList, setJobsList] = useState<{ id: string; title: string; siteName?: string }[]>([])
  useEffect(() => {
    fetchJobs().then(setJobsList).catch(() => setJobsList([]))
  }, [])
  const report = id ? getReport(id) : undefined
  const rootCause = id ? getByLinked('injury', id) : undefined
  const [loadingDetail, setLoadingDetail] = useState(false)

  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState<Partial<InjuryReport>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const todayStr = localDateString()

  const [attachments, setAttachments] = useState<InjuryReportAttachmentRecord[]>([])
  const [attachmentsLoading, setAttachmentsLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingNotes, setPendingNotes] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canUploadDocs = user?.role === 'owner' || user?.role === 'hr' || user?.role === 'supervisor'

  const clearPendingFile = () => {
    setPendingFile(null)
    setPendingNotes('')
    setAttachError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const loadAttachments = useCallback(() => {
    if (!id || !canUploadDocs) {
      setAttachments([])
      return
    }
    setAttachmentsLoading(true)
    injuryReportsApi.fetchInjuryReportAttachments(id)
      .then(setAttachments)
      .catch(() => setAttachments([]))
      .finally(() => setAttachmentsLoading(false))
  }, [id, canUploadDocs])

  useEffect(() => {
    loadAttachments()
  }, [loadAttachments])

  useEffect(() => {
    if (report) setForm({ ...report })
  }, [report?.id, isEditing])

  useEffect(() => {
    if (!id || report) return
    setLoadingDetail(true)
    fetchReport(id)
      .then(() => {})
      .finally(() => setLoadingDetail(false))
  }, [id, report, fetchReport])

  useEffect(() => {
    if (id && report) fetchForInjury(id).then(() => {})
  }, [id, report?.id, fetchForInjury])

  const canAccessInjuryReports = user?.role === 'hr' || user?.role === 'owner' || user?.role === 'supervisor'
  if (!canAccessInjuryReports) return null
  if (loadingDetail || (id && !report)) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Breadcrumbs items={[{ label: 'Injury reports', to: '/injury-reports' }, { label: '…' }]} />
        <p className="text-neutral-500 dark:text-neutral-400">Loading…</p>
      </div>
    )
  }
  if (!report) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Breadcrumbs items={[{ label: 'Injury reports', to: '/injury-reports' }, { label: 'Not found' }]} />
        <p className="text-neutral-500 dark:text-neutral-400">Report not found.</p>
        <Link to="/injury-reports" className="text-brand-600 dark:text-brand-400 hover:underline">Back to injury reports</Link>
      </div>
    )
  }

  const r = report
  const handleSave = async () => {
    if (!id) return
    if (form.dateOfInjury && form.dateOfInjury > todayStr) {
      setSaveError('Date of injury cannot be in the future. Past dates and today only.')
      return
    }
    setSaveError(null)
    try {
      await updateReport(id, {
        siteName: form.siteName?.trim(),
        reportedBy: form.reportedBy?.trim(),
        reportedAt: form.reportedAt?.trim(),
        status: form.status ?? r.status,
        severity: form.severity ?? r.severity,
        description: form.description?.trim(),
        followUpNotes: form.followUpNotes?.trim() || undefined,
        injuredPersonName: form.injuredPersonName?.trim() || r.injuredPersonName || undefined,
        injuredPersonId: form.injuredPersonId || undefined,
        injuryType: form.injuryType || undefined,
        bodyPart: form.bodyPart || undefined,
        mechanism: form.mechanism || undefined,
        dateOfInjury: form.dateOfInjury || undefined,
        lostTime: form.lostTime,
        daysAwayFromWork: form.daysAwayFromWork,
        restrictedDutyDays: form.restrictedDutyDays,
        jobId: form.jobId || undefined,
        wsibReported: form.wsibReported,
        wsibClaimNumber: form.wsibClaimNumber?.trim() || undefined,
        wsibReportedAt: form.wsibReportedAt || undefined,
        subcontractorId: form.subcontractorId || undefined,
      })
      setIsEditing(false)
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.response?.data?.message ?? err?.message ?? 'Failed to save'
      setSaveError(typeof msg === 'string' ? msg : 'Failed to save')
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Breadcrumbs items={[{ label: 'Injury reports', to: '/injury-reports' }, { label: r.siteName + ' — ' + (r.injuredPersonName || r.description).slice(0, 30) }]} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/injury-reports" className="touch-target p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </Link>
          <div>
            <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">Injury Report</h1>
            <p className="text-neutral-500 dark:text-neutral-400 mt-0.5">
              {!isEditing ? `${r.siteName} · ${r.reportedAt}` : 'Edit all fields below'}
            </p>
          </div>
        </div>
        {!isEditing ? (
          <Button onClick={() => { setSaveError(null); setIsEditing(true) }}>Edit</Button>
        ) : (
          <div className="flex gap-2">
            <Button onClick={handleSave}>Save</Button>
            <Button variant="ghost" onClick={() => { setSaveError(null); setIsEditing(false) }}>Cancel</Button>
          </div>
        )}
      </div>

      <Card padding="lg">
        <CardHeader>Details</CardHeader>
        {!isEditing ? (
          <div className="mt-4 space-y-3 text-sm">
            <p><span className="font-medium text-neutral-700 dark:text-neutral-300">Reported by:</span> {r.reportedBy}</p>
            <p><span className="font-medium text-neutral-700 dark:text-neutral-300">Injured person:</span> {r.injuredPersonName || '—'}</p>
            {r.injuryType && <p><span className="font-medium text-neutral-700 dark:text-neutral-300">Injury type:</span> {r.injuryType.replace(/-/g, ' ')}</p>}
            {r.bodyPart && <p><span className="font-medium text-neutral-700 dark:text-neutral-300">Body part:</span> {r.bodyPart.replace(/-/g, ' ')}</p>}
            {r.mechanism && <p><span className="font-medium text-neutral-700 dark:text-neutral-300">Mechanism:</span> {r.mechanism.replace(/-/g, ' ')}</p>}
            {r.dateOfInjury && <p><span className="font-medium text-neutral-700 dark:text-neutral-300">Date of injury:</span> {r.dateOfInjury}</p>}
            <p><span className="font-medium text-neutral-700 dark:text-neutral-300">Severity:</span> <Badge variant={r.severity === 'major' ? 'danger' : 'warning'}>{r.severity}</Badge></p>
            <p><span className="font-medium text-neutral-700 dark:text-neutral-300">Status:</span> <Badge>{r.status}</Badge></p>
            {r.lostTime && <p><span className="font-medium text-neutral-700 dark:text-neutral-300">Lost time:</span> Yes{r.daysAwayFromWork != null ? ` · ${r.daysAwayFromWork} day(s) away` : ''}{r.restrictedDutyDays != null ? ` · ${r.restrictedDutyDays} restricted` : ''}</p>}
            {r.subcontractorId && (
              <p>
                <span className="font-medium text-neutral-700 dark:text-neutral-300">Subcontractor:</span>{' '}
                <Link to={`/subcontractors/${r.subcontractorId}`} className="text-brand-600 dark:text-brand-400 hover:underline">
                  {subcontractors.find((s) => s.id === r.subcontractorId)?.companyName ?? r.subcontractorId}
                </Link>
              </p>
            )}
            <p><span className="font-medium text-neutral-700 dark:text-neutral-300">Description:</span></p>
            <p className="text-neutral-600 dark:text-neutral-400 pl-0">{r.description}</p>
            {r.photoUrl && (
              <div className="mt-3">
                <p className="font-medium text-neutral-700 dark:text-neutral-300 mb-1">Scene / injury photo</p>
                <img src={r.photoUrl} alt="Injury or scene" className="rounded-lg border border-neutral-200 dark:border-neutral-600 max-w-sm max-h-48 object-cover" />
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {saveError && (
              <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-2 text-sm text-red-800 dark:text-red-200">
                {saveError}
              </div>
            )}
            <Input label="Injured person (name)" value={form.injuredPersonName ?? ''} onChange={(e) => setForm((f) => ({ ...f, injuredPersonName: e.target.value }))} placeholder="Who was injured" />
            <Input label="Site name" value={form.siteName ?? ''} onChange={(e) => setForm((f) => ({ ...f, siteName: e.target.value }))} />
            <Input label="Reported by" value={form.reportedBy ?? ''} onChange={(e) => setForm((f) => ({ ...f, reportedBy: e.target.value }))} />
            <Input label="Reported at" type="datetime-local" value={form.reportedAt ? form.reportedAt.slice(0, 16) : ''} onChange={(e) => setForm((f) => ({ ...f, reportedAt: e.target.value ? new Date(e.target.value).toISOString() : '' }))} />
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Status</label>
              <select value={form.status ?? r.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as InjuryReport['status'] }))} className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white">
                <option value="draft">draft</option>
                <option value="submitted">submitted</option>
                <option value="under-review">under-review</option>
                <option value="closed">closed</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Severity</label>
              <select value={form.severity ?? r.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as InjuryReport['severity'] }))} className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white">
                <option value="minor">minor</option>
                <option value="moderate">moderate</option>
                <option value="major">major</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Injury Type</label>
              <select value={form.injuryType ?? ''} onChange={(e) => setForm((f) => ({ ...f, injuryType: (e.target.value || undefined) as InjuryReport['injuryType'] }))} className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white" title="Injury type">
                <option value="">—</option>
                <option value="laceration">Laceration</option>
                <option value="fracture">Fracture</option>
                <option value="strain">Strain</option>
                <option value="sprain">Sprain</option>
                <option value="burn">Burn</option>
                <option value="contusion">Contusion</option>
                <option value="amputation">Amputation</option>
                <option value="puncture">Puncture</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Body Part</label>
              <select value={form.bodyPart ?? ''} onChange={(e) => setForm((f) => ({ ...f, bodyPart: (e.target.value || undefined) as InjuryReport['bodyPart'] }))} className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white" title="Body part">
                <option value="">—</option>
                <option value="hand">Hand</option>
                <option value="finger">Finger</option>
                <option value="arm">Arm</option>
                <option value="back">Back</option>
                <option value="shoulder">Shoulder</option>
                <option value="head">Head</option>
                <option value="eye">Eye</option>
                <option value="leg">Leg</option>
                <option value="knee">Knee</option>
                <option value="foot">Foot</option>
                <option value="torso">Torso</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Mechanism</label>
              <select value={form.mechanism ?? ''} onChange={(e) => setForm((f) => ({ ...f, mechanism: (e.target.value || undefined) as InjuryReport['mechanism'] }))} className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white" title="Mechanism">
                <option value="">—</option>
                <option value="struck-by">Struck by</option>
                <option value="struck-against">Struck against</option>
                <option value="caught-in">Caught in</option>
                <option value="fall-same-level">Fall same level</option>
                <option value="fall-elevation">Fall from elevation</option>
                <option value="overexertion">Overexertion</option>
                <option value="contact-with">Contact with</option>
                <option value="exposure">Exposure</option>
                <option value="other">Other</option>
              </select>
            </div>
            <Input
              label="Date of injury"
              type="date"
              max={todayStr}
              value={form.dateOfInjury ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, dateOfInjury: e.target.value || undefined }))}
              hint="Past dates and today only. Used in Injury Analytics."
            />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.lostTime ?? false} onChange={(e) => setForm((f) => ({ ...f, lostTime: e.target.checked }))} className="rounded border-slate-300" />
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Lost time injury</span>
            </label>
            {(form.lostTime ?? r.lostTime) && (
              <>
                <Input label="Days away from work" type="number" min={0} value={form.daysAwayFromWork ?? ''} onChange={(e) => setForm((f) => ({ ...f, daysAwayFromWork: e.target.value ? Number(e.target.value) : undefined }))} />
                <Input label="Restricted duty days" type="number" min={0} value={form.restrictedDutyDays ?? ''} onChange={(e) => setForm((f) => ({ ...f, restrictedDutyDays: e.target.value ? Number(e.target.value) : undefined }))} />
              </>
            )}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Job (optional)</label>
              <select value={form.jobId ?? ''} onChange={(e) => setForm((f) => ({ ...f, jobId: e.target.value || undefined }))} className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white">
                <option value="">—</option>
                {jobsList.map((j) => (
                  <option key={j.id} value={j.id}>{j.title} — {j.siteName ?? '—'}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Subcontractor (optional)</label>
              <select value={form.subcontractorId ?? ''} onChange={(e) => setForm((f) => ({ ...f, subcontractorId: e.target.value || undefined }))} className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white">
                <option value="">—</option>
                {subcontractors.map((s) => (
                  <option key={s.id} value={s.id}>{s.companyName}</option>
                ))}
              </select>
            </div>
            <Textarea label="Description" value={form.description ?? ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
        )}
      </Card>

      <Card padding="lg">
        <CardHeader>Follow-up notes (HR)</CardHeader>
        <CardDescription>In-depth notes, next steps, and outcome</CardDescription>
        {!isEditing ? (
          <>
            <p className="mt-4 text-neutral-600 dark:text-neutral-400 min-h-[60px]">{r.followUpNotes || '—'}</p>
          </>
        ) : (
          <Textarea className="mt-4" value={form.followUpNotes ?? ''} onChange={(e) => setForm((f) => ({ ...f, followUpNotes: e.target.value }))} placeholder="Add follow-up notes..." />
        )}
      </Card>

      {canUploadDocs && id && (
        <Card padding="lg">
          <CardHeader>Supporting Documents</CardHeader>
          <CardDescription>Upload inspection notes, photos, or other supporting files (PDF or images) for this report.</CardDescription>
          {attachError && (
            <div className="mt-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-800 dark:text-red-200">
              {attachError}
            </div>
          )}
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="sr-only">Choose file</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/png,image/jpeg,.png,.jpg,.jpeg"
                className="block w-full text-sm text-neutral-600 dark:text-neutral-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-100 file:text-brand-700 dark:file:bg-brand-900/40 dark:file:text-brand-300"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null
                  setPendingFile(file)
                  if (!file) setPendingNotes('')
                  setAttachError(null)
                }}
              />
            </label>
            {pendingFile && (
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                Selected: <span className="font-medium">{pendingFile.name}</span>
              </p>
            )}
            <div>
              <label htmlFor="injury-supporting-doc-notes" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Notes or description (optional)</label>
              <input
                id="injury-supporting-doc-notes"
                type="text"
                placeholder="e.g. Site inspection photos, witness statement"
                value={pendingNotes}
                onChange={(e) => setPendingNotes(e.target.value)}
                className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={async () => {
                  if (!pendingFile || !id) return
                  setUploading(true)
                  setAttachError(null)
                  try {
                    const added = await injuryReportsApi.uploadInjuryReportAttachment(id, pendingFile, {
                      notes: pendingNotes.trim() || undefined,
                    })
                    setAttachments((prev) => [added, ...prev])
                    clearPendingFile()
                  } catch (err: any) {
                    const msg =
                      err?.response?.data?.error ??
                      err?.response?.data?.message ??
                      err?.message
                    if (typeof msg === 'string' && msg.trim()) {
                      setAttachError(msg)
                    } else if (err?.response?.status === 404 || err?.response?.status === 500) {
                      setAttachError('Upload failed. The supporting-documents table may be missing — run the database migration and restart the API.')
                    } else {
                      setAttachError('Upload failed. Only PDF and images (PNG, JPEG) are allowed.')
                    }
                  } finally {
                    setUploading(false)
                  }
                }}
                disabled={!pendingFile || uploading}
              >
                {uploading ? 'Uploading…' : 'Upload file'}
              </Button>
              {pendingFile && (
                <Button variant="outline" onClick={clearPendingFile} disabled={uploading}>
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          injuryReportsApi.getInjuryReportAttachmentFileUrl(id, a.id)
                            .then(({ url }) => window.open(url, '_blank'))
                            .catch(() => setAttachError('Could not open file'))
                        }}
                      >
                        Preview
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          try {
                            const { url } = await injuryReportsApi.getInjuryReportAttachmentFileUrl(id, a.id)
                            const res = await fetch(url, { mode: 'cors' })
                            if (!res.ok) throw new Error('Download failed')
                            const blob = await res.blob()
                            const blobUrl = URL.createObjectURL(blob)
                            const link = document.createElement('a')
                            link.href = blobUrl
                            link.download = a.name || 'injury-file'
                            link.click()
                            URL.revokeObjectURL(blobUrl)
                          } catch {
                            setAttachError('Could not download file')
                          }
                        }}
                      >
                        Download
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={async () => {
                          if (!window.confirm('Remove this file?')) return
                          try {
                            await injuryReportsApi.deleteInjuryReportAttachment(id, a.id)
                            setAttachments((prev) => prev.filter((x) => x.id !== a.id))
                          } catch {
                            setAttachError('Failed to remove file')
                          }
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-sm text-neutral-500 dark:text-neutral-400">No supporting documents yet.</p>
          )}
        </Card>
      )}

      <Card padding="lg">
        <CardHeader>WSIB / workers&apos; comp</CardHeader>
        <CardDescription>Claim and reporting status</CardDescription>
        {!isEditing ? (
          (r.wsibReported ?? r.wsibClaimNumber) ? (
            <div className="mt-4 space-y-2 text-sm">
              <p><span className="font-medium text-neutral-700 dark:text-neutral-300">Reported to WSIB:</span> {r.wsibReported ? 'Yes' : 'No'}</p>
              {r.wsibClaimNumber && <p><span className="font-medium text-neutral-700 dark:text-neutral-300">Claim #:</span> {r.wsibClaimNumber}</p>}
              {r.wsibReportedAt && <p><span className="font-medium text-neutral-700 dark:text-neutral-300">Reported at:</span> {new Date(r.wsibReportedAt).toLocaleString()}</p>}
            </div>
          ) : (
            <p className="mt-2 text-sm text-neutral-500">No WSIB info on file.</p>
          )
        ) : (
          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.wsibReported ?? false} onChange={(e) => setForm((f) => ({ ...f, wsibReported: e.target.checked }))} className="rounded border-slate-300" />
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Reported to WSIB</span>
            </label>
            <Input label="Claim number" value={form.wsibClaimNumber ?? ''} onChange={(e) => setForm((f) => ({ ...f, wsibClaimNumber: e.target.value }))} />
            <Input label="Reported at" type="datetime-local" value={form.wsibReportedAt ? form.wsibReportedAt.slice(0, 16) : ''} onChange={(e) => setForm((f) => ({ ...f, wsibReportedAt: e.target.value ? new Date(e.target.value).toISOString() : undefined }))} />
          </div>
        )}
      </Card>

      {rootCause ? (
        <Card padding="lg">
          <CardHeader>Root Cause Analysis</CardHeader>
          <CardDescription>Analyzed by {rootCause.analyzedBy} · {new Date(rootCause.analyzedAt).toLocaleString()}</CardDescription>
          <div className="mt-4 space-y-2 text-sm">
            <p><span className="font-medium text-neutral-700 dark:text-neutral-300">Immediate cause:</span> {rootCause.immediateCause}</p>
            {rootCause.contributingCauses.length > 0 && <p><span className="font-medium text-neutral-700 dark:text-neutral-300">Contributing:</span> {rootCause.contributingCauses.join('; ')}</p>}
            {rootCause.underlyingCause && <p><span className="font-medium text-neutral-700 dark:text-neutral-300">Underlying:</span> {rootCause.underlyingCause}</p>}
          </div>
          <Link to={`/injury-reports/${id}/root-cause`} className="mt-3 inline-block"><Button size="sm" variant="ghost">Edit Analysis</Button></Link>
        </Card>
      ) : (
        <Card padding="lg">
          <CardHeader>Root Cause Analysis</CardHeader>
          <CardDescription>Capture immediate, contributing, and underlying causes for prevention and regulatory reporting.</CardDescription>
          <Link to={`/injury-reports/${id}/root-cause`} className="mt-3 inline-block"><Button size="sm">Add Root Cause Analysis</Button></Link>
        </Card>
      )}

      {!isEditing && (
        <Card padding="lg">
          <CardHeader>Update Status</CardHeader>
          <div className="mt-3 flex flex-wrap gap-2">
            {r.status !== 'under-review' && <Button size="sm" variant="secondary" onClick={() => updateReport(id!, { status: 'under-review' })}>Mark under review</Button>}
            {r.status !== 'closed' && <Button size="sm" variant="secondary" onClick={() => updateReport(id!, { status: 'closed' })}>Close report</Button>}
          </div>
        </Card>
      )}
    </div>
  )
}
