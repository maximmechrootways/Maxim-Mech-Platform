import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { fetchSubcontractors } from '@/api/jobs'
import {
  listOfflineSubcontractorForms,
  uploadOfflineSubcontractorForm,
  deleteOfflineSubcontractorForm,
  quickViewOfflineForm,
  downloadOfflineForm,
  type OfflineSubcontractorFormRecord,
} from '@/api/offlineSubcontractorForms'

export function SubcontractorOfflineFormUploads() {
  const [rows, setRows] = useState<OfflineSubcontractorFormRecord[]>([])
  const [subcontractors, setSubcontractors] = useState<Array<{ id: string; companyName: string; status: string }>>([])
  const [selectedSubcontractorId, setSelectedSubcontractorId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileInputKey, setFileInputKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const list = await listOfflineSubcontractorForms()
      setRows(Array.isArray(list) ? list : [])
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load uploads.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    fetchSubcontractors()
      .then((list) => {
        const active = Array.isArray(list) ? list.filter((s) => String(s.status).toLowerCase() === 'active') : []
        setSubcontractors(active)
      })
      .catch(() => setSubcontractors([]))
  }, [])

  const toTitleCase = (value: string) =>
    value
      .toLowerCase()
      .replace(/\b\w/g, (match) => match.toUpperCase())

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !title.trim() || !selectedSubcontractorId) return
    setSaving(true)
    setError(null)
    try {
      const subcontractorName = subcontractors.find((s) => s.id === selectedSubcontractorId)?.companyName?.trim()
      if (!subcontractorName) {
        setError('Please select a subcontractor.')
        setSaving(false)
        return
      }
      const normalizedTitle = toTitleCase(title.trim())
      const finalTitle = `${subcontractorName} — ${normalizedTitle}`
      await uploadOfflineSubcontractorForm(finalTitle, file)
      setTitle('')
      setFile(null)
      setFileInputKey((k) => k + 1)
      await load()
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Upload failed.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this file from your records?')) return
    setDeletingId(id)
    setError(null)
    try {
      await deleteOfflineSubcontractorForm(id)
      setRows((prev) => prev.filter((r) => r.id !== id))
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Delete failed.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <Breadcrumbs
        items={[
          { label: 'Forms & Documents', to: '/library?from=forms' },
          { label: 'Subcontractor Form Uploads' },
        ]}
      />
      <div>
        <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">
          Subcontractor Form Uploads
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 max-w-2xl">
          Subcontractors do not have accounts here. Use this to store a digital copy of paper or email PDFs
          and photos (JPG, PNG) you receive from them. Give each file a clear title for search and records.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      <Card padding="lg">
        <CardHeader>Upload a file</CardHeader>
        <CardDescription>PDF, PNG, JPEG, WebP, or Word (max 50 MB).</CardDescription>
        <form onSubmit={handleUpload} className="mt-4 space-y-4">
          <div>
            <label htmlFor="offline-subcontractor-select" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Select subcontractor <span className="text-red-500">*</span>
            </label>
            <select
              id="offline-subcontractor-select"
              value={selectedSubcontractorId}
              onChange={(e) => setSelectedSubcontractorId(e.target.value)}
              className="w-full min-h-[42px] px-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
              required
            >
              <option value="">Select subcontractor</option>
              {subcontractors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.companyName}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(toTitleCase(e.target.value))}
            placeholder="e.g. ABC Plumbing — WSIB clearance Apr 2026"
            required
          />
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="offline-subcontractor-file" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">File</label>
              {file && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-red-200 text-red-700 dark:border-red-800 dark:text-red-400"
                  onClick={() => {
                    setFile(null)
                    setFileInputKey((k) => k + 1)
                  }}
                >
                  Remove file
                </Button>
              )}
            </div>
            <input
              id="offline-subcontractor-file"
              key={fileInputKey}
              type="file"
              className="mt-1.5 block w-full text-sm text-neutral-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/30 dark:file:text-brand-300 border border-slate-200 dark:border-slate-600 rounded-xl px-2 py-1.5"
              accept=".pdf,image/*,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400 truncate" title={file.name}>
                Selected: {file.name}
              </p>
            )}
          </div>
          <Button type="submit" variant="primary" disabled={saving || !selectedSubcontractorId || !title.trim() || !file}>
            {saving ? 'Uploading…' : 'Upload'}
          </Button>
        </form>
      </Card>

      <Card padding="lg">
        <CardHeader>Stored files</CardHeader>
        <CardDescription>Visible to owner, HR, and supervisors.</CardDescription>
        {loading ? (
          <p className="mt-4 text-sm text-neutral-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">No files uploaded yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-neutral-50/50 dark:bg-neutral-800/40"
              >
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900 dark:text-white truncate">{r.title}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {r.originalName} · {new Date(r.createdAt).toLocaleString()} · {r.uploadedByName}
                  </p>
                  {r.mimeType && (
                    <Badge variant="default" className="mt-1.5 text-[10px]">
                      {r.mimeType}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void quickViewOfflineForm(r.filePath)}
                  >
                    Quick view
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void downloadOfflineForm(r.filePath, r.originalName || 'document')}
                  >
                    Download
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-red-200 text-red-700 dark:border-red-800 dark:text-red-400"
                    disabled={deletingId === r.id}
                    aria-label={`Delete file: ${r.title}`}
                    onClick={() => void handleDelete(r.id)}
                  >
                    {deletingId === r.id ? '…' : 'Delete file'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-sm text-neutral-500">
        <Link to="/library?from=forms" className="text-brand-600 dark:text-brand-400 hover:underline">
          Back to Forms &amp; Documents
        </Link>
      </p>
    </div>
  )
}
