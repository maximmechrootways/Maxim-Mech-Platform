import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useUser } from '@/contexts/UserContext'
import { Card, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { listJobs, listJobAssignments } from '@/api/jobs'
import type { Job, JobAssignment } from '@/types'

export function MyJobs() {
  const { user } = useUser()
  const [jobs, setJobs] = useState<Job[]>([])
  const [assignments, setAssignments] = useState<JobAssignment[]>([])
  useEffect(() => { listJobs().then(setJobs) }, [])
  useEffect(() => { listJobAssignments().then(setAssignments) }, [])
  const myJobs = jobs.filter((j) => j.assignedSupervisorIds?.includes(user?.id ?? ''))
  const getLabourerCount = (jobId: string) => assignments.filter((a) => a.jobId === jobId).length

  if (user?.role !== 'supervisor') return null

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">My jobs</h1>
        <p className="text-neutral-500 dark:text-neutral-400 mt-1">Jobs you supervise. Assign labourers and manage daily check-in.</p>
      </div>

      {myJobs.length === 0 ? (
        <Card padding="lg">
          <CardDescription>No jobs assigned to you yet. Ask Owner or HR to assign you to a job from Job management.</CardDescription>
        </Card>
      ) : (
        <ul className="space-y-3">
          {myJobs.map((job) => (
            <li key={job.id}>
              <Card padding="md" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="font-medium text-neutral-900 dark:text-white">{job.title}</p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">{job.siteName} · {getLabourerCount(job.id)} labourer(s)</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={job.status === 'active' ? 'success' : 'default'}>{job.status}</Badge>
                  <Link to={`/jobs/${job.id}`}><Button size="sm">Manage & check-in</Button></Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
