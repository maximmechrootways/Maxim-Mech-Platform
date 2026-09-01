import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { formatAxiosError } from '@/api'
import {
  rescanIncomingInvoiceFromPdf,
  updateIncomingInvoice,
  type IncomingInvoiceDetail,
} from '@/api/incomingInvoices'

type Props = {
  invoice: IncomingInvoiceDetail
  onUpdated: (invoice: IncomingInvoiceDetail) => void
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

export function IncomingInvoiceEditForm({ invoice, onUpdated }: Props) {
  const [vendorName, setVendorName] = useState(invoice.vendorName || '')
  const [invoiceNumber, setInvoiceNumber] = useState(invoice.invoiceNumber || '')
  const [invoiceDate, setInvoiceDate] = useState(toDateInput(invoice.invoiceDate))
  const [dueDate, setDueDate] = useState(toDateInput(invoice.dueDate))
  const [subtotal, setSubtotal] = useState(invoice.subtotal || '')
  const [taxAmount, setTaxAmount] = useState(invoice.taxAmount || '')
  const [totalAmount, setTotalAmount] = useState(invoice.totalAmount || '')
  const [currency, setCurrency] = useState(invoice.currency || 'CAD')
  const [poNumber, setPoNumber] = useState(invoice.poNumber || '')
  const [jobReference, setJobReference] = useState(invoice.jobReference || '')
  const [paymentTerms, setPaymentTerms] = useState(invoice.paymentTerms || '')
  const [notes, setNotes] = useState(invoice.notes || '')
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setVendorName(invoice.vendorName || '')
    setInvoiceNumber(invoice.invoiceNumber || '')
    setInvoiceDate(toDateInput(invoice.invoiceDate))
    setDueDate(toDateInput(invoice.dueDate))
    setSubtotal(invoice.subtotal || '')
    setTaxAmount(invoice.taxAmount || '')
    setTotalAmount(invoice.totalAmount || '')
    setCurrency(invoice.currency || 'CAD')
    setPoNumber(invoice.poNumber || '')
    setJobReference(invoice.jobReference || '')
    setPaymentTerms(invoice.paymentTerms || '')
    setNotes(invoice.notes || '')
  }, [invoice])

  function applyInvoice(data: IncomingInvoiceDetail) {
    onUpdated(data)
    setVendorName(data.vendorName || '')
    setInvoiceNumber(data.invoiceNumber || '')
    setInvoiceDate(toDateInput(data.invoiceDate))
    setDueDate(toDateInput(data.dueDate))
    setSubtotal(data.subtotal || '')
    setTaxAmount(data.taxAmount || '')
    setTotalAmount(data.totalAmount || '')
    setCurrency(data.currency || 'CAD')
    setPoNumber(data.poNumber || '')
    setJobReference(data.jobReference || '')
    setPaymentTerms(data.paymentTerms || '')
    setNotes(data.notes || '')
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const updated = await updateIncomingInvoice(invoice.id, {
        vendorName: vendorName.trim() || null,
        invoiceNumber: invoiceNumber.trim() || null,
        invoiceDate: invoiceDate || null,
        dueDate: dueDate || null,
        subtotal: subtotal.trim() ? Number(subtotal) : null,
        taxAmount: taxAmount.trim() ? Number(taxAmount) : null,
        totalAmount: totalAmount.trim() ? Number(totalAmount) : null,
        currency: currency.trim() || 'CAD',
        poNumber: poNumber.trim() || null,
        jobReference: jobReference.trim() || null,
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
      const updated = await rescanIncomingInvoiceFromPdf(invoice.id)
      applyInvoice(updated)
      setMessage('PDF scanned — fields updated from AI.')
    } catch (err: unknown) {
      setError(formatAxiosError(err))
    } finally {
      setScanning(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={scanning || !invoice.attachments.length}
          onClick={() => void handleRescan()}
        >
          {scanning ? 'Scanning PDF…' : 'Scan PDF with AI'}
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
      {message && <p className="text-sm text-neutral-600 dark:text-neutral-300">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">Vendor</span>
          <Input className="mt-1" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="text-xs uppercase tracking-wide text-neutral-600 dark:text-neutral-300">Invoice #</span>
          <Input className="mt-1" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="text-xs uppercase tracking-wide text-neutral-600 dark:text-neutral-300">Invoice date</span>
          <Input className="mt-1" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="text-xs uppercase tracking-wide text-neutral-600 dark:text-neutral-300">Due date</span>
          <Input className="mt-1" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="text-xs uppercase tracking-wide text-neutral-600 dark:text-neutral-300">Subtotal</span>
          <Input className="mt-1" inputMode="decimal" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="text-xs uppercase tracking-wide text-neutral-600 dark:text-neutral-300">Tax</span>
          <Input className="mt-1" inputMode="decimal" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="text-xs uppercase tracking-wide text-neutral-600 dark:text-neutral-300">Total</span>
          <Input className="mt-1" inputMode="decimal" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="text-xs uppercase tracking-wide text-neutral-600 dark:text-neutral-300">Currency</span>
          <Input className="mt-1" value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="text-xs uppercase tracking-wide text-neutral-600 dark:text-neutral-300">PO #</span>
          <Input className="mt-1" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="text-xs uppercase tracking-wide text-neutral-600 dark:text-neutral-300">Job reference</span>
          <Input className="mt-1" value={jobReference} onChange={(e) => setJobReference(e.target.value)} />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-xs uppercase tracking-wide text-neutral-600 dark:text-neutral-300">Payment terms</span>
          <Input className="mt-1" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-xs uppercase tracking-wide text-neutral-600 dark:text-neutral-300">Notes</span>
        <textarea
          className="mt-1 min-h-[120px] w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Internal notes, approval comments, or payment instructions…"
        />
      </label>
    </form>
  )
}
