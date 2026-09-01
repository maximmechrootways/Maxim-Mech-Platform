/** Open a blob in a new tab for quick preview. */
export function quickViewBlob(blob: Blob) {
  const objectUrl = URL.createObjectURL(blob)
  window.open(objectUrl, '_blank', 'noopener,noreferrer')
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
}

/** Trigger browser download for a blob using a suggested filename. */
export function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = fileName || 'download'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
}

/** Download a remote URL as a local file. */
export async function downloadFromUrl(url: string, fileName: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Could not download file')
  const blob = await res.blob()
  downloadBlob(blob, fileName)
}
