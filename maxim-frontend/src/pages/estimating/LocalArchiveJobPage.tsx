import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { formatAxiosError } from '@/api'
import { LocalArchiveBrowser } from '@/components/files/LocalArchiveBrowser'
import { fetchJobDetail } from '@/api/jobs'
import { fetchLocalProjectsForJob, type LocalTreeProject } from '@/api/localDocuments'

export function LocalArchiveJobPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const location = useLocation()
  const [job, setJob] = useState<{ title: string; siteName: string } | null>(null)
  const [projects, setProjects] = useState<LocalTreeProject[]>([])
  const [loading, setLoading] = useState(true)
  const [jobError, setJobError] = useState<string | null>(null)
  const [archiveError, setArchiveError] = useState<string | null>(null)

  const isPast = location.pathname.includes('/past-project-directory/')
  const backPath = isPast
    ? `/estimating/past-project-directory/job/${jobId}`
    : `/estimating/current-projects/${jobId}`

  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    setLoading(true)
    setJobError(null)
    setArchiveError(null)

    // Load job and GX10 archive separately — GX10 outages must not blank the whole page.
    ;(async () => {
      try {
        const j = await fetchJobDetail(jobId)
        if (cancelled) return
        setJob({ title: j.title, siteName: j.siteName || '' })
      } catch (e: unknown) {
        if (!cancelled) setJobError(formatAxiosError(e) || 'Could not load this job.')
      }

      try {
        const tree = await fetchLocalProjectsForJob(jobId)
        if (cancelled) return
        setProjects(tree)
        setArchiveError(null)
      } catch (e: unknown) {
        if (cancelled) return
        setProjects([])
        setArchiveError(
          formatAxiosError(e) ||
            'Could not reach the Local Archive (GX10). Check that the on-prem server is online and configured.'
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [jobId])

  const reload = () => {
    if (!jobId) return
    setLoading(true)
    setArchiveError(null)
    fetchLocalProjectsForJob(jobId)
      .then((tree) => {
        setProjects(tree)
        setArchiveError(null)
      })
      .catch((e: unknown) => {
        setProjects([])
        setArchiveError(
          formatAxiosError(e) ||
            'Could not reach the Local Archive (GX10). Check that the on-prem server is online and configured.'
        )
      })
      .finally(() => setLoading(false))
  }

  if (jobError) {
    return (
      <div className="space-y-4 max-w-5xl animate-fade-in">
        <Link to={backPath} className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
          ← Project folders
        </Link>
        <p className="text-sm text-red-600 dark:text-red-400">{jobError}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl animate-fade-in">
      <Link to={backPath} className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
        ← Project folders
      </Link>
      <div>
        <h1 className="font-display text-2xl font-semibold text-neutral-900 dark:text-white tracking-tight">
          Local Archive
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
          {job ? `${job.siteName} · ${job.title}` : 'GX10 files matched to this job'}
        </p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2 max-w-2xl">
          This is the on-prem GX10 USB / field upload store (Local Archive), not the cloud Project Documents folders
          above. Files appear here when a USB folder name matches this job or site.
        </p>
      </div>
      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : archiveError ? (
        <div className="space-y-3 rounded-xl border border-amber-300/70 dark:border-amber-700/50 bg-amber-50/70 dark:bg-amber-950/20 px-4 py-4">
          <p className="text-sm text-amber-950 dark:text-amber-100">{archiveError}</p>
          <button
            type="button"
            onClick={reload}
            className="text-sm font-medium text-brand-700 dark:text-brand-300 hover:underline"
          >
            Try again
          </button>
        </div>
      ) : (
        <LocalArchiveBrowser
          projects={projects}
          emptyMessage="No GX10 files matched this job yet. Upload a USB folder named like the job or site on the burner laptop."
          onChanged={reload}
        />
      )}
    </div>
  )
}
