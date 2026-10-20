import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { IncomingInvoiceAttachmentActions } from '@/components/invoices/IncomingInvoiceAttachmentActions'
import { Input } from '@/components/ui/Input'
import { formatAxiosError } from '@/api'
import { useAuth } from '@/contexts/AuthContext'
import { useUser } from '@/contexts/UserContext'
import { IncomingInvoiceEditModal } from '@/components/invoices/IncomingInvoiceEditModal'
import { IncomingInvoiceManualForm } from '@/components/invoices/IncomingInvoiceManualForm'
import {
  deleteIncomingInvoice,
  fetchIncomingInvoices,
  fetchIncomingInvoicesSummary,
  syncIncomingInvoices,
  updateIncomingInvoice,
  type IncomingInvoiceDetail,
  type IncomingInvoiceListRow,
} from '@/api/incomingInvoices'
import { fetchJobs, type JobListItem } from '@/api/jobs'

const PAGE = 40

type QueuePreset = 'all' | 'needs_attention' | 'unpaid' | 'this_month' | 'missing_job'

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return '—'
  }
}

function documentTypeLabel(type: string | null | undefined): string {
  if (type === 'RECEIPT') return 'Receipt'
  if (type === 'STATEMENT') return 'Statement'
  return 'Invoice'
}

function documentTypeBadgeVariant(type: string | null | undefined): 'default' | 'success' | 'info' {
  if (type === 'RECEIPT') return 'success'
  if (type === 'STATEMENT') return 'info'
  return 'default'
}

function formatMoney(amount: string | null, currency: string | null): string {
  if (!amount) return '—'
  const num = Number(amount)
  if (!Number.isFinite(num)) return amount
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'CAD',
    }).format(num)
  } catch {
    return `${amount} ${currency || ''}`.trim()
  }
}

function startOfMonthIso(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}

function endOfMonthIso(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()
}

const PRESETS: { id: QueuePreset; label: string; hint: string }[] = [
  { id: 'all', label: 'All', hint: 'Everything' },
  { id: 'needs_attention', label: 'Needs review', hint: 'Not reviewed yet' },
  { id: 'unpaid', label: 'Unpaid', hint: 'Awaiting payment' },
  { id: 'this_month', label: 'This month', hint: 'Received this month' },
  { id: 'missing_job', label: 'Missing job', hint: 'No job linked' },
]

