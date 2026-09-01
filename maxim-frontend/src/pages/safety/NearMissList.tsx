import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import * as nearMissesApi from '@/api/nearMisses'

export function NearMissList() {
  const [searchParams] = useSearchParams()
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [siteName, setSiteName] = useState('')
  const [description, setDescription] = useState('')
  const [correctiveAction, setCorrectiveAction] = useState('')
  const [correctiveActionDate, setCorrectiveActionDate] = useState('')
  const [reportCompletedBy, setReportCompletedBy] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      const data = await nearMissesApi.fetchNearMisses()
      setList(Array.isArray(data) ? data : [])
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const shouldOpenCreate = searchParams.get('create') === '1'
    if (shouldOpenCreate) setShowForm(true)
  }, [searchParams])

  const handleCreate = async () => {
    if (!description.trim()) return
    setSaving(true)
    try {
      await nearMissesApi.createNearMiss({
        siteName: siteName.trim() || undefined,
        description: description.trim(),
        status: 'open',
        correctiveAction: correctiveAction.trim() || undefined,
        correctiveActionDate:
          correctiveActionDate.trim() !== ''
            ? new Date(`${correctiveActionDate.trim()}T12:00:00`).toISOString()
            : undefined,
        reportCompletedBy: reportCompletedBy.trim() || undefined,
      })
      setSiteName('')
      setDescription('')
      setCorrectiveAction('')
      setCorrectiveActionDate('')
      setReportCompletedBy('')
      setShowForm(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Link to="/safety" className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">← Health & Safety</Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">Near-Miss Reports</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">Report and track near-miss events. Add, edit, and delete below.</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}>Report near-miss</Button>
      </div>

      {showForm && (
        <Card padding="lg">
          <h2 className="font-semibold text-neutral-900 dark:text-white mb-3">New Near-Miss</h2>
          <div className="space-y-3 max-w-lg">
            <Input label="Site name" value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="Site" />
            <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What happened" rows={4} required />
            <Textarea
              label="Corrective action to be taken"
              value={correctiveAction}
              onChange={(e) => setCorrectiveAction(e.target.value)}
              placeholder="Describe the corrective action"
              rows={3}
            />
            <Input
              label="Date of corrective action"
              type="date"
              value={correctiveActionDate}
              onChange={(e) => setCorrectiveActionDate(e.target.value)}
            />
            <Input
              label="Report completed by"
              value={reportCompletedBy}
              onChange={(e) => setReportCompletedBy(e.target.value)}
              placeholder="Name of person completing this report"
            />
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={!description.trim() || saving}>Save</Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <Card padding="lg"><p className="text-sm text-neutral-500">Loading…</p></Card>
      ) : list.length === 0 ? (
        <Card padding="lg">
          <EmptyState title="No near-miss reports yet" description="Use the button above to report a near-miss." action={<Button size="sm" onClick={() => setShowForm(true)}>Report near-miss</Button>} />
        </Card>
      ) : (
        <ul className="space-y-3">
          {list.map((item) => (
            <li key={item.id}>
              <Card padding="md" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <Link to={`/safety/near-miss/${item.id}`} className="flex-1 min-w-0">
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-white">{item.siteName || '—'}</p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-2">{item.description}</p>
                    <p className="text-xs text-neutral-400 mt-1">Reported by {item.reportedBy || '—'} · {item.reportedAt ? new Date(item.reportedAt).toLocaleDateString() : '—'}</p>
                  </div>
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={item.status === 'closed' ? 'success' : 'default'}>{item.status}</Badge>
                  <Button size="sm" variant="ghost" onClick={async (e) => { e.preventDefault(); if (window.confirm('Delete this near-miss?')) { await nearMissesApi.deleteNearMiss(item.id); load(); } }}>Delete</Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
