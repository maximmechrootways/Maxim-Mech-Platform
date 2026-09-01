import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useUser } from '@/contexts/UserContext'
import {
  approveTimeOffRequest,
  createTimeOffEntry,
  deleteTimeOffEntry,
  denyTimeOffRequest,
  fetchTimeOffEntries,
  fetchTimeOffRequests,
  fetchTimeOffTeamLabourers,
  updateTimeOffEntry,
  type TimeOffEntryRecord,
  type TimeOffRequestRecord,
  type TimeOffYearlyTotal,
} from '@/api/timeOff'

type CompensationKind = 'paid' | 'unpaid'

const SUPERVISOR_VISIBLE_REASON = 'Vacation'

function normalizeCompensation(entry: Partial<TimeOffEntryRecord>): CompensationKind {
  if (entry.compensation === 'paid' || entry.compensation === 'unpaid') return entry.compensation
  if (typeof entry.isPaid === 'boolean') return entry.isPaid ? 'paid' : 'unpaid'
  return 'paid'
}

function yearOptions() {
  const startYear = 2024
  const endYear = 2035
  const years: number[] = []
  for (let year = startYear; year <= endYear; year += 1) {
    years.push(year)
  }
  return years
}

export function TimeOffPage() {
  const { user } = useUser()
  const [searchParams, setSearchParams] = useSearchParams()
  const canUse = user?.role === 'owner' || user?.role === 'hr' || user?.role === 'supervisor'
  const canEditEntries = user?.role === 'owner' || user?.role === 'hr'
  const isSupervisor = user?.role === 'supervisor'
  const canApproveRequests = user?.role === 'owner' || user?.role === 'hr'
  const activeTab = searchParams.get('tab') === 'requests' && canApproveRequests ? 'requests' : 'records'

  const [labourers, setLabourers] = useState<Array<{ id: string; name: string }>>([])
  const [entries, setEntries] = useState<TimeOffEntryRecord[]>([])
  const [reasons, setReasons] = useState<string[]>([])
  const [holidays, setHolidays] = useState<Array<{ date: string; name: string }>>([])
  const [yearlyTotals, setYearlyTotals] = useState<TimeOffYearlyTotal[]>([])
  const [yearlyTotalDays, setYearlyTotalDays] = useState(0)
  const [pendingRequests, setPendingRequests] = useState<TimeOffRequestRecord[]>([])
  const [allRequests, setAllRequests] = useState<TimeOffRequestRecord[]>([])
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [requestsError, setRequestsError] = useState<string | null>(null)
  const [reviewNotesById, setReviewNotesById] = useState<Record<string, string>>({})
  const [requestActionId, setRequestActionId] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [rowActionError, setRowActionError] = useState<string | null>(null)

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [filterLabourerId, setFilterLabourerId] = useState('')
  const [filterReason, setFilterReason] = useState('')
  const [filterCompensation, setFilterCompensation] = useState<'all' | CompensationKind>('all')

  const [labourerId, setLabourerId] = useState('')
  const [reason, setReason] = useState('')
  const [compensation, setCompensation] = useState<CompensationKind>('paid')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabourerId, setEditLabourerId] = useState('')
  const [editReason, setEditReason] = useState('')
  const [editCompensation, setEditCompensation] = useState<CompensationKind>('paid')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const optionsYears = useMemo(() => yearOptions(), [])

  const loadTeam = async () => {
    if (!canUse) return
    try {
      const team = await fetchTimeOffTeamLabourers()
      setLabourers(team)
      if (!labourerId && team.length > 0) setLabourerId(team[0].id)
    } catch {
      setLabourers([])
    }
  }

  const loadEntries = async () => {
    if (!canUse) return
    setLoading(true)
    setLoadError(null)
    try {
      const data = await fetchTimeOffEntries({
        year: selectedYear,
        labourerId: filterLabourerId || undefined,
      })
      setEntries(Array.isArray(data.entries) ? data.entries : [])
      setReasons(Array.isArray(data.reasons) ? data.reasons : [])
      setHolidays(Array.isArray(data.holidays) ? data.holidays : [])
      setYearlyTotals(Array.isArray(data.yearlyTotals) ? data.yearlyTotals : [])
      setYearlyTotalDays(Number(data.yearlyTotalDays) || 0)
      if (!reason && Array.isArray(data.reasons) && data.reasons.length > 0) {
        setReason(data.reasons[0])
      }
    } catch (err: any) {
      setLoadError(err?.response?.data?.error || 'Could not load time off records.')
      setEntries([])
      setHolidays([])
      setYearlyTotals([])
      setYearlyTotalDays(0)
    } finally {
      setLoading(false)
    }
  }

  const loadRequests = async () => {
    if (!canApproveRequests) return
    setRequestsLoading(true)
    setRequestsError(null)
    try {
      const data = await fetchTimeOffRequests()
      const list = Array.isArray(data.requests) ? data.requests : []
      setAllRequests(list)
      setPendingRequests(list.filter((r) => r.status === 'pending'))
    } catch (err: any) {
      setRequestsError(err?.response?.data?.error || 'Could not load time off requests.')
      setAllRequests([])
      setPendingRequests([])
    } finally {
      setRequestsLoading(false)
    }
  }

  useEffect(() => {
    void loadTeam()
  }, [canUse])

  useEffect(() => {
    void loadEntries()
  }, [canUse, selectedYear, filterLabourerId])

  useEffect(() => {
    void loadRequests()
  }, [canApproveRequests])

  const setTab = (tab: 'records' | 'requests') => {
    const next = new URLSearchParams(searchParams)
    if (tab === 'requests') next.set('tab', 'requests')
    else next.delete('tab')
    setSearchParams(next, { replace: true })
  }

  const onApproveRequest = async (req: TimeOffRequestRecord) => {
    setRequestActionId(req.id)
    setRequestsError(null)
    try {
      await approveTimeOffRequest(req.id, {
        compensation: req.compensation === 'unpaid' ? 'unpaid' : 'paid',
        reviewNotes: reviewNotesById[req.id]?.trim() || undefined,
      })
      await Promise.all([loadRequests(), loadEntries()])
    } catch (err: any) {
      setRequestsError(err?.response?.data?.error || 'Could not approve request.')
    } finally {
      setRequestActionId(null)
    }
  }

  const onDenyRequest = async (req: TimeOffRequestRecord) => {
    const note = reviewNotesById[req.id]?.trim()
    const ok = window.confirm(
      note
        ? `Deny ${req.requesterName}'s request? They will see your note.`
        : `Deny ${req.requesterName}'s request without a note?`,
    )
    if (!ok) return
    setRequestActionId(req.id)
    setRequestsError(null)
    try {
      await denyTimeOffRequest(req.id, { reviewNotes: note || undefined })
      await loadRequests()
    } catch (err: any) {
      setRequestsError(err?.response?.data?.error || 'Could not deny request.')
    } finally {
      setRequestActionId(null)
    }
  }

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!labourerId || !reason || !startDate || !endDate) {
      setSaveError('Please complete employee, reason, start date, and end date.')
      return
    }
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(null)
    try {
      await createTimeOffEntry({
        labourerId,
        reason,
        compensation,
        startDate,
        endDate,
        notes: notes.trim() || undefined,
      })
      setNotes('')
      setSaveSuccess(
        isSupervisor && reason !== 'Vacation'
          ? 'Time off saved. Only vacation entries appear in your list below.'
          : 'Time off saved.',
      )
      await loadEntries()
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || 'Could not save time off.')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (entry: TimeOffEntryRecord) => {
    setRowActionError(null)
    setEditingId(entry.id)
    setEditLabourerId(entry.labourerId)
    setEditReason(entry.reason)
    setEditCompensation(normalizeCompensation(entry))
    setEditStartDate(entry.startDate || '')
    setEditEndDate(entry.endDate || '')
    setEditNotes(entry.notes || '')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditLabourerId('')
    setEditReason('')
    setEditCompensation('paid')
    setEditStartDate('')
    setEditEndDate('')
    setEditNotes('')
  }

  const onSaveEdit = async () => {
    if (!editingId) return
    if (!editLabourerId || !editReason || !editStartDate || !editEndDate) {
      setRowActionError('Please complete employee, reason, start date, and end date before saving.')
      return
    }

    setSavingEdit(true)
    setRowActionError(null)
    try {
      await updateTimeOffEntry(editingId, {
        labourerId: editLabourerId,
        reason: editReason,
        compensation: editCompensation,
        startDate: editStartDate,
        endDate: editEndDate,
        notes: editNotes.trim() || undefined,
      })
      cancelEdit()
      await loadEntries()
    } catch (err: any) {
      setRowActionError(err?.response?.data?.error || 'Could not update time off entry.')
    } finally {
      setSavingEdit(false)
    }
  }

  const onDelete = async (entry: TimeOffEntryRecord) => {
    const ok = window.confirm(
      `Delete time off entry for ${entry.labourerName} (${entry.startDate || '-'} to ${entry.endDate || '-'})?\n\nIf this came from an employee request, that request will be marked cancelled on the Requests tab.`
    )
    if (!ok) return

    setRowActionError(null)
    setDeletingId(entry.id)
    try {
      await deleteTimeOffEntry(entry.id)
      if (editingId === entry.id) cancelEdit()
      await Promise.all([loadEntries(), canApproveRequests ? loadRequests() : Promise.resolve()])
    } catch (err: any) {
      setRowActionError(err?.response?.data?.error || 'Could not delete time off entry.')
    } finally {
      setDeletingId(null)
    }
  }

  const filteredEntries = useMemo(() => {
    const baseEntries = isSupervisor
      ? entries.filter((entry) => entry.reason === SUPERVISOR_VISIBLE_REASON)
      : entries

    return baseEntries.filter((entry) => {
      if (filterReason && entry.reason !== filterReason) return false
      if (filterCompensation !== 'all' && normalizeCompensation(entry) !== filterCompensation) return false
      return true
    })
  }, [entries, filterReason, filterCompensation, isSupervisor])

  const displayYearlyTotals = useMemo(() => {
    if (!isSupervisor) return yearlyTotals
    const totalsMap = new Map<string, TimeOffYearlyTotal>()
    for (const entry of entries.filter((e) => e.reason === SUPERVISOR_VISIBLE_REASON)) {
      const existing = totalsMap.get(entry.labourerId)
      if (existing) {
        existing.totalDays += entry.totalDays
      } else {
        totalsMap.set(entry.labourerId, {
          labourerId: entry.labourerId,
          labourerName: entry.labourerName,
          totalDays: entry.totalDays,
        })
      }
    }
    return Array.from(totalsMap.values()).sort((a, b) => b.totalDays - a.totalDays)
  }, [entries, isSupervisor, yearlyTotals])

  const displayYearlyTotalDays = isSupervisor
    ? displayYearlyTotals.reduce((sum, row) => sum + row.totalDays, 0)
    : yearlyTotalDays

  const displayReason = (reason: string) => (isSupervisor ? SUPERVISOR_VISIBLE_REASON : reason)

  if (!canUse) {
    return (
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        <Card padding="lg">
          <p className="text-sm text-neutral-500">Only supervisors, HR, and Owner can access Time Off.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6 pb-24 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-semibold text-neutral-900 dark:text-white">Time off</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            {isSupervisor
              ? 'Record time off for your team. The list below only shows vacation entries.'
              : 'Approve employee requests, or record absences directly for payroll and audit.'}
          </p>
        </div>
        <Link to="/my-time-off" className="text-sm text-brand-600 dark:text-brand-400 hover:underline shrink-0">
          Submit your own request →
        </Link>
      </div>

      {canApproveRequests && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab('requests')}
            className={`min-h-[40px] px-4 rounded-lg text-sm font-medium border transition-colors ${
              activeTab === 'requests'
                ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-900/30 dark:text-brand-200'
                : 'border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300'
            }`}
          >
            Requests{pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ''}
          </button>
          <button
            type="button"
            onClick={() => setTab('records')}
            className={`min-h-[40px] px-4 rounded-lg text-sm font-medium border transition-colors ${
              activeTab === 'records'
                ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-900/30 dark:text-brand-200'
                : 'border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300'
            }`}
          >
            Records
          </button>
        </div>
      )}

      {canApproveRequests && activeTab === 'requests' && (
        <Card padding="lg">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-1">Employee requests</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
            Approving adds the dates to Time Off records and notifies the employee. Denying notifies them with your note.
          </p>
          {requestsError && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{requestsError}</p>}
          {requestsLoading ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : pendingRequests.length === 0 && allRequests.length === 0 ? (
            <p className="text-sm text-neutral-500">No requests yet.</p>
          ) : (
            <ul className="space-y-4">
              {(pendingRequests.length > 0 ? pendingRequests : allRequests.slice(0, 20)).map((req) => (
                <li
                  key={req.id}
                  className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-neutral-900 dark:text-white">
                        {req.requesterName} · {req.reason}
                      </p>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                        {req.startDate} → {req.endDate} · {req.totalDays} day{req.totalDays === 1 ? '' : 's'} · {req.compensation}
                        {req.status !== 'pending' ? ` · ${req.status}` : ''}
                      </p>
                      {req.notes ? (
                        <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-1">{req.notes}</p>
                      ) : null}
                    </div>
                  </div>
                  {req.status === 'pending' ? (
                    <>
                      <label className="block">
                        <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                          Note to employee (optional)
                        </span>
                        <input
                          type="text"
                          value={reviewNotesById[req.id] || ''}
                          onChange={(e) =>
                            setReviewNotesById((prev) => ({ ...prev, [req.id]: e.target.value }))
                          }
                          placeholder="Shown if you deny, or saved with approval"
                          className="w-full min-h-[44px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={requestActionId === req.id}
                          onClick={() => void onApproveRequest(req)}
                        >
                          {requestActionId === req.id ? 'Working…' : 'Approve'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={requestActionId === req.id}
                          onClick={() => void onDenyRequest(req)}
                        >
                          Deny
                        </Button>
                      </div>
                    </>
                  ) : req.reviewNotes ? (
                    <p className="text-sm text-neutral-600 dark:text-neutral-300">HR note: {req.reviewNotes}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {pendingRequests.length === 0 && allRequests.length > 0 && (
            <p className="text-sm text-neutral-500 mt-3">No pending requests. Showing recent history above.</p>
          )}
        </Card>
      )}

      {activeTab === 'records' && (
      <>
      <Card padding="lg">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">Add time off</h2>
        <form onSubmit={onCreate} className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Employee</span>
            <select
              value={labourerId}
              onChange={(e) => setLabourerId(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800"
            >
              <option value="">Select employee…</option>
              {labourers.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Reason</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800"
            >
              <option value="">Select reason…</option>
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Paid / Unpaid</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCompensation('paid')}
                className={`min-h-[44px] rounded-lg border text-sm font-medium transition-colors ${
                  compensation === 'paid'
                    ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                    : 'border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200'
                }`}
              >
                Paid
              </button>
              <button
                type="button"
                onClick={() => setCompensation('unpaid')}
                className={`min-h-[44px] rounded-lg border text-sm font-medium transition-colors ${
                  compensation === 'unpaid'
                    ? 'border-red-500 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                    : 'border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200'
                }`}
              >
                Unpaid
              </button>
            </div>
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
          <label className="block md:col-span-2">
            <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Notes (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
              placeholder="Optional payroll/audit notes"
            />
          </label>
          <div className="md:col-span-2 flex items-center justify-between gap-2">
            <div>
              {saveError && <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>}
              {saveSuccess && <p className="text-sm text-emerald-600 dark:text-emerald-400">{saveSuccess}</p>}
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save time off'}
            </Button>
          </div>
        </form>
      </Card>

      <Card padding="lg" className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-xs text-neutral-500 mb-1">Year</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
            >
              {optionsYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-neutral-500 mb-1">Employee filter</span>
            <select
              value={filterLabourerId}
              onChange={(e) => setFilterLabourerId(e.target.value)}
              className="min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm min-w-[220px]"
            >
              <option value="">All employees</option>
              {labourers.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          {!isSupervisor && (
          <label className="block">
            <span className="block text-xs text-neutral-500 mb-1">Reason filter</span>
            <select
              value={filterReason}
              onChange={(e) => setFilterReason(e.target.value)}
              className="min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm min-w-[200px]"
            >
              <option value="">All reasons</option>
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          )}
          <label className="block">
            <span className="block text-xs text-neutral-500 mb-1">Paid / Unpaid</span>
            <select
              value={filterCompensation}
              onChange={(e) => setFilterCompensation(e.target.value as 'all' | CompensationKind)}
              className="min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm min-w-[160px]"
            >
              <option value="all">All</option>
              <option value="paid">Paid only</option>
              <option value="unpaid">Unpaid only</option>
            </select>
          </label>
        </div>

        {loading ? (
          <p className="text-sm text-neutral-500">Loading records…</p>
        ) : loadError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
        ) : (
          <>
            {rowActionError && <p className="text-sm text-red-600 dark:text-red-400">{rowActionError}</p>}
            <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 dark:bg-neutral-800/60">
                  <tr>
                    <th className="text-left px-3 py-2">Employee</th>
                    <th className="text-left px-3 py-2">Reason</th>
                    <th className="text-left px-3 py-2">Paid/Unpaid</th>
                    <th className="text-left px-3 py-2">Start</th>
                    <th className="text-left px-3 py-2">End</th>
                    <th className="text-right px-3 py-2">Days</th>
                    <th className="text-left px-3 py-2">Comment</th>
                    <th className="text-left px-3 py-2">Entered by</th>
                    {canEditEntries && <th className="text-left px-3 py-2">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={canEditEntries ? 9 : 8} className="px-3 py-4 text-neutral-500">
                        No time off records for this filter.
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map((e) => (
                      <tr key={e.id} className="border-t border-neutral-100 dark:border-neutral-800">
                        <td className="px-3 py-2">
                          {editingId === e.id ? (
                            <select
                              value={editLabourerId}
                              onChange={(ev) => setEditLabourerId(ev.target.value)}
                              aria-label="Edit employee"
                              title="Edit employee"
                              className="min-h-[34px] px-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800"
                            >
                              <option value="">Select employee…</option>
                              {labourers.map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            e.labourerName
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {editingId === e.id ? (
                            <select
                              value={editReason}
                              onChange={(ev) => setEditReason(ev.target.value)}
                              aria-label="Edit reason"
                              title="Edit reason"
                              className="min-h-[34px] px-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800"
                            >
                              <option value="">Select reason…</option>
                              {reasons.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          ) : (
                            displayReason(e.reason)
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {editingId === e.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setEditCompensation('paid')}
                                className={`px-2 py-1 rounded border text-xs ${
                                  editCompensation === 'paid'
                                    ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                                    : 'border-neutral-300 dark:border-neutral-600'
                                }`}
                              >
                                Paid
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditCompensation('unpaid')}
                                className={`px-2 py-1 rounded border text-xs ${
                                  editCompensation === 'unpaid'
                                    ? 'border-red-500 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                                    : 'border-neutral-300 dark:border-neutral-600'
                                }`}
                              >
                                Unpaid
                              </button>
                            </div>
                          ) : (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${
                                normalizeCompensation(e) === 'paid'
                                  ? 'border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                                  : 'border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                              }`}
                            >
                              {normalizeCompensation(e) === 'paid' ? 'Paid' : 'Unpaid'}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {editingId === e.id ? (
                            <input
                              type="date"
                              value={editStartDate}
                              onChange={(ev) => setEditStartDate(ev.target.value)}
                              aria-label="Edit start date"
                              title="Edit start date"
                              className="min-h-[34px] px-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800"
                            />
                          ) : (
                            e.startDate || '-'
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {editingId === e.id ? (
                            <input
                              type="date"
                              value={editEndDate}
                              onChange={(ev) => setEditEndDate(ev.target.value)}
                              aria-label="Edit end date"
                              title="Edit end date"
                              className="min-h-[34px] px-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800"
                            />
                          ) : (
                            e.endDate || '-'
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">{e.totalDays}</td>
                        <td className="px-3 py-2 max-w-[240px]">
                          {editingId === e.id ? (
                            <textarea
                              value={editNotes}
                              onChange={(ev) => setEditNotes(ev.target.value)}
                              rows={2}
                              className="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-xs"
                              placeholder="Optional comment"
                            />
                          ) : (
                            <span className="text-neutral-600 dark:text-neutral-300 whitespace-pre-wrap break-words">
                              {e.notes?.trim() ? e.notes : '—'}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">{e.createdByName}</td>
                        {canEditEntries && (
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              {editingId === e.id ? (
                                <>
                                  <Button type="button" size="sm" onClick={onSaveEdit} disabled={savingEdit}>
                                    {savingEdit ? 'Saving…' : 'Save'}
                                  </Button>
                                  <Button type="button" size="sm" variant="ghost" onClick={cancelEdit} disabled={savingEdit}>
                                    Cancel
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button type="button" size="sm" variant="ghost" onClick={() => startEdit(e)} disabled={deletingId === e.id}>
                                    Edit
                                  </Button>
                                  <Button type="button" size="sm" variant="ghost" onClick={() => onDelete(e)} disabled={deletingId === e.id}>
                                    {deletingId === e.id ? 'Deleting…' : 'Delete'}
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="pt-2 border-t border-neutral-100 dark:border-neutral-700">
              <h3 className="font-medium text-neutral-900 dark:text-white">Year-end totals ({selectedYear})</h3>
              <p className="text-sm text-neutral-500 mt-0.5">
                Total days off across shown employees: <span className="font-semibold text-neutral-700 dark:text-neutral-200">{displayYearlyTotalDays}</span>
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                Days exclude weekends and Ontario stat holidays.
              </p>
              <ul className="mt-2 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {displayYearlyTotals.length === 0 ? (
                  <li className="text-sm text-neutral-500">No totals yet.</li>
                ) : (
                  displayYearlyTotals.map((t) => (
                    <li key={t.labourerId} className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm">
                      <span className="font-medium">{t.labourerName}</span>
                      <span className="text-neutral-500"> · {t.totalDays} days</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </>
        )}
      </Card>

      <Card padding="lg">
        <h3 className="font-medium text-neutral-900 dark:text-white">Ontario stat holidays ({selectedYear})</h3>
        {holidays.length === 0 ? (
          <p className="text-xs text-neutral-500 mt-1">No holiday dates available for this year.</p>
        ) : (
          <ul className="mt-2 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {holidays.map((h) => (
              <li key={`${h.date}-${h.name}`} className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-xs">
                <span className="font-medium text-neutral-800 dark:text-neutral-100">{h.date}</span>
                <span className="text-neutral-500"> · {h.name}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      </>
      )}
    </div>
  )
}
