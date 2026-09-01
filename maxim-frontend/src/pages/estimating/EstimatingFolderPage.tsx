import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { folderFromSlug } from '@/estimating/estimationFolders'
import {
  deleteEstimationProjectFile,
  downloadEstimationProjectFile,
  fetchEstimationProjectFiles,
  openEstimationProjectFileInline,
  type EstimationProjectFileRow,
} from '@/api/estimationProjectFiles'
import { Button } from '@/components/ui/Button'
import { useUser } from '@/contexts/UserContext'

function formatSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function EstimatingFolderPage() {
  const { folderSlug } = useParams<{ folderSlug: string }>()
  const folderDef = folderFromSlug(folderSlug)
  const { user } = useUser()
  const [rows, setRows] = useState<EstimationProjectFileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const canDelete = user?.role === 'owner' || user?.role === 'hr'

  useEffect(() => {
    const def = folderFromSlug(folderSlug)
    if (!def) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    fetchEstimationProjectFiles({ folder: def.api })
      .then(setRows)
      .catch(() => setError('Could not load files.'))
      .finally(() => setLoading(false))
  }, [folderSlug])

  if (!folderDef) {
    return (
      <div className="max-w-lg">
        <p className="text-neutral-600 dark:text-neutral-400">Unknown folder.</p>
        <Link to="/estimating/project-future-work" className="text-sm text-brand-600 dark:text-brand-400 hover:underline mt-2 inline-block">
          ← Back
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl animate-fade-in">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/estimating/project-future-work" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
          ← Estimating Project Future Work
        </Link>
      </div>
      <div>
        <h1 className="font-display text-2xl font-semibold text-neutral-900 dark:text-white tracking-tight">{folderDef.label}</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">Files stored in this folder.</p>
      </div>

      {loading ? (
        <p className="text-neutral-500 text-sm">Loading…</p>
      ) : error ? (
        <p className="text-red-600 text-sm">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-neutral-500 text-sm border border-dashed border-neutral-300 dark:border-neutral-600 rounded-xl p-8 text-center">
          No files yet. Add one from the main Estimating Project Future Work page.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-700 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/40 overflow-hidden">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium text-neutral-900 dark:text-white truncate">{r.name}</p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {r.originalName} · {formatSize(r.sizeBytes)}
                  {r.site ? ` · ${r.site.name}` : ''}
                </p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {new Date(r.createdAt).toLocaleString()} · {r.uploadedBy.firstName} {r.uploadedBy.lastName}
                </p>
                {r.notes && (
                  <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-2 whitespace-pre-wrap border-l-2 border-brand-200 dark:border-brand-800 pl-3">
                    {r.notes}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <Button type="button" variant="outline" size="sm" onClick={() => void openEstimationProjectFileInline(r.id)}>
                  View
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void downloadEstimationProjectFile(r.id, r.originalName || r.name)}>
                  Download
                </Button>
                {canDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-600 dark:text-red-400"
                    onClick={() => {
                      if (!window.confirm('Delete this file?')) return
                      deleteEstimationProjectFile(r.id)
                        .then(() => {
                          setRows((prev) => prev.filter((x) => x.id !== r.id))
                        })
                        .catch(() => setError('Delete failed.'))
                    }}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
