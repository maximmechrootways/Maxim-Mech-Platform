import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { fetchOutgoingInvoiceAttachmentBlob } from '@/api/outgoingInvoices'
import { formatAxiosError, getAuthToken } from '@/api'
import { useAuth } from '@/contexts/AuthContext'
import { downloadBlob } from '@/utils/fileActions'

type Props = {
  invoiceId: string
  attachmentId: string
  fileName: string
  size?: 'sm' | 'md' | 'lg'
  prefetch?: boolean
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function OutgoingInvoiceAttachmentActions({
  invoiceId,
  attachmentId,
  fileName,
  size = 'sm',
  prefetch = false,
}: Props) {
  const { authReady } = useAuth()
  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  const revokeObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [])

  const loadAttachment = useCallback(async () => {
    if (fileDataUrl) return fileDataUrl
    setLoading(true)
    setError(null)
    try {
      if (!getAuthToken()) {
        throw new Error('Your session expired. Please sign in again.')
      }
      revokeObjectUrl()
      const blob = await fetchOutgoingInvoiceAttachmentBlob(invoiceId, attachmentId)
      const objectUrl = URL.createObjectURL(blob)
      objectUrlRef.current = objectUrl
      setFileDataUrl(objectUrl)
      return objectUrl
    } catch (e: unknown) {
      const message = formatAxiosError(e)
      setError(message)
      setFileDataUrl(null)
      throw e
    } finally {
      setLoading(false)
    }
  }, [attachmentId, fileDataUrl, invoiceId, revokeObjectUrl])

  useEffect(() => {
    if (!prefetch || !authReady) return
    void loadAttachment().catch(() => undefined)
  }, [authReady, loadAttachment, prefetch])

  useEffect(() => () => revokeObjectUrl(), [revokeObjectUrl])

  async function handleOpenInNewTab() {
    try {
      const url = await loadAttachment()
      const w = window.open('', '_blank')
      if (!w) return
      const title = fileName ? escapeHtml(fileName) : 'Invoice'
      const safeUrl = url.replace(/"/g, '&quot;')
      w.document.write(`
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"><title>${title}</title>
        <style>body{margin:0;height:100vh;display:flex;flex-direction:column;}
        .toolbar{padding:8px 12px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;}
        iframe{flex:1;width:100%;border:none;}
        </style></head>
        <body>
          <div class="toolbar"><span>${title}</span></div>
          <iframe src="${safeUrl}" title="${title}"></iframe>
        </body></html>
      `)
      w.document.close()
    } catch {
      /* error set in loadAttachment */
    }
  }

  async function handleDownload() {
    try {
      const url = await loadAttachment()
      const res = await fetch(url)
      const blob = await res.blob()
      downloadBlob(blob, fileName || 'invoice.pdf')
    } catch (e: unknown) {
      setError(formatAxiosError(e))
    }
  }

  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-red-600">{error}</span>
        <Button type="button" variant="outline" size={size} onClick={() => void loadAttachment()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size={size} disabled={loading} onClick={() => void handleOpenInNewTab()}>
        {loading ? 'Loading…' : 'Open'}
      </Button>
      <Button type="button" variant="outline" size={size} disabled={loading} onClick={() => void handleDownload()}>
        Download
      </Button>
    </div>
  )
}
