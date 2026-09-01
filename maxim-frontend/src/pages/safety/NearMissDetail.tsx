import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import * as nearMissesApi from '@/api/nearMisses'
import { downloadBlob } from '@/utils/fileActions'

function isoToDateInputValue(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function NearMissDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fromCompletedForms = searchParams.get('from') === 'completed-forms'
  const [item, setItem] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [editSiteName, setEditSiteName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editCorrectiveAction, setEditCorrectiveAction] = useState('')
  const [editCorrectiveActionDate, setEditCorrectiveActionDate] = useState('')
  const [editReportCompletedBy, setEditReportCompletedBy] = useState('')
  const [editStatus, setEditStatus] = useState('')

  const load = () => {
    if (!id) return
    nearMissesApi.fetchNearMiss(id).then((data) => {
      setItem(data)
      setEditSiteName(data.siteName ?? '')
      setEditDescription(data.description ?? '')
      setEditCorrectiveAction(data.correctiveAction ?? '')
      setEditCorrectiveActionDate(isoToDateInputValue(data.correctiveActionDate))
      setEditReportCompletedBy(data.reportCompletedBy ?? '')
      setEditStatus(data.status ?? 'open')
    }).catch(() => setItem(null)).finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [id])

  const handleSave = async () => {
    if (!id || !item) return
    setSaving(true)
    try {
      await nearMissesApi.updateNearMiss(id, {
        siteName: editSiteName.trim() || undefined,
        description: editDescription.trim() || undefined,
        status: editStatus,
        correctiveAction: editCorrectiveAction.trim() || undefined,
        correctiveActionDate:
          editCorrectiveActionDate.trim() !== ''
            ? new Date(`${editCorrectiveActionDate.trim()}T12:00:00`).toISOString()
            : null,
        reportCompletedBy: editReportCompletedBy.trim() || undefined,
      })
      setItem((prev: any) =>
        prev && {
          ...prev,
          siteName: editSiteName,
          description: editDescription,
          status: editStatus,
          correctiveAction: editCorrectiveAction.trim() || undefined,
          correctiveActionDate:
            editCorrectiveActionDate.trim() !== ''
              ? new Date(`${editCorrectiveActionDate.trim()}T12:00:00`).toISOString()
              : undefined,
          reportCompletedBy: editReportCompletedBy.trim() || undefined,
        }
      )
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!id || !window.confirm('Delete this near-miss report?')) return
    setDeleting(true)
    try {
      await nearMissesApi.deleteNearMiss(id)
      navigate(fromCompletedForms ? '/library?view=submissions&from=safety&bucket=near-miss' : '/safety/near-miss')
    } finally {
      setDeleting(false)
    }
  }

  const handlePrintPdf = async () => {
    if (!id) return
    setPrinting(true)
    try {
      const blob = await nearMissesApi.downloadNearMissPdf(id)
      const siteSlug = (item?.siteName || 'near-miss').replace(/[^\w.-]+/g, '-').slice(0, 40)
      downloadBlob(blob, `near-miss-${siteSlug}.pdf`)
    } catch {
      alert('Failed to download PDF.')
    } finally {
      setPrinting(false)
    }
  }

  if (loading || !item) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/safety" className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">← Health & Safety</Link>
          <span className="text-neutral-400">·</span>
          <Link to="/safety/near-miss" className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">Near-miss reports</Link>
        </div>
        <Card padding="lg">{loading ? <p className="text-sm text-neutral-500">Loading…</p> : <p className="text-sm text-neutral-500">Report not found.</p>}</Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center gap-2">
        {fromCompletedForms ? (
          <>
            <Link to="/library?view=submissions&from=safety&bucket=near-miss" className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">← Near Miss submissions</Link>
            <span className="text-neutral-400">·</span>
            <Link to="/library" className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">Forms & Documents</Link>
          </>
        ) : (
          <>
            <Link to="/safety" className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">← Health & Safety</Link>
            <span className="text-neutral-400">·</span>
            <Link to="/safety/near-miss" className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">Near-miss reports</Link>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {editing ? (
            <div className="space-y-3 max-w-lg">
              <Input label="Site name" value={editSiteName} onChange={(e) => setEditSiteName(e.target.value)} />
              <Textarea label="Description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={4} />
              <Textarea
                label="Corrective action to be taken"
                value={editCorrectiveAction}
                onChange={(e) => setEditCorrectiveAction(e.target.value)}
                placeholder="Describe the corrective action"
                rows={3}
              />
              <Input
                label="Date of corrective action"
                type="date"
                value={editCorrectiveActionDate}
                onChange={(e) => setEditCorrectiveActionDate(e.target.value)}
              />
              <Input
                label="Report completed by"
                value={editReportCompletedBy}
                onChange={(e) => setEditReportCompletedBy(e.target.value)}
                placeholder="Name of person completing this report"
              />
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Status</label>
                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className="w-full min-h-[44px] px-4 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white" aria-label="Status">
                  <option value="open">Open</option>
                  <option value="under-review">Under review</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving}>Save</Button>
                <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">Near-miss at {item.siteName || 'site'}</h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">Reported by {item.reportedBy || '—'} · {item.reportedAt ? new Date(item.reportedAt).toLocaleString() : ''}</p>
            </>
          )}
        </div>
        {!editing && (
          <div className="flex items-center gap-2">
            <Badge variant={item.status === 'closed' ? 'success' : 'default'}>{item.status}</Badge>
            <Button size="sm" variant="secondary" onClick={handlePrintPdf} disabled={printing}>
              {printing ? 'Preparing…' : 'Download PDF'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setEditSiteName(item.siteName ?? '')
                setEditDescription(item.description ?? '')
                setEditCorrectiveAction(item.correctiveAction ?? '')
                setEditCorrectiveActionDate(isoToDateInputValue(item.correctiveActionDate))
                setEditReportCompletedBy(item.reportCompletedBy ?? '')
                setEditStatus(item.status ?? 'open')
                setEditing(true)
              }}
            >
              Edit
            </Button>
            <Button size="sm" variant="danger" onClick={handleDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</Button>
          </div>
        )}
      </div>
      {!editing && (
        <Card padding="lg" className="space-y-4">
          <p className="text-neutral-700 dark:text-neutral-300">{item.description}</p>
          {(item.correctiveAction || item.correctiveActionDate || item.reportCompletedBy) && (
            <div className="pt-3 border-t border-neutral-100 dark:border-neutral-700 space-y-2 text-sm">
              {item.correctiveAction && (
                <p>
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">Corrective action to be taken: </span>
                  <span className="text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">{item.correctiveAction}</span>
                </p>
              )}
              {item.correctiveActionDate && (
                <p>
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">Date of corrective action: </span>
                  {new Date(item.correctiveActionDate).toLocaleDateString()}
                </p>
              )}
              {item.reportCompletedBy && (
                <p>
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">Report completed by: </span>
                  {item.reportCompletedBy}
                </p>
              )}
            </div>
          )}
          {item.followUpNotes && <p className="text-sm text-neutral-500 pt-2 border-t border-neutral-100 dark:border-neutral-700">Follow-up: {item.followUpNotes}</p>}
        </Card>
      )}
    </div>
  )
}
