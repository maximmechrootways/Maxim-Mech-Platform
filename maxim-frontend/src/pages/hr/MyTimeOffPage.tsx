import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useUser } from '@/contexts/UserContext'
import {
  cancelTimeOffRequest,
  createTimeOffRequest,
  fetchTimeOffRequests,
  type TimeOffRequestRecord,
} from '@/api/timeOff'

type CompensationKind = 'paid' | 'unpaid'

function statusLabel(status: string) {
  if (status === 'pending') return 'Pending approval'
  if (status === 'approved') return 'Approved'
  if (status === 'denied') return 'Denied'
  if (status === 'cancelled') return 'Cancelled'
  return status
}

function statusClass(status: string) {
  if (status === 'pending') return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
  if (status === 'approved') return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200'
  if (status === 'denied') return 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200'
  return 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
}

export function MyTimeOffPage() {
  const { user } = useUser()
  const isHr = user?.role === 'owner' || user?.role === 'hr'

  const [reasons, setReasons] = useState<string[]>([])
  const [requests, setRequests] = useState<TimeOffRequestRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [reason, setReason] = useState('')
  const [compensation, setCompensation] = useState<CompensationKind>('paid')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      // Wait until we know who is signed in; HR/owner APIs otherwise return company-wide requests.
      if (!user?.id) return

      setLoading(true)
      setLoadError(null)
      try {
        const data = await fetchTimeOffRequests({ mine: true })
        if (cancelled) return
        const mine = Array.isArray(data.requests) ? data.requests : []
        setRequests(mine.filter((r) => r.requesterId === user.id))
        setReasons(Array.isArray(data.reasons) ? data.reasons : [])
        setReason((prev) => prev || (data.reasons?.[0] ?? ''))
      } catch (err: any) {
        if (cancelled) return
        setLoadError(err?.response?.data?.error || 'Could not load your time off requests.')
        setRequests([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reason || !startDate || !endDate) {
      setSaveError('Please choose a reason, start date, and end date.')
      return
    }
    if (!user?.id) {
      setSaveError('You need to be signed in to submit a request.')
      return
    }
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(null)
    try {
      await createTimeOffRequest({
        reason,
        compensation,
        startDate,
        endDate,
        notes: notes.trim() || undefined,
      })
      setNotes('')
      setSaveSuccess('Request submitted. HR has been notified for approval.')
      const data = await fetchTimeOffRequests({ mine: true })
      const mine = Array.isArray(data.requests) ? data.requests : []
      setRequests(mine.filter((r) => r.requesterId === user.id))
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || 'Could not submit request.')
    } finally {
      setSaving(false)
    }
  }

  const onCancel = async (req: TimeOffRequestRecord) => {
    if (!user?.id || req.requesterId !== user.id) {
      setSaveError('You can only cancel your own requests.')
      return
    }
    const ok = window.confirm(`Cancel your ${req.reason} request (${req.startDate} to ${req.endDate})?`)
    if (!ok) return
    setCancellingId(req.id)
    try {
      await cancelTimeOffRequest(req.id)
      const data = await fetchTimeOffRequests({ mine: true })
      const mine = Array.isArray(data.requests) ? data.requests : []
      setRequests(mine.filter((r) => r.requesterId === user.id))
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || 'Could not cancel request.')
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6 pb-24 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-semibold text-neutral-900 dark:text-white">Request time off</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Submit vacation or days off. HR gets a notification and must approve before it is recorded.
          </p>
        </div>
        {isHr && (
          <Link
            to="/hr/time-off?tab=requests"
            className="text-sm text-brand-600 dark:text-brand-400 hover:underline shrink-0"
          >
            Review pending requests (all employees) →
          </Link>
        )}
      </div>

      <Card padding="lg">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">New request</h2>
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Reason</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800"
            >
              <option value="">Select reason…</option>
              {reasons.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Start date</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">End date</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800"
            />
          </label>
          <div className="sm:col-span-2">
            <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Paid / Unpaid</span>
            <div className="grid grid-cols-2 gap-2 max-w-xs">
              <button
                type="button"
                onClick={() => setCompensation('paid')}
                className={`min-h-[44px] rounded-lg border text-sm font-medium ${
                  compensation === 'paid'
                    ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-900/30 dark:text-brand-200'
                    : 'border-neutral-300 dark:border-neutral-600'
                }`}
              >
                Paid
              </button>
              <button
                type="button"
                onClick={() => setCompensation('unpaid')}
                className={`min-h-[44px] rounded-lg border text-sm font-medium ${
                  compensation === 'unpaid'
                    ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-900/30 dark:text-brand-200'
                    : 'border-neutral-300 dark:border-neutral-600'
                }`}
              >
                Unpaid
              </button>
            </div>
          </div>
          <label className="block sm:col-span-2">
            <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Notes (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anything HR should know…"
              className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800"
            />
          </label>
          {saveError && <p className="sm:col-span-2 text-sm text-red-600 dark:text-red-400">{saveError}</p>}
          {saveSuccess && <p className="sm:col-span-2 text-sm text-emerald-700 dark:text-emerald-300">{saveSuccess}</p>}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={saving}>{saving ? 'Submitting…' : 'Submit request'}</Button>
          </div>
        </form>
      </Card>

      <Card padding="lg">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">Your requests</h2>
        {loading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : loadError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-neutral-500">No requests yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
            {requests.map((req) => (
              <li key={req.id} className="py-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-neutral-900 dark:text-white">{req.reason}</p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${statusClass(req.status)}`}>
                      {statusLabel(req.status)}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {req.startDate} → {req.endDate} · {req.totalDays} day{req.totalDays === 1 ? '' : 's'} · {req.compensation}
                  </p>
                  {req.notes ? <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-1">{req.notes}</p> : null}
                  {req.reviewNotes ? (
                    <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-1">HR: {req.reviewNotes}</p>
                  ) : null}
                </div>
                {req.status === 'pending' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={cancellingId === req.id}
                    onClick={() => void onCancel(req)}
                  >
                    {cancellingId === req.id ? 'Cancelling…' : 'Cancel'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
