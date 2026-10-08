import * as pdfjsLib from 'pdfjs-dist'
// Vite: resolve worker so it's copied to output and we get a valid URL
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

async function dataUrlToPdf(dataUrl: string) {
  const base64 = dataUrl.split(',')[1]
  if (!base64) return null
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const loadingTask = pdfjsLib.getDocument({ data: bytes })
  return loadingTask.promise
}

async function renderPage(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  scale: number
): Promise<string | null> {
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  await page.render({
    canvasContext: ctx,
    canvas,
    viewport,
    intent: 'print',
  }).promise
  return canvas.toDataURL('image/png')
}

/**
 * Renders each page of a PDF (given as a data URL) to PNG image data URLs.
 * Use these in print HTML so the PDF content actually prints.
 */
export async function pdfDataUrlToImageDataUrls(
  dataUrl: string,
  options?: { scale?: number }
): Promise<string[]> {
  const pdf = await dataUrlToPdf(dataUrl)
  if (!pdf) return []
  const scale = options?.scale ?? 2
  const out: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const url = await renderPage(pdf, i, scale)
    if (url) out.push(url)
  }
  return out
}

/**
 * Renders pages progressively: first page ASAP (lower scale), then remaining pages.
 * `onProgress` receives the images rendered so far; final call has `done: true`.
 */
export async function pdfDataUrlToImageDataUrlsProgressive(
  dataUrl: string,
  onProgress: (images: string[], meta: { done: boolean; pageCount: number }) => void,
  options?: { previewScale?: number; fullScale?: number; signal?: { cancelled: boolean } }
): Promise<string[]> {
  const pdf = await dataUrlToPdf(dataUrl)
  if (!pdf) {
    onProgress([], { done: true, pageCount: 0 })
    return []
  }
  if (options?.signal?.cancelled) return []

  const pageCount = pdf.numPages
  const previewScale = options?.previewScale ?? 1.25
  const fullScale = options?.fullScale ?? 2
  const out: string[] = []

  // First page at preview scale so the form appears quickly.
  const firstPreview = await renderPage(pdf, 1, previewScale)
  if (options?.signal?.cancelled) return []
  if (firstPreview) {
    out[0] = firstPreview
    onProgress([firstPreview], { done: pageCount <= 1, pageCount })
  }

  // Remaining pages (and upgrade page 1) at full scale.
  for (let i = 1; i <= pageCount; i++) {
    if (options?.signal?.cancelled) return out
    const url = await renderPage(pdf, i, fullScale)
    if (url) out[i - 1] = url
    // Emit only completed prefix so callers never receive empty slots.
    onProgress(out.slice(0, i), { done: i === pageCount, pageCount })
  }

  return out
}
