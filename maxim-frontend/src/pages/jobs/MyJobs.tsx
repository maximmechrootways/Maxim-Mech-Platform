import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useUser } from '@/contexts/UserContext'
import { Card, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { fetchMyJobs } from '@/api/jobs'

export function MyJobs() {
  const { user } = useUser()
  const [jobs, setJobs] = useState<{ id: string; title: string; siteName: string; status: string; progressStage?: string; labourerCount: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user?.role !== 'supervisor') {
      setLoading(false)
      return
    }
    fetchMyJobs()
      .then(setJobs)
      .catch(() => setJobs([]))
      .finally(() => setLoading(false))
  }, [user?.role])

  if (user?.role !== 'supervisor') return null

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <p className="text-neutral-500 dark:text-neutral-400">Loading…</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">My Jobs</h1>
        <p className="text-neutral-500 dark:text-neutral-400 mt-1">Jobs you supervise. Assign labourers and manage daily check-in.</p>
      </div>

      {jobs.length === 0 ? (
        <Card padding="lg">
          <CardDescription>No jobs assigned to you yet. Ask Owner or HR to assign you to a job from Job Management.</CardDescription>
        </Card>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => (
            <li key={job.id}>
              <Card padding="md" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="font-medium text-neutral-900 dark:text-white">{job.title}</p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">{job.siteName} · {job.labourerCount} labourer(s)</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={job.status === 'active' ? 'success' : 'default'}>{job.status}</Badge>
                  <Link to={`/jobs/${job.id}`}><Button size="sm">Manage & Check-in</Button></Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
