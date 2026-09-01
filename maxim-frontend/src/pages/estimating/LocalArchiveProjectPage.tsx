import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { LocalArchiveBrowser } from '@/components/files/LocalArchiveBrowser'
import { fetchLocalDocumentTree, type LocalTreeProject } from '@/api/localDocuments'

export function LocalArchiveProjectPage() {
  const navigate = useNavigate()
  const { projectName } = useParams<{ projectName: string }>()
  const decoded = projectName ? decodeURIComponent(projectName) : ''
  const [projects, setProjects] = useState<LocalTreeProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!decoded) return
    let cancelled = false
    setLoading(true)
    fetchLocalDocumentTree(decoded)
      .then((rows) => {
        if (!cancelled) setProjects(rows)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load local archive project.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [decoded])

  const reload = () => {
    if (!decoded) return
    setLoading(true)
    fetchLocalDocumentTree(decoded)
      .then((rows) => {
        setProjects(rows)
        if (rows.length === 0 || rows.every((p) => p.fileCount === 0)) {
          navigate('/estimating/local-archive', { replace: true })
        }
      })
      .catch(() => setError('Could not load local archive project.'))
      .finally(() => setLoading(false))
  }

  return (
    <div className="space-y-6 max-w-5xl animate-fade-in">
      <Link to="/estimating/local-archive" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
        ← Local Archive (Unlinked)
      </Link>
      <div>
        <h1 className="font-display text-2xl font-semibold text-neutral-900 dark:text-white tracking-tight">{decoded}</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
          Files stored on the GX10 that are not linked to an active Maxim job yet. Name the USB folder like the job/site to auto-link.
        </p>
      </div>
      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <LocalArchiveBrowser projects={projects} onChanged={reload} />
      )}
    </div>
  )
}