export function IncomingInvoicesList() {
  const { authReady } = useAuth()
  const { user } = useUser()
  const [rows, setRows] = useState<IncomingInvoiceListRow[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [summary, setSummary] = useState<{ total: number; thisMonth: number; failedJobs: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('received')
  const [documentType, setDocumentType] = useState('')
  const [paidFilter, setPaidFilter] = useState('')
  const [reviewedFilter, setReviewedFilter] = useState('unreviewed')
  const [hasJobFilter, setHasJobFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  /** Default queue: unreviewed items first (daily AP work). */
  const [preset, setPreset] = useState<QueuePreset>('needs_attention')
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [showManualForm, setShowManualForm] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [jobs, setJobs] = useState<JobListItem[]>([])
  const [updatingRowId, setUpdatingRowId] = useState<string | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  function openEdit(row: IncomingInvoiceListRow) {
    setMenuOpenId(null)
    setEditingId(row.id)
    setEditingTitle(row.vendorName || row.invoiceNumber || row.emailSubject || 'Invoice')
  }

  function applyListRowUpdate(updated: IncomingInvoiceDetail) {
    setRows((prev) => prev.map((row) => (
      row.id === updated.id
        ? {
            ...row,
            vendorName: updated.vendorName,
            invoiceNumber: updated.invoiceNumber,
            invoiceDate: updated.invoiceDate,
            dueDate: updated.dueDate,
            totalAmount: updated.totalAmount,
            currency: updated.currency,
            poNumber: updated.poNumber,
            jobReference: updated.jobReference,
            jobId: updated.jobId,
            paidAt: updated.paidAt,
            reviewedAt: updated.reviewedAt,
            reviewedById: updated.reviewedById,
            reviewedByName: updated.reviewedByName,
            notes: updated.notes,
          }
        : row
    )))
  }

  function applyPreset(next: QueuePreset) {
    setPreset(next)
    setOffset(0)
    setPaidFilter('')
    setReviewedFilter('')
    setHasJobFilter('')
    setDateFrom('')
    setDateTo('')
    if (next === 'needs_attention') setReviewedFilter('unreviewed')
    else if (next === 'unpaid') setPaidFilter('unpaid')
    else if (next === 'this_month') {
      setDateFrom(startOfMonthIso())
      setDateTo(endOfMonthIso())
    } else if (next === 'missing_job') setHasJobFilter('no')
  }

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      searchDebounceRef.current = null
      setSearch(searchInput.trim())
      setOffset(0)
    }, 350)
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [searchInput])

  useEffect(() => {
    if (!authReady) return
    fetchJobs()
      .then((list) => setJobs(list))
      .catch(() => setJobs([]))
  }, [authReady])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return
      if (!menuRef.current.contains(e.target as Node)) setMenuOpenId(null)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(() => {
    if (!authReady) return
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      fetchIncomingInvoices({
        q: search || undefined,
        sort: sort === 'received' ? undefined : sort,
        documentType: documentType || undefined,
        paid: paidFilter || undefined,
        reviewed: reviewedFilter || undefined,
        hasJob: hasJobFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        limit: PAGE,
        offset,
      }),
      fetchIncomingInvoicesSummary(),
    ])
      .then(([list, summaryData]) => {
        if (cancelled) return
        setRows(list.rows)
        setTotal(list.total)
        setSummary(summaryData)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(formatAxiosError(e) || 'Failed to load incoming invoices.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [
    authReady,
    search,
    sort,
    documentType,
    paidFilter,
    reviewedFilter,
    hasJobFilter,
    dateFrom,
    dateTo,
    offset,
    reloadNonce,
  ])

  const pageCount = Math.max(1, Math.ceil(total / PAGE))
  const currentPage = Math.floor(offset / PAGE) + 1

  async function handlePaidChange(row: IncomingInvoiceListRow, paid: boolean) {
    setUpdatingRowId(row.id)
    setError(null)
    try {
      const updated = await updateIncomingInvoice(row.id, { paid })
      setRows((prev) => prev.map((r) => (
        r.id === row.id
          ? { ...r, paidAt: updated.paidAt, jobId: updated.jobId }
          : r
      )))
    } catch (e: unknown) {
      setError(formatAxiosError(e) || 'Could not update paid status.')
    } finally {
      setUpdatingRowId(null)
    }
  }

  async function handleReviewedChange(row: IncomingInvoiceListRow, reviewed: boolean) {
    setUpdatingRowId(row.id)
    setError(null)
    try {
      const updated = await updateIncomingInvoice(row.id, { reviewed })
      setRows((prev) => prev.map((r) => (
        r.id === row.id
          ? {
              ...r,
              reviewedAt: updated.reviewedAt,
              reviewedById: updated.reviewedById,
              reviewedByName: updated.reviewedByName,
            }
          : r
      )))
    } catch (e: unknown) {
      setError(formatAxiosError(e) || 'Could not update reviewed status.')
    } finally {
      setUpdatingRowId(null)
    }
  }

  async function handleJobChange(row: IncomingInvoiceListRow, jobId: string) {
    setUpdatingRowId(row.id)
    setError(null)
    try {
      const updated = await updateIncomingInvoice(row.id, { jobId: jobId || null })
      const jobTitle = jobs.find((j) => j.id === updated.jobId)?.title ?? null
      setRows((prev) => prev.map((r) => (
        r.id === row.id
          ? { ...r, jobId: updated.jobId, jobTitle }
          : r
      )))
    } catch (e: unknown) {
      setError(formatAxiosError(e) || 'Could not update job.')
    } finally {
      setUpdatingRowId(null)
    }
  }

  async function handleDelete(row: IncomingInvoiceListRow) {
    setMenuOpenId(null)
    const label = row.vendorName || row.invoiceNumber || row.emailSubject || 'this invoice'
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return
    setDeletingId(row.id)
    setError(null)
    try {
      await deleteIncomingInvoice(row.id)
      setReloadNonce((n) => n + 1)
    } catch (e: unknown) {
      setError(formatAxiosError(e) || 'Delete failed.')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setError(null)
    setSyncMessage(null)
    try {
      const result = await syncIncomingInvoices()
      const skipped = (result as { skipped?: number }).skipped ?? 0
      const completed = (result as { completed?: number }).completed
      const failed = (result as { failed?: number }).failed
      const ignored = (result as { ignored?: number }).ignored
      const parts = [
        `Scanned ${result.scanned ?? 0} emails`,
        `enqueued ${result.enqueued ?? 0}`,
        skipped ? `skipped ${skipped} already done` : null,
        `processed ${result.processed ?? 0}`,
        completed != null ? `${completed} added` : null,
        failed ? `${failed} failed` : null,
        ignored ? `${ignored} ignored` : null,
      ].filter(Boolean)
      setSyncMessage(parts.join(', ') + '.')
      setOffset(0)
      setReloadNonce((n) => n + 1)
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Sync failed.')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-display-xl text-foreground">Incoming Invoices</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Review inbox invoices, mark paid, and link them to jobs — without the spreadsheet clutter.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setShowManualForm((v) => !v)}>
            {showManualForm ? 'Cancel add' : 'Add invoice'}
          </Button>
          {(user?.role === 'owner' || user?.role === 'hr') && (
            <Button type="button" onClick={() => void handleSync()} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync inbox'}
            </Button>
          )}
        </div>
      </div>

      {showManualForm && (
        <IncomingInvoiceManualForm
          onCancel={() => setShowManualForm(false)}
          onCreated={() => {
            setShowManualForm(false)
            setReloadNonce((n) => n + 1)
          }}
        />
      )}

      {syncMessage && <p className="text-sm text-muted-foreground">{syncMessage}</p>}

      {summary && (
        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => applyPreset('all')}
            className={`text-left rounded-2xl border px-4 py-3 transition ${
              preset === 'all'
                ? 'border-brand-400 bg-brand-50/60 dark:bg-brand-950/30'
                : 'border-border bg-card hover:bg-muted/40'
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{summary.total}</p>
          </button>
          <button
            type="button"
            onClick={() => applyPreset('this_month')}
            className={`text-left rounded-2xl border px-4 py-3 transition ${
              preset === 'this_month'
                ? 'border-brand-400 bg-brand-50/60 dark:bg-brand-950/30'
                : 'border-border bg-card hover:bg-muted/40'
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">This month</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{summary.thisMonth}</p>
          </button>
          <div
            className={`rounded-2xl border px-4 py-3 ${
              summary.failedJobs > 0
                ? 'border-red-300 bg-red-50/40 dark:border-red-800 dark:bg-red-950/20'
                : 'border-border bg-card'
            }`}
          >
            <p className={`text-xs font-medium uppercase tracking-wide ${summary.failedJobs > 0 ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground'}`}>
              Failed sync jobs
            </p>
            <p className={`mt-1 text-2xl font-semibold ${summary.failedJobs > 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
              {summary.failedJobs}
            </p>
            {summary.failedJobs > 0 && (
              <p className="mt-1 text-xs text-red-700 dark:text-red-300">Check inbox for missed invoices, then Sync inbox.</p>
            )}
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-nowrap items-center gap-3 overflow-x-auto pb-1">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search vendor, invoice #, PO, subject, notes…"
              className="min-w-[200px] w-[min(100%,280px)] shrink-0"
              aria-label="Search invoices"
            />
            <div className="ml-auto flex flex-nowrap items-center gap-2 shrink-0" role="tablist" aria-label="Invoice queues and filters">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={preset === p.id}
                  title={p.hint}
                  onClick={() => applyPreset(p.id)}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    preset === p.id
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <select
                value={documentType}
                onChange={(e) => { setDocumentType(e.target.value); setOffset(0) }}
                className="min-h-[36px] rounded-xl border border-border bg-background px-3 text-sm whitespace-nowrap"
                aria-label="Filter by document type"
              >
                <option value="">All types</option>
                <option value="INVOICE">Invoices only</option>
                <option value="RECEIPT">Receipts only</option>
                <option value="STATEMENT">Statements only</option>
              </select>
              <select
                value={sort}
                onChange={(e) => { setSort(e.target.value); setOffset(0) }}
                className="min-h-[36px] rounded-xl border border-border bg-background px-3 text-sm whitespace-nowrap"
                aria-label="Sort invoices"
              >
                <option value="received">Sort: received</option>
                <option value="vendor">Sort: vendor</option>
                <option value="total">Sort: total</option>
                <option value="invoiceDate">Sort: invoice date</option>
              </select>
            </div>
          </div>

          <CardDescription>
            Showing {total} {total === 1 ? 'document' : 'documents'}
            {preset !== 'all' ? ` · ${PRESETS.find((p) => p.id === preset)?.label}` : ''}
          </CardDescription>
        </CardHeader>

        {error && <p className="px-6 pb-4 text-sm text-red-600">{error}</p>}

        {loading ? (
          <p className="px-6 pb-6 text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No invoices in this queue"
            description={
              preset === 'needs_attention'
                ? 'Nothing left to review. Try All or Unpaid.'
                : 'Try another queue, clear filters, or sync the inbox.'
            }
            compact
          />
        ) : (
          <>
            {/* Mobile cards */}
            <ul className="md:hidden divide-y divide-border">
              {rows.map((row) => {
                const paid = Boolean(row.paidAt)
                const reviewed = Boolean(row.reviewedAt)
                const busy = updatingRowId === row.id
                const firstAttachment = row.attachments?.[0]
                return (
                  <li key={row.id} className="px-4 py-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          to={`/incoming-invoices/${row.id}`}
                          className="font-medium text-foreground hover:text-primary line-clamp-1"
                        >
                          {row.vendorName || row.emailSubject || 'Untitled'}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {row.invoiceNumber ? `#${row.invoiceNumber}` : 'No invoice #'} · {formatShortDate(row.receivedAt)}
                        </p>
                        <div className="mt-2">
                          <Badge variant={documentTypeBadgeVariant(row.documentType)}>
                            {documentTypeLabel(row.documentType)}
                          </Badge>
                        </div>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums">
                        {formatMoney(row.totalAmount, row.currency)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handlePaidChange(row, !paid)}
                        className={`rounded-full px-3 py-1 text-xs font-medium border transition ${
                          paid
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'border-border bg-background text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {paid ? 'Paid' : 'Unpaid'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleReviewedChange(row, !reviewed)}
                        className={`rounded-full px-3 py-1 text-xs font-medium border transition ${
                          reviewed
                            ? 'border-brand-300 bg-brand-50 text-brand-800 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-300'
                            : 'border-border bg-background text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {reviewed ? `Reviewed${row.reviewedByName ? ` · ${row.reviewedByName}` : ''}` : 'Mark reviewed'}
                      </button>
                    </div>

                    <select
                      value={row.jobId || ''}
                      disabled={busy}
                      onChange={(e) => void handleJobChange(row, e.target.value)}
                      className="w-full min-h-[36px] rounded-lg border border-border bg-background px-2 text-sm"
                      aria-label={`Job for ${row.vendorName || row.invoiceNumber || 'invoice'}`}
                    >
                      <option value="">— Select job —</option>
                      {jobs.map((job) => (
                        <option key={job.id} value={job.id}>
                          {job.title}{job.siteName ? ` (${job.siteName})` : ''}
                        </option>
                      ))}
                    </select>

                    <div className="flex flex-wrap gap-2">
                      <Link to={`/incoming-invoices/${row.id}`}>
                        <Button type="button" size="sm" variant="secondary">Open</Button>
                      </Link>
                      {firstAttachment && (
                        <IncomingInvoiceAttachmentActions
                          invoiceId={row.id}
                          attachmentId={firstAttachment.id}
                          fileName={firstAttachment.originalName || 'invoice.pdf'}
                          size="sm"
                          compact
                          prefetch={false}
                        />
                      )}
                      <Button type="button" size="sm" variant="outline" onClick={() => openEdit(row)}>Edit</Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-red-200 text-red-700"
                        disabled={deletingId === row.id}
                        onClick={() => void handleDelete(row)}
                      >
                        {deletingId === row.id ? 'Deleting…' : 'Delete'}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Document</th>
                    <th className="px-3 py-3 font-medium">Amount</th>
                    <th className="px-3 py-3 font-medium">Received</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium min-w-[160px]">Job</th>
                    <th className="px-3 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const paid = Boolean(row.paidAt)
                    const reviewed = Boolean(row.reviewedAt)
                    const busy = updatingRowId === row.id
                    const firstAttachment = row.attachments?.[0]
                    const attachmentCount = row.attachments?.length ?? 0
                    return (
                      <tr key={row.id} className="border-t border-border hover:bg-muted/40 align-top">
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <Badge variant={documentTypeBadgeVariant(row.documentType)}>
                              {documentTypeLabel(row.documentType)}
                            </Badge>
                            {row.notes && (
                              <button
                                type="button"
                                className="text-xs text-muted-foreground hover:text-primary underline-offset-2 hover:underline"
                                onClick={() => openEdit(row)}
                                title={row.notes}
                              >
                                Has note
                              </button>
                            )}
                          </div>
                          <Link
                            to={`/incoming-invoices/${row.id}`}
                            className="font-medium text-foreground hover:text-primary"
                          >
                            {row.vendorName || 'Unknown vendor'}
                          </Link>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {row.invoiceNumber ? (
                              <>Invoice #{row.invoiceNumber}</>
                            ) : (
                              'No invoice #'
                            )}
                            {row.poNumber ? ` · PO ${row.poNumber}` : ''}
                          </p>
                          {row.emailSubject && (
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-1 max-w-[320px]" title={row.emailSubject}>
                              {row.emailSubject}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap font-semibold tabular-nums">
                          {formatMoney(row.totalAmount, row.currency)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                          {formatDateTime(row.receivedAt)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-1.5 items-start">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handlePaidChange(row, !paid)}
                              className={`rounded-full px-2.5 py-1 text-xs font-medium border transition ${
                                paid
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                                  : 'border-border bg-background text-muted-foreground hover:text-foreground'
                              }`}
                              aria-pressed={paid}
                              aria-label={`Toggle paid for ${row.vendorName || row.invoiceNumber || 'invoice'}`}
                            >
                              {paid ? 'Paid' : 'Unpaid'}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleReviewedChange(row, !reviewed)}
                              className={`rounded-full px-2.5 py-1 text-xs font-medium border transition ${
                                reviewed
                                  ? 'border-brand-300 bg-brand-50 text-brand-800 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-300'
                                  : 'border-border bg-background text-muted-foreground hover:text-foreground'
                              }`}
                              aria-pressed={reviewed}
                              aria-label={`Toggle reviewed for ${row.vendorName || row.invoiceNumber || 'invoice'}`}
                              title={reviewed && row.reviewedByName ? `Reviewed by ${row.reviewedByName}` : undefined}
                            >
                              {reviewed ? 'Reviewed' : 'Unreviewed'}
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <select
                            value={row.jobId || ''}
                            disabled={busy}
                            onChange={(e) => void handleJobChange(row, e.target.value)}
                            className="w-full min-h-[32px] rounded-lg border border-border bg-background px-2 text-sm"
                            aria-label={`Job for ${row.vendorName || row.invoiceNumber || 'invoice'}`}
                          >
                            <option value="">— Select job —</option>
                            {jobs.map((job) => (
                              <option key={job.id} value={job.id}>
                                {job.title}{job.siteName ? ` (${job.siteName})` : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap items-center justify-end gap-2 relative" ref={menuOpenId === row.id ? menuRef : undefined}>
                            <Link to={`/incoming-invoices/${row.id}`}>
                              <Button type="button" size="sm" variant="secondary">Open</Button>
                            </Link>
                            {firstAttachment ? (
                              <IncomingInvoiceAttachmentActions
                                invoiceId={row.id}
                                attachmentId={firstAttachment.id}
                                fileName={firstAttachment.originalName || 'invoice.pdf'}
                                size="sm"
                                compact
                                prefetch={false}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground px-1">No PDF</span>
                            )}
                            {attachmentCount > 1 && (
                              <span className="text-xs text-muted-foreground">+{attachmentCount - 1}</span>
                            )}
                            <div className="relative">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                aria-haspopup="menu"
                                aria-expanded={menuOpenId === row.id}
                                onClick={() => setMenuOpenId((id) => (id === row.id ? null : row.id))}
                              >
                                More
                              </Button>
                              {menuOpenId === row.id && (
                                <div
                                  role="menu"
                                  className="absolute right-0 z-20 mt-1 w-40 rounded-xl border border-border bg-card shadow-lg py-1"
                                >
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted/60"
                                    onClick={() => openEdit(row)}
                                  >
                                    Edit details
                                  </button>
                                  {!row.notes && (
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted/60"
                                      onClick={() => openEdit(row)}
                                    >
                                      Add note
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="w-full px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                                    disabled={deletingId === row.id}
                                    onClick={() => void handleDelete(row)}
                                  >
                                    {deletingId === row.id ? 'Deleting…' : 'Delete'}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!loading && total > PAGE && (
          <div className="flex items-center justify-between border-t border-border px-6 py-4">
            <p className="text-sm text-muted-foreground">Page {currentPage} of {pageCount} · {total} total</p>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
                Previous
              </Button>
              <Button type="button" variant="secondary" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {editingId && (
        <IncomingInvoiceEditModal
          invoiceId={editingId}
          title={editingTitle}
          onClose={() => setEditingId(null)}
          onSaved={(updated) => {
            applyListRowUpdate(updated)
            setEditingTitle(updated.vendorName || updated.invoiceNumber || updated.emailSubject || 'Invoice')
          }}
        />
      )}
    </div>
  )
}
