import { useState, useEffect, useRef } from 'react'
import { fetchPdfBlob } from '@/api/library'
import { pdfDataUrlToImageDataUrls } from '@/utils/pdfToImages'

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

interface PdfPageRendererProps {
  /** Backend file path (e.g. "template-123.pdf") — PDF is fetched via API with auth */
  filePath?: string
  /** Full URL to PDF (e.g. when uploads are public). If set, filePath is ignored. */
  pdfUrl?: string
  pageNumber: number
  scale?: number
  onPageSize?: (width: number, height: number) => void
  className?: string
}

export default function PdfPageRenderer({
  filePath,
  pdfUrl,
  pageNumber,
  scale = 2,
  onPageSize,
  className = '',
}: PdfPageRendererProps) {
  const [pageImageUrl, setPageImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (!filePath && !pdfUrl) {
      setLoading(false)
      setError('No filePath or pdfUrl')
      return
    }
    setLoading(true)
    setError(null)
    setPageImageUrl(null)

    const load = async () => {
      try {
        let dataUrl: string
        if (pdfUrl) {
          const res = await fetch(pdfUrl, { credentials: 'include' })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const blob = await res.blob()
          dataUrl = await blobToDataUrl(blob)
        } else if (filePath) {
          const blob = await fetchPdfBlob(filePath)
          dataUrl = await blobToDataUrl(blob)
        } else {
          return
        }
        const urls = await pdfDataUrlToImageDataUrls(dataUrl)
        const pageIndex = Math.max(0, Math.min((pageNumber || 1) - 1, urls.length - 1))
        setPageImageUrl(urls[pageIndex] ?? null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load PDF')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [filePath, pdfUrl, pageNumber])

  useEffect(() => {
    if (!onPageSize || !pageImageUrl || !imgRef.current) return
    const img = imgRef.current
    if (img.naturalWidth && img.naturalHeight) {
      onPageSize(img.naturalWidth, img.naturalHeight)
    }
    const onLoad = () => {
      if (img.naturalWidth && img.naturalHeight) onPageSize(img.naturalWidth, img.naturalHeight)
    }
    img.addEventListener('load', onLoad)
    return () => img.removeEventListener('load', onLoad)
  }, [onPageSize, pageImageUrl])

  if (loading) {
    return (
      <div className={`flex items-center justify-center min-h-[400px] bg-neutral-100 dark:bg-neutral-800 rounded ${className}`}>
        <span className="text-neutral-500 dark:text-neutral-400">Loading PDF…</span>
      </div>
    )
  }
  if (error) {
    return (
      <div className={`flex items-center justify-center min-h-[200px] bg-neutral-100 dark:bg-neutral-800 rounded text-red-600 dark:text-red-400 ${className}`}>
        {error}
      </div>
    )
  }
  if (!pageImageUrl) {
    return (
      <div className={`flex items-center justify-center min-h-[200px] bg-neutral-100 dark:bg-neutral-800 rounded text-neutral-500 ${className}`}>
        No page
      </div>
    )
  }
  return (
    <img
      ref={imgRef}
      src={pageImageUrl}
      alt={`Page ${pageNumber}`}
      className={`max-w-full h-auto block ${className}`}
    />
  )
}
