import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { fetchJobs, type JobListItem } from '@/api/jobs'

export function CurrentProjectsDirectory() {
  const [jobs, setJobs] = useState<JobListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchJobs({ status: 'active' })
      .then((rows) => {
        if (!cancelled) setJobs(rows)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load active jobs.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6 max-w-5xl animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-semibold text-neutral-900 dark:text-white tracking-tight">
          Current Projects
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
          Each active job site has its own separate project folders for drawings and PDFs.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/sites">
            <Button variant="outline" size="sm">
              Go to Job Management
            </Button>
          </Link>
          <Link to="/estimating/past-project-directory">
            <Button variant="secondary" size="sm">
              Go to Past Project Directory
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading current projects…</p>
      ) : error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : jobs.length === 0 ? (
        <Card padding="lg" className="text-sm text-neutral-500">
          No active jobs right now. Create one in Job Management.
        </Card>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => (
            <li key={job.id}>
              <Link to={`/estimating/current-projects/${job.id}`}>
                <Card hover padding="md" className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-white">{job.siteName}</p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">{job.title}</p>
                  </div>
                  <span className="text-sm text-brand-600 dark:text-brand-400">Open folders</span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
