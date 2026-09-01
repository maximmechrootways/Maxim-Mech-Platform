import { useEffect, useState } from 'react'
import { fetchFileBlob } from '../api'

export function ViewerScreen({
  doc,
}: {
  doc: { id: string; name: string; contentType?: string | null } | null
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [kind, setKind] = useState<'pdf' | 'image' | 'other'>('other')

  useEffect(() => {
    if (!doc) return
    let objectUrl: string | null = null
    setError('')
    setUrl(null)
    const isPdf = (doc.contentType || '').includes('pdf') || /\.pdf$/i.test(doc.name)
    const isImage = (doc.contentType || '').startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(doc.name)
    setKind(isPdf ? 'pdf' : isImage ? 'image' : 'other')
    fetchFileBlob(doc.id)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [doc])

  if (!doc) {
    return (
      <div className="hero">
        <h1>Viewer</h1>
        <p>Open a file from the Library tab to preview it here.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="hero">
        <h1>{doc.name}</h1>
        <p className="muted">Local archive preview · PDFs and images render here; other types download from maximmech.com</p>
      </div>
      {error && <p className="warn">{error}</p>}
      {!error && !url && <p className="muted">Loading…</p>}
      {url && kind === 'pdf' && <iframe className="viewer-frame" title={doc.name} src={url} />}
      {url && kind === 'image' && (
        <div className="panel" style={{ textAlign: 'center' }}>
          <img src={url} alt={doc.name} style={{ maxWidth: '100%', maxHeight: '70vh' }} />
        </div>
      )}
      {url && kind === 'other' && (
        <div className="panel">
          <p>No in-app preview for this type.</p>
          <a className="cta" href={url} download={doc.name} style={{ display: 'inline-flex', marginTop: '0.75rem', textDecoration: 'none' }}>
            Download
          </a>
        </div>
      )}
    </div>
  )
}
