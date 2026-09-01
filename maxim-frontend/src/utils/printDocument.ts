/** True when printing the live document is more reliable than react-to-print's iframe (iOS/mobile). */
export function prefersDocumentPrint(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isIOS =
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isAndroid = /Android/i.test(ua)
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  return isIOS || (isAndroid && coarsePointer) || (coarsePointer && window.innerWidth < 1024)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Safari often skips loading images inside display:none; warm the cache before print. */
export function preloadImageDataUrls(urls: string[]): void {
  void preloadImageDataUrlsAsync(urls)
}

export function preloadImageDataUrlsAsync(urls: string[]): Promise<void> {
  const unique = [...new Set(urls.filter(Boolean))]
  if (unique.length === 0) return Promise.resolve()

  return Promise.all(
    unique.map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image()
          img.onload = () => resolve()
          img.onerror = () => resolve()
          img.src = src
        })
    )
  ).then(() => undefined)
}

/** Wait for every image in a subtree (PDF pages, signatures, logos). */
export function waitForAllImagesIn(root: HTMLElement, timeoutMs = 15000): Promise<void> {
  const imgs = Array.from(root.querySelectorAll<HTMLImageElement>('img'))
  if (imgs.length === 0) return Promise.resolve()

  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }

    let loaded = 0
    const onDone = () => {
      loaded += 1
      if (loaded >= imgs.length) finish()
    }

    imgs.forEach((img) => {
      if (img.complete && img.naturalWidth > 0) onDone()
      else {
        img.addEventListener('load', onDone, { once: true })
        img.addEventListener('error', onDone, { once: true })
      }
    })

    setTimeout(finish, timeoutMs)
  })
}

/** @deprecated Use waitForAllImagesIn */
export function waitForPdfPageImages(root: HTMLElement, timeoutMs = 12000): Promise<void> {
  return waitForAllImagesIn(root, timeoutMs)
}

function copyStylesIntoDocument(targetDoc: Document, includeAppStyles: boolean): void {
  if (!includeAppStyles) return

  document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((link) => {
    if (!link.href || link.disabled) return
    targetDoc.head.appendChild(link.cloneNode(true))
  })

  document.querySelectorAll<HTMLStyleElement>('style').forEach((style) => {
    const css = style.textContent?.trim()
    if (!css) return
    const el = targetDoc.createElement('style')
    el.textContent = css
    targetDoc.head.appendChild(el)
  })
}

const PRINT_IFRAME_STYLES = `
  @page { margin: 10mm; size: auto; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff !important;
    color: #111 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    font-family: system-ui, -apple-system, sans-serif;
    padding: 10mm;
  }
  .no-print { display: none !important; }
  .print-only { display: block !important; visibility: visible !important; opacity: 1 !important; }
  .print-only.print-flex-row {
    display: flex !important;
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 12px;
    margin-bottom: 16px;
  }
  #form-review-pdf-print-root {
    max-width: 100%;
    color: #111827 !important;
    background: #fff !important;
  }
  #form-review-pdf-print-root .dark\\:text-white,
  #form-review-pdf-print-root .text-neutral-900,
  #form-review-pdf-print-root h1,
  #form-review-pdf-print-root h2,
  #form-review-pdf-print-root h3,
  #form-review-pdf-print-root h4,
  #form-review-pdf-print-root p,
  #form-review-pdf-print-root li,
  #form-review-pdf-print-root td,
  #form-review-pdf-print-root th {
    color: #111827 !important;
  }
  #form-review-pdf-print-root div.rounded-2xl.border,
  #form-review-pdf-print-root .rounded-lg.border {
    background: #ffffff !important;
    border-color: #d1d5db !important;
  }
  #form-review-pdf-print-root table {
    min-width: 0 !important;
    width: 100% !important;
    table-layout: auto !important;
    font-size: 9.5pt !important;
  }
  #form-review-pdf-print-root thead,
  #form-review-pdf-print-root thead th {
    background: #f3f4f6 !important;
    color: #111827 !important;
  }
  #form-review-pdf-print-root tbody td {
    background: #ffffff !important;
  }
  #form-review-pdf-print-root .overflow-x-auto {
    overflow: visible !important;
  }
  #form-review-pdf-print-root [class*='backdrop-blur'] {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
  #form-review-pdf-print-root .shadow-lg,
  #form-review-pdf-print-root .shadow-soft,
  #form-review-pdf-print-root .shadow-md {
    box-shadow: none !important;
  }
  .form-review-pdf-print-page {
    display: block !important;
    width: 100%;
    position: relative;
    page-break-after: always;
    break-after: page;
    break-inside: avoid;
    page-break-inside: avoid;
    margin: 0 auto;
  }
  .form-review-pdf-print-page-last {
    page-break-after: auto;
    break-after: auto;
  }
  .form-review-pdf-print-page img.pdf-page-img {
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
    width: 100%;
    height: auto;
    max-width: 100%;
    position: relative;
    z-index: 0;
  }
  .form-review-pdf-print-page > .absolute {
    position: absolute;
    z-index: 1;
    pointer-events: none;
  }
  .form-review-pdf-print-page .absolute img {
    max-width: 100%;
    object-fit: contain;
  }
`

