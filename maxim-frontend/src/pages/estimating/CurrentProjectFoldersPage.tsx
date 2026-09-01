import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription, CardHeader } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { formatAxiosError } from '@/api'
import { fetchJobDetail } from '@/api/jobs'
import { uploadEstimationProjectFile } from '@/api/estimationProjectFiles'
import { fetchLocalProjectsForJob } from '@/api/localDocuments'
import { PAST_PROJECT_FOLDER_SLUGS } from '@/estimating/pastProjectFolders'
import type { PastProjectFolderApi } from '@/estimating/pastProjectFolders'

function resetFileInput() {
  const input = document.getElementById('cpd-upload-file') as HTMLInputElement | null
  if (input) input.value = ''
}

export function CurrentProjectFoldersPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [job, setJob] = useState<{ id: string; title: string; siteId: string; siteName: string; status: string } | null>(null)
  const [name, setName] = useState('')
  const [folder, setFolder] = useState<PastProjectFolderApi>('AS_BUILT_TENDER_DRAWINGS')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [localFileCount, setLocalFileCount] = useState(0)

  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      fetchJobDetail(jobId),
      fetchLocalProjectsForJob(jobId).catch(() => []),
    ])
      .then(([row, localProjects]) => {
        if (cancelled) return
        setJob(row)
        setLocalFileCount(localProjects.reduce((n, p) => n + p.fileCount, 0))
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this project.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [jobId])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!job?.siteId) return
    setError(null)
    setMessage(null)
    if (!name.trim()) {
      setError('Enter a name for this file.')
      return
    }
    if (!file) {
      setError('Choose a file to upload.')
      return
    }
    setSaving(true)
    try {
      await uploadEstimationProjectFile({
        file,
        folder,
        name: name.trim(),
        siteId: job.siteId,
        notes: notes.trim() || null,
      })
      setName('')
      setFolder('AS_BUILT_TENDER_DRAWINGS')
      setNotes('')
      setFile(null)
      resetFileInput()
      setMessage('File saved to this project.')
    } catch (err: unknown) {
      setError(formatAxiosError(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-neutral-500">Loading project…</p>
  if (!job || error) return <p className="text-sm text-red-600 dark:text-red-400">{error || 'Project not found.'}</p>
  const isPastContext = location.pathname.startsWith('/estimating/past-project-directory/job/')
  const basePath = isPastContext ? `/estimating/past-project-directory/job/${job.id}` : `/estimating/current-projects/${job.id}`

  return (
    <div className="space-y-8 max-w-5xl animate-fade-in">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link to={isPastContext ? '/estimating/past-project-directory' : '/estimating/current-projects'} className="text-brand-600 dark:text-brand-400 hover:underline">
          ← {isPastContext ? 'Past Project Directory' : 'Current Projects'}
        </Link>
        <Link to="/sites" className="text-brand-600 dark:text-brand-400 hover:underline">
          Job Management
        </Link>
      </div>

      <div>
        <h1 className="font-display text-2xl font-semibold text-neutral-900 dark:text-white tracking-tight">{job.siteName}</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
          {job.title} · {job.status}
        </p>
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3">Project folders</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PAST_PROJECT_FOLDER_SLUGS.map((f) => (
            <Link
              key={f.slug}
              to={`${basePath}/${f.slug}`}
              className="flex items-center justify-center rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/60 px-4 py-6 text-center text-sm font-medium text-neutral-800 dark:text-neutral-100 shadow-sm hover:border-brand-400 hover:bg-brand-50/60 dark:hover:bg-brand-950/30 transition-colors"
            >
              {f.label}
            </Link>
          ))}
          <Link
            to={`${basePath}/local-archive`}
            className="flex flex-col items-center justify-center gap-1 rounded-xl border border-amber-300/70 dark:border-amber-700/50 bg-amber-50/70 dark:bg-amber-950/20 px-4 py-6 text-center text-sm font-medium text-amber-950 dark:text-amber-100 shadow-sm hover:border-amber-500 transition-colors"
          >
            <span>Local Archive</span>
            <span className="text-xs font-normal text-amber-800/80 dark:text-amber-200/80">
              {localFileCount > 0 ? `${localFileCount} file${localFileCount === 1 ? '' : 's'} on GX10` : 'GX10 USB uploads'}
            </span>
          </Link>
        </div>
      </div>

      <Card padding="lg">
        <CardHeader>Add file to this job site</CardHeader>
        <CardDescription>Uploaded files stay separated by this specific job site and folder.</CardDescription>
        <form onSubmit={submit} className="mt-6 space-y-4 max-w-xl">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <div>
            <label htmlFor="cpd-folder" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
              Folder
            </label>
            <select
              id="cpd-folder"
              value={folder}
              onChange={(e) => setFolder(e.target.value as PastProjectFolderApi)}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white"
            >
              {PAST_PROJECT_FOLDER_SLUGS.map((f) => (
                <option key={f.api} value={f.api}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
          <div>
            <label htmlFor="cpd-upload-file" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
              File
            </label>
            <input
              id="cpd-upload-file"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-neutral-600 dark:text-neutral-400 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
            />
            {file && <p className="text-xs text-neutral-500 mt-1">{file.name}</p>}
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {message && <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
