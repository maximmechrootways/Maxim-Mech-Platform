import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { useRootCause } from '@/contexts/RootCauseContext'
import { useUser } from '@/contexts/UserContext'
import { useInjuryReports } from '@/contexts/InjuryReportsContext'

export function RootCauseForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useUser()
  const { getByLinked, fetchForInjury, saveForInjury, loading: rootLoading } = useRootCause()
  const { getReport } = useInjuryReports()
  const report = id ? getReport(id) : undefined
  const existing = id ? getByLinked('injury', id) : undefined

  const [immediateCause, setImmediateCause] = useState(existing?.immediateCause ?? '')
  const [contributing1, setContributing1] = useState(existing?.contributingCauses?.[0] ?? '')
  const [contributing2, setContributing2] = useState(existing?.contributingCauses?.[1] ?? '')
  const [underlyingCause, setUnderlyingCause] = useState(existing?.underlyingCause ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (id) fetchForInjury(id).then((root) => {
      if (root) {
        setImmediateCause(root.immediateCause)
        setContributing1(root.contributingCauses?.[0] ?? '')
        setContributing2(root.contributingCauses?.[1] ?? '')
        setUnderlyingCause(root.underlyingCause ?? '')
      }
    })
  }, [id, fetchForInjury])

  const canEditRootCause = user?.role === 'owner' || user?.role === 'hr' || user?.role === 'supervisor'

  if (!canEditRootCause || !id) {
    return (
      <div className="space-y-4 animate-fade-in">
        <p className="text-neutral-500 dark:text-neutral-400">Not found or access denied.</p>
        <Link to="/injury-reports" className="text-brand-600 dark:text-brand-400 hover:underline">Back to injury reports</Link>
      </div>
    )
  }

  const save = async () => {
    if (!id) return
    const contributingCauses = [contributing1, contributing2].filter(Boolean)
    setSaving(true)
    try {
      await saveForInjury(id, {
        immediateCause: immediateCause.trim(),
        contributingCauses,
        underlyingCause: underlyingCause.trim() || undefined,
      })
      navigate(`/injury-reports/${id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <Link to={`/injury-reports/${id}`} className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">← Injury report</Link>
      <div>
        <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">Root Cause Analysis</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
          {report ? `Linked to injury report: ${report.siteName} · ${report.reportedAt.slice(0, 10)}` : 'Capture immediate, contributing, and underlying causes.'}
        </p>
      </div>
      <Card padding="lg">
        <CardHeader>Analysis</CardHeader>
        <CardDescription>Structured root cause supports prevention and regulatory reporting.</CardDescription>
        <div className="mt-4 space-y-4">
          <Input label="Immediate cause" value={immediateCause} onChange={(e) => setImmediateCause(e.target.value)} placeholder="What directly caused the injury?" required />
          <Input label="Contributing cause 1" value={contributing1} onChange={(e) => setContributing1(e.target.value)} placeholder="e.g. PPE not worn" />
          <Input label="Contributing cause 2" value={contributing2} onChange={(e) => setContributing2(e.target.value)} placeholder="e.g. Time pressure" />
          <Textarea label="Underlying cause (optional)" value={underlyingCause} onChange={(e) => setUnderlyingCause(e.target.value)} placeholder="System or policy factors" rows={3} />
          <div className="flex gap-2">
            <Button onClick={save} disabled={!immediateCause.trim() || saving || rootLoading}>
              {saving ? 'Saving…' : 'Save analysis'}
            </Button>
            <Link to={`/injury-reports/${id}`}><Button variant="ghost">Cancel</Button></Link>
          </div>
        </div>
      </Card>
    </div>
  )
}
