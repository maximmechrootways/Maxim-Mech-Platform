import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { formatAxiosError } from '@/api'
import { fetchJobs, type JobListItem } from '@/api/jobs'
import {
  rescanOutgoingInvoiceFromPdf,
  updateOutgoingInvoice,
  type OutgoingInvoiceDetail,
} from '@/api/outgoingInvoices'

type Props = {
  invoice: OutgoingInvoiceDetail
  onUpdated: (invoice: OutgoingInvoiceDetail) => void
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

export function OutgoingInvoiceEditForm({ invoice, onUpdated }: Props) {
  const [customerName, setCustomerName] = useState(invoice.customerName || '')
  const [invoiceNumber, setInvoiceNumber] = useState(invoice.invoiceNumber || '')
  const [invoiceDate, setInvoiceDate] = useState(toDateInput(invoice.invoiceDate))
  const [dueDate, setDueDate] = useState(toDateInput(invoice.dueDate))
  const [subtotal, setSubtotal] = useState(invoice.subtotal || '')
  const [taxAmount, setTaxAmount] = useState(invoice.taxAmount || '')
  const [totalAmount, setTotalAmount] = useState(invoice.totalAmount || '')
  const [currency, setCurrency] = useState(invoice.currency || 'CAD')
  const [orderNumber, setOrderNumber] = useState(invoice.orderNumber || '')
  const [supplierNumber, setSupplierNumber] = useState(invoice.supplierNumber || '')
  const [projectName, setProjectName] = useState(invoice.projectName || '')
  const [jobId, setJobId] = useState(invoice.jobId || '')
  const [paymentTerms, setPaymentTerms] = useState(invoice.paymentTerms || '')
  const [notes, setNotes] = useState(invoice.notes || '')
  const [jobs, setJobs] = useState<JobListItem[]>([])
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchJobs().then(setJobs).catch(() => undefined)
  }, [])

  useEffect(() => {
    setCustomerName(invoice.customerName || '')
    setInvoiceNumber(invoice.invoiceNumber || '')
    setInvoiceDate(toDateInput(invoice.invoiceDate))
    setDueDate(toDateInput(invoice.dueDate))
    setSubtotal(invoice.subtotal || '')
    setTaxAmount(invoice.taxAmount || '')
    setTotalAmount(invoice.totalAmount || '')
    setCurrency(invoice.currency || 'CAD')
    setOrderNumber(invoice.orderNumber || '')
    setSupplierNumber(invoice.supplierNumber || '')
    setProjectName(invoice.projectName || '')
    setJobId(invoice.jobId || '')
    setPaymentTerms(invoice.paymentTerms || '')
    setNotes(invoice.notes || '')
  }, [invoice])

  function applyInvoice(data: OutgoingInvoiceDetail) {
    onUpdated(data)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const updated = await updateOutgoingInvoice(invoice.id, {
        customerName: customerName.trim() || null,
        invoiceNumber: invoiceNumber.trim() || null,
        invoiceDate: invoiceDate || null,
        dueDate: dueDate || null,
        subtotal: subtotal.trim() ? Number(subtotal) : null,
        taxAmount: taxAmount.trim() ? Number(taxAmount) : null,
        totalAmount: totalAmount.trim() ? Number(totalAmount) : null,
        currency: currency.trim() || 'CAD',
        orderNumber: orderNumber.trim() || null,
        supplierNumber: supplierNumber.trim() || null,
        projectName: projectName.trim() || null,
        jobId: jobId || null,
        paymentTerms: paymentTerms.trim() || null,
        notes: notes.trim() || null,
      })
      applyInvoice(updated)
      setMessage('Saved.')
    } catch (err: unknown) {
      setError(formatAxiosError(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleRescan() {
    setScanning(true)
    setError(null)
    setMessage(null)
    try {
      const updated = await rescanOutgoingInvoiceFromPdf(invoice.id)
      applyInvoice(updated)
      setMessage('PDF scanned — fields updated.')
    } catch (err: unknown) {
      setError(formatAxiosError(err))
    } finally {
      setScanning(false)
    }
  }

  async function handleMarkPaid(paid: boolean) {
    setSaving(true)
    setError(null)
    try {
      const updated = await updateOutgoingInvoice(invoice.id, { paid })
      applyInvoice(updated)
      setMessage(paid ? 'Marked paid.' : 'Marked unpaid.')
    } catch (err: unknown) {
      setError(formatAxiosError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
        <Button type="button" variant="secondary" disabled={scanning} onClick={() => void handleRescan()}>
          {scanning ? 'Scanning…' : 'Rescan PDF'}
        </Button>
        {invoice.status !== 'PAID' ? (
          <Button type="button" variant="outline" disabled={saving} onClick={() => void handleMarkPaid(true)}>
            Mark paid
          </Button>
        ) : (
          <Button type="button" variant="outline" disabled={saving} onClick={() => void handleMarkPaid(false)}>
            Mark unpaid
          </Button>
        )}
      </div>
      {message && <p className="text-sm text-green-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-sm">
          <span className="text-muted-foreground">Customer</span>
          <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="mt-1" />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Invoice #</span>
          <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="mt-1" />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Invoice date</span>
          <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="mt-1" />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Due date</span>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1" />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <Input value={subtotal} onChange={(e) => setSubtotal(e.target.value)} className="mt-1" />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">HST / tax</span>
          <Input value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} className="mt-1" />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Total</span>
          <Input value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} className="mt-1" />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Currency</span>
          <Input value={currency} onChange={(e) => setCurrency(e.target.value)} className="mt-1" />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Order #</span>
          <Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} className="mt-1" />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Supplier #</span>
          <Input value={supplierNumber} onChange={(e) => setSupplierNumber(e.target.value)} className="mt-1" />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Project</span>
          <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} className="mt-1" />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Payment terms</span>
          <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className="mt-1" />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-muted-foreground">Job</span>
          <select
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            className="mt-1 w-full min-h-[40px] rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="">— Select job —</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}{job.siteName ? ` (${job.siteName})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm sm:col-span-3">
          <span className="text-muted-foreground">Notes</span>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" />
        </label>
      </dl>
    </form>
  )
}
