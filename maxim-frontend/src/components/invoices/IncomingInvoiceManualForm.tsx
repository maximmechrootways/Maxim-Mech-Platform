import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { createManualIncomingInvoice } from '@/api/incomingInvoices'

type Props = {
  onCreated: () => void
  onCancel: () => void
}

export function IncomingInvoiceManualForm({ onCreated, onCancel }: Props) {
  const [vendorName, setVendorName] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [currency, setCurrency] = useState('CAD')
  const [poNumber, setPoNumber] = useState('')
  const [jobReference, setJobReference] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBodyText, setEmailBodyText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!vendorName.trim()) {
      setError('Vendor name is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createManualIncomingInvoice({
        vendorName: vendorName.trim(),
        invoiceNumber: invoiceNumber.trim() || undefined,
        invoiceDate: invoiceDate || undefined,
        dueDate: dueDate || undefined,
        totalAmount: totalAmount.trim() ? Number(totalAmount) : undefined,
        currency: currency.trim() || 'CAD',
        poNumber: poNumber.trim() || undefined,
        jobReference: jobReference.trim() || undefined,
        paymentTerms: paymentTerms.trim() || undefined,
        emailSubject: emailSubject.trim() || undefined,
        emailBodyText: emailBodyText.trim() || undefined,
        file: file || undefined,
      })
      onCreated()
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Could not save invoice.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardDescription>Add invoice manually</CardDescription>
        <form className="mt-4 space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Vendor *</span>
              <Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} required />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Invoice #</span>
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Invoice date</span>
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Due date</span>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Total amount</span>
              <Input type="number" step="0.01" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Currency</span>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">PO #</span>
              <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Job reference</span>
              <Input value={jobReference} onChange={(e) => setJobReference(e.target.value)} />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Subject</span>
            <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Notes</span>
            <textarea
              value={emailBodyText}
              onChange={(e) => setEmailBodyText(e.target.value)}
              className="min-h-[96px] w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">PDF attachment (optional)</span>
            <Input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save invoice'}</Button>
            <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
          </div>
        </form>
      </CardHeader>
    </Card>
  )
}
