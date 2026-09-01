import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
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
  const [vendor, setVendor] = useState('')
  const [sort, setSort] = useState('received')
  const [documentType, setDocumentType] = useState('')
  const [paidFilter, setPaidFilter] = useState('')
  const [reviewedFilter, setReviewedFilter] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [showManualForm, setShowManualForm] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [jobs, setJobs] = useState<JobListItem[]>([])
  const [updatingRowId, setUpdatingRowId] = useState<string | null>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function openEdit(row: IncomingInvoiceListRow) {
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
    if (!authReady) return
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      fetchIncomingInvoices({
        q: search || undefined,
        vendor: vendor.trim() || undefined,
        sort: sort === 'received' ? undefined : sort,
        documentType: documentType || undefined,
        paid: paidFilter || undefined,
        reviewed: reviewedFilter || undefined,
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
  }, [authReady, search, vendor, sort, documentType, paidFilter, reviewedFilter, offset, reloadNonce])

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
      const [list, summaryData] = await Promise.all([
        fetchIncomingInvoices({ q: search || undefined, vendor: vendor.trim() || undefined, limit: PAGE, offset: 0 }),
        fetchIncomingInvoicesSummary(),
      ])
      setRows(list.rows)
      setTotal(list.total)
      setSummary(summaryData)
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
          <p className="text-muted-foreground mt-1">
            Invoices received at accounting@maximmech.com, extracted from email and PDF attachments.
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
        <div className="grid gap-4 sm:grid-cols-3">
          <Card><CardHeader><CardDescription>Total invoices</CardDescription><p className="text-2xl font-semibold">{summary.total}</p></CardHeader></Card>
          <Card><CardHeader><CardDescription>This month</CardDescription><p className="text-2xl font-semibold">{summary.thisMonth}</p></CardHeader></Card>
          <Card className={summary.failedJobs > 0 ? 'border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-950/20' : undefined}>
            <CardHeader>
              <CardDescription className={summary.failedJobs > 0 ? 'text-red-700 dark:text-red-300' : undefined}>
                Failed jobs
              </CardDescription>
              <p className={`text-2xl font-semibold ${summary.failedJobs > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                {summary.failedJobs}
              </p>
              {summary.failedJobs > 0 && (
                <p className="mt-2 text-sm text-red-700 dark:text-red-300">
                  Check the inbox email for any missed invoices.
                </p>
              )}
            </CardHeader>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-3">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search vendor, invoice #, PO, subject, notes…"
              className="min-w-[240px] flex-1"
            />
            <Input
              value={vendor}
              onChange={(e) => { setVendor(e.target.value); setOffset(0) }}
              placeholder="Vendor filter"
              className="min-w-[180px]"
            />
            <select
              value={documentType}
              onChange={(e) => { setDocumentType(e.target.value); setOffset(0) }}
              className="min-h-[40px] rounded-xl border border-border bg-background px-3 text-sm"
              aria-label="Filter by document type"
            >
              <option value="">All types</option>
              <option value="INVOICE">Invoices only</option>
              <option value="RECEIPT">Receipts only</option>
              <option value="STATEMENT">Statements only</option>
            </select>
            <select
              value={paidFilter}
              onChange={(e) => { setPaidFilter(e.target.value); setOffset(0) }}
              className="min-h-[40px] rounded-xl border border-border bg-background px-3 text-sm"
              aria-label="Filter by paid status"
            >
              <option value="">All paid status</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
            <select
              value={reviewedFilter}
              onChange={(e) => { setReviewedFilter(e.target.value); setOffset(0) }}
              className="min-h-[40px] rounded-xl border border-border bg-background px-3 text-sm"
              aria-label="Filter by reviewed status"
            >
              <option value="">All review status</option>
              <option value="reviewed">Reviewed</option>
              <option value="unreviewed">Unreviewed</option>
            </select>
            <select
              value={sort}
              onChange={(e) => { setSort(e.target.value); setOffset(0) }}
              className="min-h-[40px] rounded-xl border border-border bg-background px-3 text-sm"
              aria-label="Sort invoices"
            >
              <option value="received">Sort: received date</option>
              <option value="vendor">Sort: vendor</option>
              <option value="total">Sort: total</option>
              <option value="invoiceDate">Sort: invoice date</option>
            </select>
          </div>
        </CardHeader>

        {error && <p className="px-6 pb-4 text-sm text-red-600">{error}</p>}
        {loading ? (
          <p className="px-6 pb-6 text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-6 pb-6 text-muted-foreground">No incoming invoices yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-border text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Paid Status</th>
                  <th className="px-3 py-3 font-medium">Reviewed</th>
                  <th className="px-3 py-3 font-medium">Type</th>
                  <th className="px-3 py-3 font-medium">Received</th>
                  <th className="px-3 py-3 font-medium">Vendor</th>
                  <th className="px-3 py-3 font-medium">Invoice #</th>
                  <th className="px-3 py-3 font-medium">Total</th>
                  <th className="px-3 py-3 font-medium">PO</th>
                  <th className="px-3 py-3 font-medium">Job</th>
                  <th className="px-3 py-3 font-medium">Subject</th>
                  <th className="px-3 py-3 font-medium">Notes</th>
                  <th className="px-3 py-3 font-medium">PDF</th>
                  <th className="px-3 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border hover:bg-muted/40">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <select
                        value={row.paidAt ? 'paid' : 'unpaid'}
                        disabled={updatingRowId === row.id}
                        onChange={(e) => void handlePaidChange(row, e.target.value === 'paid')}
                        className="min-h-[32px] rounded-lg border border-border bg-background px-2 text-sm"
                        aria-label={`Paid status for ${row.vendorName || row.invoiceNumber || 'invoice'}`}
                      >
                        <option value="unpaid">Unpaid</option>
                        <option value="paid">Paid</option>
                      </select>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-border"
                          checked={Boolean(row.reviewedAt)}
                          disabled={updatingRowId === row.id}
                          onChange={(e) => void handleReviewedChange(row, e.target.checked)}
                          aria-label={`Mark ${row.vendorName || row.invoiceNumber || 'invoice'} as reviewed`}
                        />
                        <span className="text-xs leading-snug text-muted-foreground">
                          {row.reviewedAt
                            ? `Reviewed By: ${row.reviewedByName || user?.name || '—'}`
                            : 'Mark reviewed'}
                        </span>
                      </label>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <Badge variant={documentTypeBadgeVariant(row.documentType)}>
                        {documentTypeLabel(row.documentType)}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(row.receivedAt)}</td>
                    <td className="px-3 py-3">{row.vendorName || '—'}</td>
                    <td className="px-3 py-3">
                      <Link to={`/incoming-invoices/${row.id}`} className="text-primary hover:underline">
                        {row.invoiceNumber || 'View'}
                      </Link>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">{formatMoney(row.totalAmount, row.currency)}</td>
                    <td className="px-3 py-3">{row.poNumber || '—'}</td>
                    <td className="px-3 py-3 min-w-[160px]">
                      <select
                        value={row.jobId || ''}
                        disabled={updatingRowId === row.id}
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
                    <td className="px-3 py-3 max-w-[240px] truncate">{row.emailSubject || '—'}</td>
                    <td className="px-3 py-3 max-w-[180px]">
                      {row.notes ? (
                        <button
                          type="button"
                          className="line-clamp-2 text-left text-sm text-foreground hover:text-primary hover:underline"
                          title={row.notes}
                          onClick={() => openEdit(row)}
                        >
                          {row.notes}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-sm text-muted-foreground hover:text-primary hover:underline"
                          onClick={() => openEdit(row)}
                        >
                          Add note…
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {row.attachments?.length ? (
                        <div className="space-y-2">
                          {row.attachments.map((attachment) => (
                            <IncomingInvoiceAttachmentActions
                              key={attachment.id}
                              invoiceId={row.id}
                              attachmentId={attachment.id}
                              fileName={attachment.originalName || 'invoice.pdf'}
                              prefetch={false}
                            />
                          ))}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => openEdit(row)}>
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-red-200 text-red-700"
                          disabled={deletingId === row.id}
                          onClick={() => void handleDelete(row)}
                        >
                          {deletingId === row.id ? 'Deleting…' : 'Delete'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
