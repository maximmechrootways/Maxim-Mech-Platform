import { useState, useEffect } from 'react'
import { Link, useLocation, useParams, useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import * as hazardsApi from '@/api/hazards'
import type { RiskLevel } from '@/types'

function getRiskLevel(likelihood?: number, impact?: number): RiskLevel | null {
  if (likelihood == null || impact == null) return null
  const product = likelihood * impact
  if (product >= 20) return 'critical'
  if (product >= 15) return 'high'
  if (product >= 8) return 'medium'
  return 'low'
}

export function HazardDetail() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const [item, setItem] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editSiteName, setEditSiteName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [editLikelihood, setEditLikelihood] = useState<number | ''>('')
  const [editImpact, setEditImpact] = useState<number | ''>('')
  const fromCompletedForms = new URLSearchParams(location.search).get('from') === 'completed-forms'
  const healthSafetyTo = fromCompletedForms ? '/library?view=submissions&from=safety' : '/safety'
  const hazardsTo = fromCompletedForms ? '/safety/hazards?from=completed-forms' : '/safety/hazards'

  const load = () => {
    if (!id) return
    hazardsApi.fetchHazard(id).then((data) => {
      setItem(data)
      setEditTitle(data.title ?? '')
      setEditSiteName(data.siteName ?? '')
      setEditDescription(data.description ?? '')
      setEditStatus(data.status ?? 'open')
      setEditLikelihood(data.likelihood ?? '')
      setEditImpact(data.impact ?? '')
    }).catch(() => setItem(null)).finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [id])

  const handleSave = async () => {
    if (!id || !item) return
    setSaving(true)
    try {
      await hazardsApi.updateHazard(id, {
        title: editTitle.trim(),
        siteName: editSiteName.trim() || undefined,
        description: editDescription.trim() || undefined,
        status: editStatus,
        likelihood: editLikelihood === '' ? undefined : Number(editLikelihood),
        impact: editImpact === '' ? undefined : Number(editImpact),
      })
      setItem((prev: any) => prev && { ...prev, title: editTitle, siteName: editSiteName, description: editDescription, status: editStatus, likelihood: editLikelihood, impact: editImpact })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!id || !window.confirm('Delete this hazard report?')) return
    setDeleting(true)
    try {
      await hazardsApi.deleteHazard(id)
      navigate(hazardsTo)
    } finally {
      setDeleting(false)
    }
  }

  if (loading || !item) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={healthSafetyTo} className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">← Health & Safety</Link>
          <span className="text-neutral-400">·</span>
          <Link to={hazardsTo} className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">Hazard register</Link>
        </div>
        <Card padding="lg">{loading ? <p className="text-sm text-neutral-500">Loading…</p> : <p className="text-sm text-neutral-500">Hazard not found.</p>}</Card>
      </div>
    )
  }

  const riskLevel = getRiskLevel(item.likelihood, item.impact)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center gap-2">
        <Link to={healthSafetyTo} className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">← Health & Safety</Link>
        <span className="text-neutral-400">·</span>
        <Link to={hazardsTo} className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">Hazard register</Link>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {editing ? (
            <div className="space-y-3 max-w-lg">
              <Input label="Title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              <Input label="Site name" value={editSiteName} onChange={(e) => setEditSiteName(e.target.value)} />
              <Textarea label="Description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Likelihood (1-5)" type="number" min={1} max={5} value={editLikelihood} onChange={(e) => setEditLikelihood(e.target.value === '' ? '' : Number(e.target.value))} />
                <Input label="Impact (1-5)" type="number" min={1} max={5} value={editImpact} onChange={(e) => setEditImpact(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Status</label>
                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className="w-full min-h-[44px] px-4 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white" aria-label="Status">
                  <option value="open">Open</option>
                  <option value="in-progress">In progress</option>
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
              <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">{item.title}</h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">{item.siteName || '—'} · Reported by {item.reportedBy || '—'}</p>
            </>
          )}
        </div>
        {!editing && (
          <div className="flex items-center gap-2">
            {riskLevel && <Badge variant={riskLevel === 'critical' || riskLevel === 'high' ? 'danger' : riskLevel === 'medium' ? 'warning' : 'default'}>Risk: {riskLevel}</Badge>}
            <Badge variant={item.status === 'closed' ? 'success' : 'default'}>{item.status}</Badge>
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
            <Button size="sm" variant="danger" onClick={handleDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</Button>
          </div>
        )}
      </div>
      {!editing && (
        <Card padding="lg" className="space-y-3">
          {item.description && <p className="text-neutral-700 dark:text-neutral-300">{item.description}</p>}
          {(item.likelihood != null || item.impact != null) && <p className="text-sm text-neutral-500">Likelihood: {item.likelihood ?? '—'} · Impact: {item.impact ?? '—'}</p>}
          {item.assignedTo && <p className="text-sm">Assigned to: {item.assignedTo}</p>}
          {item.dueDate && <p className="text-sm">Due: {item.dueDate}</p>}
        </Card>
      )}
    </div>
  )
}
