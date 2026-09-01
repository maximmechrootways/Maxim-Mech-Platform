import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { FileViewer, type FileViewerSource } from '@/components/files/FileViewer'
import {
  deleteLocalDocument,
  deleteLocalProject,
  fetchLocalDocumentBlob,
  type LocalDocumentMeta,
  type LocalTreeProject,
} from '@/api/localDocuments'
import { downloadBlob } from '@/utils/fileActions'

function formatSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function LocalArchiveBrowser({
  projects,
  emptyMessage = 'No local archive files for this project yet.',
  onChanged,
}: {
  projects: LocalTreeProject[]
  emptyMessage?: string
  /** Called after a successful delete so the parent can reload the tree. */
  onChanged?: () => void
}) {
  const [viewer, setViewer] = useState<FileViewerSource | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const flatCount = useMemo(
    () => projects.reduce((sum, p) => sum + p.fileCount, 0),
    [projects]
  )

  const openFile = (file: LocalDocumentMeta) => {
    setViewer({
      fileName: file.name,
      contentType: file.contentType,
      crumb: [file.project, file.folderPath].filter(Boolean).join(' / '),
      localDocumentId: file.id,
      loadBlob: () => fetchLocalDocumentBlob(file.id),
    })
    setViewerOpen(true)
  }

  const downloadFile = async (file: LocalDocumentMeta) => {
    const blob = await fetchLocalDocumentBlob(file.id, true)
    downloadBlob(blob, file.name)
  }

  const removeFile = async (file: LocalDocumentMeta) => {
    const ok = window.confirm(
      `Delete "${file.name}" from the local archive?\n\nThis removes the file from the GX10 and Frank will no longer find it.`
    )
    if (!ok) return
    setError(null)
    setBusyId(file.id)
    try {
      await deleteLocalDocument(file.id)
      if (viewer?.localDocumentId === file.id) {
        setViewerOpen(false)
        setViewer(null)
      }
      onChanged?.()
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (e instanceof Error ? e.message : 'Delete failed')
      setError(msg)
    } finally {
      setBusyId(null)
    }
  }

  const removeProject = async (projectName: string, fileCount: number) => {
    const ok = window.confirm(
      `Delete entire local archive project "${projectName}" (${fileCount} file${fileCount === 1 ? '' : 's'})?\n\nThis cannot be undone.`
    )
    if (!ok) return
    setError(null)
    setBusyId(`project:${projectName}`)
    try {
      await deleteLocalProject(projectName)
      setViewerOpen(false)
      setViewer(null)
      onChanged?.()
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (e instanceof Error ? e.message : 'Delete failed')
      setError(msg)
    } finally {
      setBusyId(null)
    }
  }

  if (projects.length === 0 || flatCount === 0) {
    return (
      <p className="text-sm text-neutral-500 border border-dashed border-neutral-300 dark:border-neutral-600 rounded-xl p-8 text-center">
        {emptyMessage}
      </p>
    )
  }

  return (
    <>
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>
      ) : null}
      <div className="space-y-6">
        {projects.map((project) => (
          <section key={project.name} className="rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden bg-white dark:bg-neutral-900/40">
            <header className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-neutral-900 dark:text-white">{project.name}</p>
                <p className="text-xs text-neutral-500 mt-0.5">{project.fileCount} file{project.fileCount === 1 ? '' : 's'} · Local archive</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                  Local
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  disabled={busyId === `project:${project.name}`}
                  onClick={() => { void removeProject(project.name, project.fileCount) }}
                >
                  {busyId === `project:${project.name}` ? 'Deleting…' : 'Delete project'}
                </Button>
              </div>
            </header>
            <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {project.folders.map((folder) => (
                <div key={`${project.name}:${folder.path}`}>
                  {folder.path ? (
                    <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      {folder.path}
                    </p>
                  ) : null}
                  <ul>
                    {folder.files.map((file) => (
                      <li key={file.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3">
                        <div className="min-w-0">
                          <p className="font-medium text-neutral-900 dark:text-white truncate">{file.name}</p>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {formatSize(file.sizeBytes)} · {file.status}
                            {file.chunkCount ? ` · ${file.chunkCount} chunks` : ''}
                          </p>
                          {file.error && <p className="text-xs text-red-600 mt-0.5">{file.error}</p>}
                        </div>
                        <div className="flex gap-2 shrink-0 flex-wrap">
                          <Button type="button" size="sm" variant="secondary" onClick={() => openFile(file)}>
                            View
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => { void downloadFile(file) }}>
                            Download
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="danger"
                            disabled={busyId === file.id}
                            onClick={() => { void removeFile(file) }}
                          >
                            {busyId === file.id ? 'Deleting…' : 'Delete'}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <FileViewer source={viewer} open={viewerOpen} onClose={() => setViewerOpen(false)} />
    </>
  )
}
