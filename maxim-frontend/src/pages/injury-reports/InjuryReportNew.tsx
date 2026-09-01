import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useUser } from '@/contexts/UserContext'
import { useInjuryReports } from '@/contexts/InjuryReportsContext'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'

export function InjuryReportNew() {
  const navigate = useNavigate()
  const { user } = useUser()
  const { createReport } = useInjuryReports()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [siteName, setSiteName] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<'minor' | 'moderate' | 'major'>('minor')
  const [reportedBy, setReportedBy] = useState(user?.name ?? '')
  const [injuredPersonName, setInjuredPersonName] = useState('')

  const canCreateReport = user?.role === 'hr' || user?.role === 'owner' || user?.role === 'supervisor'
  if (!canCreateReport) {
    return (
      <div className="space-y-4 animate-fade-in">
        <p className="text-neutral-500 dark:text-neutral-400">Access denied.</p>
        <Link to="/injury-reports" className="text-brand-600 dark:text-brand-400 hover:underline">Back to injury reports</Link>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!siteName.trim() || !description.trim()) {
      setError('Site name and description are required.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const report = await createReport({
        siteName: siteName.trim(),
        description: description.trim(),
        severity,
        reportedBy: reportedBy.trim() || user?.name,
        injuredPersonName: injuredPersonName.trim() || undefined,
        status: 'draft',
      })
      navigate(`/injury-reports/${report.id}`)
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.response?.data?.message ?? err?.message ?? 'Failed to create report'
      setError(typeof msg === 'string' ? msg : 'Failed to create report')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <Breadcrumbs items={[{ label: 'Injury reports', to: '/injury-reports' }, { label: 'New report' }]} />
      <div>
        <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">New Injury Report</h1>
        <p className="text-neutral-500 dark:text-neutral-400 mt-0.5">Submit a new accident or injury report. You can add more details after saving.</p>
      </div>
      <Card padding="lg">
        <CardHeader>Report Details</CardHeader>
        <CardDescription>Required fields: site/location and description of the injury or incident.</CardDescription>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-2 text-sm text-red-800 dark:text-red-200">
              {error}
            </div>
          )}
          <Input
            label="Site / location"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            placeholder="e.g. North Site, Building A"
            required
          />
          <Textarea
            label="Description of injury or incident"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What happened? Include date, time, and circumstances."
            rows={4}
            required
          />
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Severity</label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as 'minor' | 'moderate' | 'major')}
              className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
              aria-label="Severity"
            >
              <option value="minor">Minor</option>
              <option value="moderate">Moderate</option>
              <option value="major">Major</option>
            </select>
          </div>
          <Input
            label="Reported by"
            value={reportedBy}
            onChange={(e) => setReportedBy(e.target.value)}
            placeholder={user?.name ?? 'Your name'}
          />
          <Input
            label="Injured person (if applicable)"
            value={injuredPersonName}
            onChange={(e) => setInjuredPersonName(e.target.value)}
            placeholder="Name of injured person"
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create report'}
            </Button>
            <Link to="/injury-reports">
              <Button type="button" variant="ghost">Cancel</Button>
            </Link>
          </div>
        </form>
      </Card>
    </div>
  )
}
