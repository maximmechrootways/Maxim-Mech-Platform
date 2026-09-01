import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { OutgoingInvoiceAttachmentActions } from '@/components/invoices/OutgoingInvoiceAttachmentActions'
import { OutgoingInvoiceEditModal } from '@/components/invoices/OutgoingInvoiceEditModal'
import { Input } from '@/components/ui/Input'
import { formatAxiosError } from '@/api'
import { useAuth } from '@/contexts/AuthContext'
import { useUser } from '@/contexts/UserContext'
import { fetchJobs, type JobListItem } from '@/api/jobs'
import {
  deleteOutgoingInvoice,
  fetchOutgoingInvoices,
  fetchOutgoingInvoicesSummary,
  syncOutgoingInvoices,
  updateOutgoingInvoice,
  type OutgoingInvoiceDetail,
  type OutgoingInvoiceListRow,
} from '@/api/outgoingInvoices'

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

function statusBadgeVariant(status: string): 'default' | 'success' | 'info' | 'warning' {
  if (status === 'PAID') return 'success'
  if (status === 'OVERDUE') return 'warning'
  if (status === 'PARTIAL') return 'info'
  return 'default'
}

function statusLabel(status: string): string {
  if (status === 'PAID') return 'Paid'
  if (status === 'OVERDUE') return 'Overdue'
  if (status === 'PARTIAL') return 'Partial'
  return 'Sent'
}

