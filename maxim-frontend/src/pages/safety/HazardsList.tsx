import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
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

export function HazardsList() {
  const location = useLocation()
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [siteName, setSiteName] = useState('')
  const [description, setDescription] = useState('')
  const [likelihood, setLikelihood] = useState<number | ''>('')
  const [impact, setImpact] = useState<number | ''>('')
  const fromCompletedForms = new URLSearchParams(location.search).get('from') === 'completed-forms'
  const backTo = fromCompletedForms ? '/library?view=submissions&from=safety' : '/safety'
  const detailSuffix = fromCompletedForms ? '?from=completed-forms' : ''

  const load = async () => {
    try {
      setLoading(true)
      const data = await hazardsApi.fetchHazards()
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

  const handleCreate = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await hazardsApi.createHazard({
        title: title.trim(),
        siteName: siteName.trim() || undefined,
        description: description.trim() || undefined,
        likelihood: likelihood === '' ? undefined : Number(likelihood),
        impact: impact === '' ? undefined : Number(impact),
        status: 'open',
      })
      setTitle('')
      setSiteName('')
      setDescription('')
      setLikelihood('')
      setImpact('')
      setShowForm(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">← Health & Safety</Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">Hazard Register</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">Track hazards by site and risk level. Add, edit, and delete below.</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}>Report hazard</Button>
      </div>

      {showForm && (
        <Card padding="lg">
          <h2 className="font-semibold text-neutral-900 dark:text-white mb-3">New Hazard</h2>
          <div className="space-y-3 max-w-md">
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short title" required />
            <Input label="Site name" value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="Site" />
            <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={3} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Likelihood (1-5)" type="number" min={1} max={5} value={likelihood} onChange={(e) => setLikelihood(e.target.value === '' ? '' : Number(e.target.value))} />
              <Input label="Impact (1-5)" type="number" min={1} max={5} value={impact} onChange={(e) => setImpact(e.target.value === '' ? '' : Number(e.target.value))} />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={!title.trim() || saving}>Save</Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <Card padding="lg"><p className="text-sm text-neutral-500">Loading…</p></Card>
      ) : list.length === 0 ? (
        <Card padding="lg">
          <EmptyState title="No hazard reports yet" description="Use the button above to report a hazard." action={<Button size="sm" onClick={() => setShowForm(true)}>Report hazard</Button>} />
        </Card>
      ) : (
        <ul className="space-y-3">
          {list.map((item) => {
            const riskLevel = getRiskLevel(item.likelihood, item.impact)
            return (
              <li key={item.id}>
                <Card padding="md" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <Link to={`/safety/hazards/${item.id}${detailSuffix}`} className="flex-1 min-w-0">
                    <div>
                      <p className="font-medium text-neutral-900 dark:text-white">{item.title || item.siteName || '—'}</p>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">{item.siteName} · {item.reportedBy && <>Reported by {item.reportedBy}</>}</p>
                      <p className="text-xs text-neutral-400 mt-1">{item.reportedAt ? new Date(item.reportedAt).toLocaleDateString() : ''}</p>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    {riskLevel && (
                      <Badge variant={riskLevel === 'critical' || riskLevel === 'high' ? 'danger' : riskLevel === 'medium' ? 'warning' : 'default'}>Risk: {riskLevel}</Badge>
                    )}
                    <Badge variant={item.status === 'closed' ? 'success' : 'default'}>{item.status}</Badge>
                    <Button size="sm" variant="ghost" onClick={async (e) => { e.preventDefault(); if (window.confirm('Delete this hazard?')) { await hazardsApi.deleteHazard(item.id); load(); } }}>Delete</Button>
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