export type PrintElementViaIframeOptions = {
  /** Tailwind/layout styles for native custom forms. Off for scanned PDF pages (large images). */
  includeAppStyles?: boolean
  /** Re-assign page image sources in the iframe (avoids innerHTML truncation of huge data URLs). */
  pdfPageSources?: string[]
}

/**
 * Print a DOM subtree in a hidden iframe (reliable on iOS).
 * Uses DOM appendChild — NOT innerHTML/doc.write — so multi‑MB data URL images stay intact.
 */
export async function printElementViaIframe(
  element: HTMLElement,
  title: string,
  options: PrintElementViaIframeOptions = {}
): Promise<void> {
  const { includeAppStyles = false, pdfPageSources } = options

  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', title)
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.left = '0'
  iframe.style.top = '0'
  iframe.style.width = '1px'
  iframe.style.height = '1px'
  iframe.style.border = 'none'
  iframe.style.opacity = '0.01'
  iframe.style.pointerEvents = 'none'
  document.body.appendChild(iframe)

  const win = iframe.contentWindow
  const doc = win?.document
  if (!doc) {
    document.body.removeChild(iframe)
    return
  }

  doc.open()
  doc.write('<!DOCTYPE html><html lang="en"><head></head><body></body></html>')
  doc.close()

  doc.title = title

  const charset = doc.createElement('meta')
  charset.setAttribute('charset', 'utf-8')
  doc.head.appendChild(charset)

  copyStylesIntoDocument(doc, includeAppStyles)

  const printStyle = doc.createElement('style')
  printStyle.textContent = PRINT_IFRAME_STYLES
  doc.head.appendChild(printStyle)

  const clone = element.cloneNode(true) as HTMLElement
  clone.querySelectorAll('.no-print').forEach((node) => node.remove())
  doc.body.appendChild(clone)

  if (pdfPageSources?.length) {
    const pageImgs = doc.querySelectorAll<HTMLImageElement>('img.pdf-page-img')
    pdfPageSources.forEach((src, index) => {
      const img = pageImgs[index]
      if (!img || !src) return
      img.removeAttribute('src')
      img.src = src
    })
  } else {
    doc.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
      const src = img.getAttribute('src')
      if (!src) return
      img.removeAttribute('src')
      img.src = src
    })
  }

  await waitForAllImagesIn(doc.body)

  const pageImgs = doc.querySelectorAll<HTMLImageElement>('img.pdf-page-img')
  const anyPageBlank = pdfPageSources?.length
    ? Array.from(pageImgs).some((img) => !img.naturalWidth)
    : false
  if (anyPageBlank) {
    pdfPageSources!.forEach((src, index) => {
      const img = pageImgs[index]
      if (!img || !src) return
      img.src = src
    })
    await waitForAllImagesIn(doc.body)
  }

  try {
    win?.focus()
    win?.print()
  } catch {
    /* print may be blocked */
  }

  const cleanup = () => {
    if (iframe.parentNode) document.body.removeChild(iframe)
  }
  win?.addEventListener('afterprint', cleanup, { once: true })
  setTimeout(cleanup, 20000)
}
