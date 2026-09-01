import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { OutgoingInvoiceAttachmentActions } from '@/components/invoices/OutgoingInvoiceAttachmentActions'
import { OutgoingInvoiceEditForm } from '@/components/invoices/OutgoingInvoiceEditForm'
import { formatAxiosError } from '@/api'
import { useAuth } from '@/contexts/AuthContext'
import {
  deleteOutgoingInvoice,
  fetchOutgoingInvoiceDetail,
  type OutgoingInvoiceDetail,
} from '@/api/outgoingInvoices'

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch {
    return '—'
  }
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value || '—'}</dd>
    </div>
  )
}

function statusBadgeVariant(status: string): 'default' | 'success' | 'info' | 'warning' {
  if (status === 'PAID') return 'success'
  if (status === 'OVERDUE') return 'warning'
  if (status === 'PARTIAL') return 'info'
  return 'default'
}

export function OutgoingInvoiceDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { authReady } = useAuth()
  const [invoice, setInvoice] = useState<OutgoingInvoiceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!id || !authReady) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchOutgoingInvoiceDetail(id)
      .then((data) => { if (!cancelled) setInvoice(data) })
      .catch((e: unknown) => {
        if (!cancelled) setError(formatAxiosError(e) || 'Failed to load invoice.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [authReady, id])

  async function handleDelete() {
    if (!id || !invoice) return
    const label = invoice.customerName || invoice.invoiceNumber || invoice.emailSubject || 'this invoice'
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return
    setDeleting(true)
    setError(null)
    try {
      await deleteOutgoingInvoice(id)
      navigate('/outgoing-invoices')
    } catch (e: unknown) {
      setError(formatAxiosError(e) || 'Delete failed.')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <p className="text-muted-foreground">Loading…</p>
  if (error) return <p className="text-red-600">{error}</p>
  if (!invoice) return <p className="text-muted-foreground">Invoice not found.</p>

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/outgoing-invoices" className="text-sm text-primary hover:underline">← Outgoing Invoices</Link>
          <h1 className="font-display font-bold text-display-xl text-foreground mt-2">
            {invoice.customerName || invoice.emailSubject || 'Invoice'}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={statusBadgeVariant(invoice.status)}>{invoice.status}</Badge>
            {invoice.invoiceNumber && (
              <p className="text-muted-foreground">Invoice #{invoice.invoiceNumber}</p>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="border-red-200 text-red-700"
          disabled={deleting}
          onClick={() => void handleDelete()}
        >
          {deleting ? 'Deleting…' : 'Delete invoice'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardDescription>Email</CardDescription>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="From" value={invoice.emailFrom} />
            <Field label="To" value={invoice.emailTo} />
            <Field label="Sent" value={formatDate(invoice.sentAt)} />
            <Field label="Subject" value={invoice.emailSubject} />
          </dl>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription>Invoice details</CardDescription>
          <div className="mt-4">
            <OutgoingInvoiceEditForm invoice={invoice} onUpdated={setInvoice} />
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription>PDF attachments</CardDescription>
          <div className="mt-4 space-y-3">
            {invoice.attachments.map((attachment) => (
              <div key={attachment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
                <div>
                  <p className="font-medium">{attachment.originalName}</p>
                  <p className="text-xs text-muted-foreground">
                    {attachment.sizeBytes ? `${Math.round(attachment.sizeBytes / 1024)} KB` : 'PDF'}
                  </p>
                </div>
                <OutgoingInvoiceAttachmentActions
                  invoiceId={invoice.id}
                  attachmentId={attachment.id}
                  fileName={attachment.originalName}
                />
              </div>
            ))}
            {!invoice.attachments.length && <p className="text-muted-foreground">No attachments.</p>}
          </div>
        </CardHeader>
      </Card>
    </div>
  )
}
