import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IncomingInvoiceAttachmentActions } from '@/components/invoices/IncomingInvoiceAttachmentActions'
import { IncomingInvoiceEditForm } from '@/components/invoices/IncomingInvoiceEditForm'
import { formatAxiosError } from '@/api'
import { useAuth } from '@/contexts/AuthContext'
import {
  deleteIncomingInvoice,
  fetchIncomingInvoiceDetail,
  type IncomingInvoiceDetail,
} from '@/api/incomingInvoices'

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

export function IncomingInvoiceDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { authReady } = useAuth()
  const [invoice, setInvoice] = useState<IncomingInvoiceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  useEffect(() => {
    if (!id || !authReady) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchIncomingInvoiceDetail(id)
      .then((data) => { if (!cancelled) setInvoice(data) })
      .catch((e: unknown) => {
        if (!cancelled) setError(formatAxiosError(e) || 'Failed to load invoice.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [authReady, id])

  async function handleDelete() {
    if (!id || !invoice) return
    const label = invoice.vendorName || invoice.invoiceNumber || invoice.emailSubject || 'this invoice'
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return
    setDeleting(true)
    setError(null)
    try {
      await deleteIncomingInvoice(id)
      navigate('/incoming-invoices')
    } catch (e: unknown) {
      setError(formatAxiosError(e) || 'Delete failed.')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <p className="text-muted-foreground">Loading…</p>
  if (error) return <p className="text-red-600">{error}</p>
  if (!invoice) return <p className="text-muted-foreground">Invoice not found.</p>

  const extracted = invoice.extractedData as Record<string, unknown> | null

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/incoming-invoices" className="text-sm text-primary hover:underline">← Incoming Invoices</Link>
          <h1 className="font-display font-bold text-display-xl text-foreground mt-2">
            {invoice.vendorName || invoice.emailSubject || 'Invoice'}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={invoice.documentType === 'RECEIPT' ? 'success' : invoice.documentType === 'STATEMENT' ? 'info' : 'default'}>
              {invoice.documentType === 'RECEIPT' ? 'Receipt' : invoice.documentType === 'STATEMENT' ? 'Statement' : 'Invoice'}
            </Badge>
            {invoice.invoiceNumber && (
              <p className="text-muted-foreground">
                {invoice.documentType === 'RECEIPT' ? 'Paid invoice' : 'Invoice'} #{invoice.invoiceNumber}
              </p>
            )}
            {invoice.relatedInvoiceId && (
              <Link to={`/incoming-invoices/${invoice.relatedInvoiceId}`} className="text-sm text-primary hover:underline">
                View linked invoice
              </Link>
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
            <Field label="Received" value={formatDate(invoice.receivedAt)} />
            <Field label="Subject" value={invoice.emailSubject} />
          </dl>
          {invoice.emailBodyText && (
            <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4 text-sm whitespace-pre-wrap">
              {invoice.emailBodyText}
            </div>
          )}
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription>Invoice details</CardDescription>
          <div className="mt-4">
            <IncomingInvoiceEditForm invoice={invoice} onUpdated={setInvoice} />
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
                {id && (
                  <IncomingInvoiceAttachmentActions
                    invoiceId={id}
                    attachmentId={attachment.id}
                    fileName={attachment.originalName || 'invoice.pdf'}
                    size="md"
                    prefetch={false}
                  />
                )}
              </div>
            ))}
          </div>
        </CardHeader>
      </Card>

      {extracted && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardDescription>Full AI extraction</CardDescription>
              <Badge variant="info">JSON</Badge>
            </div>
            <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-muted/20 p-4 text-xs">
              {JSON.stringify(extracted, null, 2)}
            </pre>
          </CardHeader>
        </Card>
      )}
    </div>
  )
}
