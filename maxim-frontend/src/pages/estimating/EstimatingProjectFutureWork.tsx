import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ESTIMATION_FOLDER_SLUGS } from '@/estimating/estimationFolders'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { formatAxiosError } from '@/api'
import { fetchSites } from '@/api/jobs'
import { uploadEstimationProjectFile } from '@/api/estimationProjectFiles'
import type { EstimationFolderApi } from '@/estimating/estimationFolders'

function resetFileInput() {
  const input = document.getElementById('est-upload-file') as HTMLInputElement | null
  if (input) input.value = ''
}

export function EstimatingProjectFutureWork() {
  const [sites, setSites] = useState<{ id: string; name: string }[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [name, setName] = useState('')
  const [folder, setFolder] = useState<EstimationFolderApi>('TENDER_DRAWINGS')
  const [siteId, setSiteId] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchSites(true)
      .then((rows) => {
        if (!cancelled) setSites(rows.map((s) => ({ id: s.id, name: s.name })))
      })
      .catch(() => {
        if (!cancelled) setSites([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const topRow = ESTIMATION_FOLDER_SLUGS.slice(0, 3)
  const bottomRow = ESTIMATION_FOLDER_SLUGS.slice(3, 6)

  const clearForm = () => {
    setName('')
    setFolder('TENDER_DRAWINGS')
    setSiteId('')
    setNotes('')
    setFile(null)
    resetFileInput()
    setError(null)
  }

  const closeForm = () => {
    setShowAddForm(false)
    clearForm()
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
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
        siteId: siteId || null,
        notes: notes.trim() || null,
      })
      setMessage('File saved.')
      setShowAddForm(false)
      clearForm()
    } catch (err: unknown) {
      setError(formatAxiosError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8 max-w-5xl animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-neutral-900 dark:text-white tracking-tight">
            Estimating Project Future Work
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            Organize tender and pricing documents into folders. Open a folder to review files, or add a new file here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {!showAddForm && (
            <Button type="button" onClick={() => { setShowAddForm(true); setMessage(null); setError(null) }}>
              Add new file
            </Button>
          )}
        </div>
      </div>

      {showAddForm && (
        <Card padding="lg">
          <CardHeader>Add file</CardHeader>
          <CardDescription>
            PDFs are typical; you can also store images, spreadsheets, Word documents, CSV, text, or ZIP archives (by file extension).
            Optional notes are stored with the file for context (scope, assumptions, revision info, etc.).
          </CardDescription>
          <form onSubmit={submit} className="mt-6 space-y-4 max-w-xl">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main tender — structural" required />
            <div>
              <label htmlFor="est-folder" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                Folder
              </label>
              <select
                id="est-folder"
                value={folder}
                onChange={(e) => setFolder(e.target.value as EstimationFolderApi)}
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white"
              >
                {ESTIMATION_FOLDER_SLUGS.map((f) => (
                  <option key={f.api} value={f.api}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="est-site" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                Job site (optional)
              </label>
              <select
                id="est-site"
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white"
              >
                <option value="">— None —</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <Textarea
              label="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Pricing valid until March 15; excludes steel escalation clause."
              rows={4}
              className="min-h-[88px]"
            />
            <div>
              <label htmlFor="est-upload-file" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                File
              </label>
              <input
                id="est-upload-file"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-neutral-600 dark:text-neutral-400 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
              />
              {file && <p className="text-xs text-neutral-500 mt-1">{file.name}</p>}
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            {message && <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button type="button" variant="secondary" disabled={saving} onClick={closeForm}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {message && !showAddForm && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>
      )}

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3">
          Folders
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {topRow.map((f) => (
            <Link
              key={f.slug}
              to={`/estimating/project-future-work/${f.slug}`}
              className="flex items-center justify-center rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/60 px-4 py-6 text-center text-sm font-medium text-neutral-800 dark:text-neutral-100 shadow-sm hover:border-brand-400 hover:bg-brand-50/60 dark:hover:bg-brand-950/30 transition-colors"
            >
              {f.label}
            </Link>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          {bottomRow.map((f) => (
            <Link
              key={f.slug}
              to={`/estimating/project-future-work/${f.slug}`}
              className="flex items-center justify-center rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/60 px-4 py-6 text-center text-sm font-medium text-neutral-800 dark:text-neutral-100 shadow-sm hover:border-brand-400 hover:bg-brand-50/60 dark:hover:bg-brand-950/30 transition-colors"
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
