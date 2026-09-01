import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/Button'
import { formatAxiosError } from '@/api'
import { useAuth } from '@/contexts/AuthContext'
import { IncomingInvoiceEditForm } from '@/components/invoices/IncomingInvoiceEditForm'
import { fetchIncomingInvoiceDetail, type IncomingInvoiceDetail } from '@/api/incomingInvoices'

type Props = {
  invoiceId: string
  title?: string
  onClose: () => void
  onSaved: (invoice: IncomingInvoiceDetail) => void
}

export function IncomingInvoiceEditModal({ invoiceId, title, onClose, onSaved }: Props) {
  const { authReady } = useAuth()
  const [invoice, setInvoice] = useState<IncomingInvoiceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!authReady) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchIncomingInvoiceDetail(invoiceId)
      .then((data) => { if (!cancelled) setInvoice(data) })
      .catch((e: unknown) => {
        if (!cancelled) setError(formatAxiosError(e))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [authReady, invoiceId])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prev
    }
  }, [onClose])

  function handleUpdated(updated: IncomingInvoiceDetail) {
    setInvoice(updated)
    onSaved(updated)
  }

  return createPortal(
    <>
      {/* Backdrop — own layer so dimming always renders */}
      <div
        className="fixed inset-0 z-[9998]"
        style={{ backgroundColor: 'rgba(2, 6, 23, 0.88)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
        onClick={onClose}
        aria-hidden
      />

      {/* Dialog */}
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 pointer-events-none"
        role="dialog"
        aria-modal="true"
        aria-label="Edit invoice"
      >
        <div
          className="pointer-events-auto flex w-full max-w-4xl max-h-[min(92vh,920px)] flex-col overflow-hidden rounded-2xl border-2 border-neutral-300 bg-white shadow-2xl dark:border-neutral-500 dark:bg-neutral-900"
          style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.55)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-200 bg-neutral-50 px-6 py-4 dark:border-neutral-700 dark:bg-neutral-800">
            <div>
              <h2 className="font-display text-xl font-semibold text-neutral-900 dark:text-white">
                {title || 'Edit invoice'}
              </h2>
              <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-300">
                Update fields, add notes, or scan the PDF with AI.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="touch-target rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-900 dark:hover:bg-neutral-700 dark:hover:text-white"
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-white px-6 py-5 dark:bg-neutral-900">
            {loading && <p className="text-neutral-600 dark:text-neutral-300">Loading…</p>}
            {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
            {!loading && !error && invoice && (
              <IncomingInvoiceEditForm invoice={invoice} onUpdated={handleUpdated} />
            )}
          </div>

          <div className="flex shrink-0 justify-end border-t border-neutral-200 bg-neutral-50 px-6 py-3 dark:border-neutral-700 dark:bg-neutral-800">
            <Button type="button" variant="secondary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}