export function OutgoingInvoicesList() {
  const { authReady } = useAuth()
  const { user } = useUser()
  const [rows, setRows] = useState<OutgoingInvoiceListRow[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [summary, setSummary] = useState<{
    total: number
    sentThisMonth: number
    paidThisMonth: number
    failedJobs: number
    outstandingTotal: number
    overdueCount: number
    overdueAmount: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [customer, setCustomer] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [reviewedFilter, setReviewedFilter] = useState('')
  const [sort, setSort] = useState('sent')
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [jobs, setJobs] = useState<JobListItem[]>([])
  const [updatingRowId, setUpdatingRowId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [reloadNonce, setReloadNonce] = useState(0)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function openEdit(row: OutgoingInvoiceListRow) {
    setEditingId(row.id)
    setEditingTitle(row.customerName || row.invoiceNumber || row.emailSubject || 'Invoice')
  }

  function applyListRowUpdate(updated: OutgoingInvoiceDetail) {
    setRows((prev) => prev.map((row) => (
      row.id === updated.id
        ? {
            ...row,
            customerName: updated.customerName,
            invoiceNumber: updated.invoiceNumber,
            invoiceDate: updated.invoiceDate,
            dueDate: updated.dueDate,
            totalAmount: updated.totalAmount,
            paidAmount: updated.paidAmount,
            currency: updated.currency,
            orderNumber: updated.orderNumber,
            supplierNumber: updated.supplierNumber,
            projectName: updated.projectName,
            jobId: updated.jobId,
            jobTitle: updated.jobTitle,
            paidAt: updated.paidAt,
            reviewedAt: updated.reviewedAt,
            reviewedById: updated.reviewedById,
            reviewedByName: updated.reviewedByName,
            paymentTerms: updated.paymentTerms,
            notes: updated.notes,
            status: updated.status,
          }
        : row
    )))
  }

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      setSearch(searchInput.trim())
      setOffset(0)
    }, 300)
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [searchInput])

  useEffect(() => {
    if (!authReady) return
    fetchJobs().then(setJobs).catch(() => undefined)
    fetchOutgoingInvoicesSummary().then(setSummary).catch(() => undefined)
  }, [authReady, reloadNonce])

  useEffect(() => {
    if (!authReady) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchOutgoingInvoices({
      q: search || undefined,
      customer: customer || undefined,
      status: statusFilter || undefined,
      reviewed: reviewedFilter || undefined,
      sort,
      limit: PAGE,
      offset,
    })
      .then((data) => {
        if (!cancelled) {
          setRows(data.rows)
          setTotal(data.total)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(formatAxiosError(e) || 'Failed to load outgoing invoices.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [authReady, search, customer, statusFilter, reviewedFilter, sort, offset, reloadNonce])

  const currentPage = Math.floor(offset / PAGE) + 1
  const pageCount = Math.max(1, Math.ceil(total / PAGE))

  async function handlePaidChange(row: OutgoingInvoiceListRow, paid: boolean) {
    setUpdatingRowId(row.id)
    try {
      const updated = await updateOutgoingInvoice(row.id, { paid })
      setRows((prev) => prev.map((r) => (r.id === row.id ? {
        ...r,
        paidAt: updated.paidAt,
        status: updated.status,
      } : r)))
      setReloadNonce((n) => n + 1)
    } catch (e: unknown) {
      setError(formatAxiosError(e) || 'Update failed.')
    } finally {
      setUpdatingRowId(null)
    }
  }

  async function handleReviewedChange(row: OutgoingInvoiceListRow, reviewed: boolean) {
    setUpdatingRowId(row.id)
    try {
      const updated = await updateOutgoingInvoice(row.id, { reviewed })
      setRows((prev) => prev.map((r) => (r.id === row.id ? {
        ...r,
        reviewedAt: updated.reviewedAt,
        reviewedById: updated.reviewedById,
        reviewedByName: updated.reviewedByName,
      } : r)))
    } catch (e: unknown) {
      setError(formatAxiosError(e) || 'Could not update reviewed status.')
    } finally {
      setUpdatingRowId(null)
    }
  }

  async function handleJobChange(row: OutgoingInvoiceListRow, nextJobId: string) {
    setUpdatingRowId(row.id)
    try {
      const updated = await updateOutgoingInvoice(row.id, { jobId: nextJobId || null })
      setRows((prev) => prev.map((r) => (r.id === row.id ? {
        ...r,
        jobId: updated.jobId,
        jobTitle: updated.jobTitle,
      } : r)))
    } catch (e: unknown) {
      setError(formatAxiosError(e) || 'Update failed.')
    } finally {
      setUpdatingRowId(null)
    }
  }

  async function handleDelete(row: OutgoingInvoiceListRow) {
    const label = row.customerName || row.invoiceNumber || row.emailSubject || 'this invoice'
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return
    setDeletingId(row.id)
    try {
      await deleteOutgoingInvoice(row.id)
      setReloadNonce((n) => n + 1)
    } catch (e: unknown) {
      setError(formatAxiosError(e) || 'Delete failed.')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setSyncMessage(null)
    setError(null)
    try {
      const result = await syncOutgoingInvoices()
      const parts = [
        result.scanned != null ? `${result.scanned} scanned` : null,
        result.enqueued != null ? `${result.enqueued} enqueued` : null,
        result.completed != null ? `${result.completed} completed` : null,
      ].filter(Boolean)
      setSyncMessage(parts.length ? `Sync: ${parts.join(', ')}.` : 'Sync complete.')
      setReloadNonce((n) => n + 1)
    } catch (e: unknown) {
      setError(formatAxiosError(e) || 'Sync failed.')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-display-xl text-foreground">Outgoing Invoices</h1>
          <p className="text-muted-foreground mt-1">
            Invoices sent from accounting@maximmech.com, auto-ingested from Gmail Sent with PDF attachments.
          </p>
        </div>
        {(user?.role === 'owner' || user?.role === 'hr') && (
          <Button type="button" onClick={() => void handleSync()} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync sent mail'}
          </Button>
        )}
      </div>

      {syncMessage && <p className="text-sm text-muted-foreground">{syncMessage}</p>}

      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card><CardHeader><CardDescription>Outstanding</CardDescription><p className="text-2xl font-semibold">{formatMoney(String(summary.outstandingTotal), 'CAD')}</p></CardHeader></Card>
          <Card><CardHeader><CardDescription>Overdue ({summary.overdueCount})</CardDescription><p className="text-2xl font-semibold">{formatMoney(String(summary.overdueAmount), 'CAD')}</p></CardHeader></Card>
          <Card><CardHeader><CardDescription>Sent this month</CardDescription><p className="text-2xl font-semibold">{summary.sentThisMonth}</p></CardHeader></Card>
          <Card><CardHeader><CardDescription>Paid this month</CardDescription><p className="text-2xl font-semibold">{summary.paidThisMonth}</p></CardHeader></Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-3">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search customer, invoice #, order #, project…"
              className="min-w-[240px] flex-1"
            />
            <Input
              value={customer}
              onChange={(e) => { setCustomer(e.target.value); setOffset(0) }}
              placeholder="Customer filter"
              className="min-w-[180px]"
            />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setOffset(0) }}
              className="min-h-[40px] rounded-xl border border-border bg-background px-3 text-sm"
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="SENT">Sent</option>
              <option value="OVERDUE">Overdue</option>
              <option value="PARTIAL">Partial</option>
              <option value="PAID">Paid</option>
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
              <option value="sent">Sort: sent date</option>
              <option value="dueDate">Sort: due date</option>
              <option value="customer">Sort: customer</option>
              <option value="total">Sort: total</option>
            </select>
          </div>
        </CardHeader>

        {error && <p className="px-6 pb-4 text-sm text-red-600">{error}</p>}
        {loading ? (
          <p className="px-6 pb-6 text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-6 pb-6 text-muted-foreground">No outgoing invoices yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-border text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Sent</th>
                  <th className="px-3 py-3 font-medium">Due</th>
                  <th className="px-3 py-3 font-medium">Customer</th>
                  <th className="px-3 py-3 font-medium">Invoice #</th>
                  <th className="px-3 py-3 font-medium">Total</th>
                  <th className="px-3 py-3 font-medium">Order #</th>
                  <th className="px-3 py-3 font-medium">Project</th>
                  <th className="px-3 py-3 font-medium">Job</th>
                  <th className="px-3 py-3 font-medium">Paid</th>
                  <th className="px-3 py-3 font-medium">Reviewed</th>
                  <th className="px-3 py-3 font-medium">PDF</th>
                  <th className="px-3 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border hover:bg-muted/40">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge variant={statusBadgeVariant(row.status)}>{statusLabel(row.status)}</Badge>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(row.sentAt)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(row.dueDate)}</td>
                    <td className="px-3 py-3">{row.customerName || '—'}</td>
                    <td className="px-3 py-3">
                      <Link to={`/outgoing-invoices/${row.id}`} className="text-primary hover:underline">
                        {row.invoiceNumber || 'View'}
                      </Link>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">{formatMoney(row.totalAmount, row.currency)}</td>
                    <td className="px-3 py-3">{row.orderNumber || '—'}</td>
                    <td className="px-3 py-3 max-w-[180px] truncate">{row.projectName || '—'}</td>
                    <td className="px-3 py-3 min-w-[160px]">
                      <select
                        value={row.jobId || ''}
                        disabled={updatingRowId === row.id}
                        onChange={(e) => void handleJobChange(row, e.target.value)}
                        className="w-full min-h-[32px] rounded-lg border border-border bg-background px-2 text-sm"
                      >
                        <option value="">— Select job —</option>
                        {jobs.map((job) => (
                          <option key={job.id} value={job.id}>
                            {job.title}{job.siteName ? ` (${job.siteName})` : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <select
                        value={row.paidAt ? 'paid' : 'unpaid'}
                        disabled={updatingRowId === row.id}
                        onChange={(e) => void handlePaidChange(row, e.target.value === 'paid')}
                        className="min-h-[32px] rounded-lg border border-border bg-background px-2 text-sm"
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
                          aria-label={`Mark ${row.customerName || row.invoiceNumber || 'invoice'} as reviewed`}
                        />
                        <span className="text-xs leading-snug text-muted-foreground">
                          {row.reviewedAt
                            ? `Reviewed By: ${row.reviewedByName || user?.name || '—'}`
                            : 'Mark reviewed'}
                        </span>
                      </label>
                    </td>
                    <td className="px-3 py-3">
                      {row.attachments?.length ? (
                        <OutgoingInvoiceAttachmentActions
                          invoiceId={row.id}
                          attachmentId={row.attachments[0].id}
                          fileName={row.attachments[0].originalName || 'invoice.pdf'}
                          prefetch={false}
                        />
                      ) : '—'}
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
        <OutgoingInvoiceEditModal
          invoiceId={editingId}
          title={editingTitle}
          onClose={() => setEditingId(null)}
          onSaved={(updated) => {
            applyListRowUpdate(updated)
            setEditingTitle(updated.customerName || updated.invoiceNumber || updated.emailSubject || 'Invoice')
          }}
        />
      )}
    </div>
  )
}
