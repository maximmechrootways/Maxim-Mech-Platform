import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  createProjectDocumentFolder,
  deleteProjectDocumentFolder,
  deleteLibraryDocument,
  fetchLibraryDocumentBlob,
  fetchLibraryDocumentsByJob,
  fetchProjectDocumentFolderPath,
  fetchProjectDocumentFolders,
  renameProjectDocumentFolder,
  suggestLibraryDocumentFileName,
  uploadLibraryDocument,
  type ProjectDocumentFolder,
  type ProjectDocumentFolderPathItem,
} from '@/api/library'
import { downloadBlob, quickViewBlob } from '@/utils/fileActions'

type ProjectDoc = {
  id: string
  name: string
  uploadedBy: string
  createdAt?: string
}

type Props = {
  jobId: string
  canManage: boolean
}

export function ProjectDocumentsSection({ jobId, canManage }: Props) {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [folders, setFolders] = useState<ProjectDocumentFolder[]>([])
  const [documents, setDocuments] = useState<ProjectDoc[]>([])
  const [breadcrumb, setBreadcrumb] = useState<ProjectDocumentFolderPathItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [docName, setDocName] = useState('')
  const [uploadingDoc, setUploadingDoc] = useState(false)

  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)

  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renaming, setRenaming] = useState(false)

  const [fileActionId, setFileActionId] = useState<string | null>(null)
  const [fileActionType, setFileActionType] = useState<'view' | 'download' | 'delete' | null>(null)

  const loadContents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [folderRows, docRows, pathRows] = await Promise.all([
        fetchProjectDocumentFolders(jobId, currentFolderId),
        fetchLibraryDocumentsByJob(jobId, currentFolderId),
        currentFolderId ? fetchProjectDocumentFolderPath(jobId, currentFolderId) : Promise.resolve([]),
      ])
      setFolders(Array.isArray(folderRows) ? folderRows : [])
      setDocuments(Array.isArray(docRows) ? docRows : [])
      setBreadcrumb(Array.isArray(pathRows) ? pathRows : [])
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error ??
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to load documents'
      setError(msg)
      setFolders([])
      setDocuments([])
      setBreadcrumb([])
    } finally {
      setLoading(false)
    }
  }, [jobId, currentFolderId])

  useEffect(() => {
    loadContents()
  }, [loadContents])

  const handleUploadDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingDoc(true)
    try {
      await uploadLibraryDocument(file, {
        name: docName.trim() || file.name.replace(/\.pdf$/i, ''),
        jobId,
        folderId: currentFolderId,
      })
      setDocName('')
      await loadContents()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Upload failed'
      alert(msg)
    } finally {
      setUploadingDoc(false)
      e.target.value = ''
    }
  }

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newFolderName.trim()
    if (!name) return
    setCreatingFolder(true)
    try {
      await createProjectDocumentFolder(jobId, { name, parentId: currentFolderId })
      setNewFolderName('')
      setShowNewFolder(false)
      await loadContents()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error ??
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to create folder'
      alert(msg)
    } finally {
      setCreatingFolder(false)
    }
  }

  const startRenameFolder = (folder: ProjectDocumentFolder) => {
    setRenamingFolderId(folder.id)
    setRenameValue(folder.name)
  }

  const cancelRenameFolder = () => {
    setRenamingFolderId(null)
    setRenameValue('')
  }

  const submitRenameFolder = async () => {
    if (!renamingFolderId) return
    const name = renameValue.trim()
    if (!name) return
    setRenaming(true)
    try {
      await renameProjectDocumentFolder(jobId, renamingFolderId, name)
      cancelRenameFolder()
      await loadContents()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error ??
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to rename folder'
      alert(msg)
    } finally {
      setRenaming(false)
    }
  }

  const handleDeleteFolder = async (folder: ProjectDocumentFolder) => {
    if (folder.documentCount > 0 || folder.subfolderCount > 0) {
      alert('This folder must be empty before it can be deleted.')
      return
    }
    if (!window.confirm(`Delete folder "${folder.name}"?`)) return
    try {
      await deleteProjectDocumentFolder(jobId, folder.id)
      await loadContents()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error ??
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to delete folder'
      alert(msg)
    }
  }

  const handleViewDoc = async (doc: ProjectDoc) => {
    setFileActionId(doc.id)
    setFileActionType('view')
    try {
      const blob = await fetchLibraryDocumentBlob(doc.id)
      quickViewBlob(blob)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error ??
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to open document'
      alert(msg)
    } finally {
      setFileActionId(null)
      setFileActionType(null)
    }
  }

  const handleDownloadDoc = async (doc: ProjectDoc) => {
    setFileActionId(doc.id)
    setFileActionType('download')
    try {
      const blob = await fetchLibraryDocumentBlob(doc.id, { download: true })
      downloadBlob(blob, suggestLibraryDocumentFileName(doc.name, blob))
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error ??
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to download document'
      alert(msg)
    } finally {
      setFileActionId(null)
      setFileActionType(null)
    }
  }

  const handleDeleteDoc = async (doc: ProjectDoc) => {
    if (!window.confirm(`Delete "${doc.name}"? This cannot be undone.`)) return
    setFileActionId(doc.id)
    setFileActionType('delete')
    try {
      await deleteLibraryDocument(doc.id)
      await loadContents()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error ??
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to delete document'
      alert(msg)
    } finally {
      setFileActionId(null)
      setFileActionType(null)
    }
  }

  const isEmpty = !loading && folders.length === 0 && documents.length === 0

  return (
    <div className="mt-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap items-center gap-1 text-sm text-neutral-600 dark:text-neutral-400">
          <button
            type="button"
            onClick={() => setCurrentFolderId(null)}
            className={`hover:underline ${currentFolderId === null ? 'font-semibold text-neutral-900 dark:text-white' : ''}`}
          >
            Project Documents
          </button>
          {breadcrumb.map((crumb) => (
            <span key={crumb.id} className="flex items-center gap-1">
              <span className="text-neutral-400">/</span>
              <button
                type="button"
                onClick={() => setCurrentFolderId(crumb.id)}
                className={`hover:underline ${
                  crumb.id === currentFolderId ? 'font-semibold text-neutral-900 dark:text-white' : ''
                }`}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>
        {currentFolderId && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const parent = breadcrumb.length > 1 ? breadcrumb[breadcrumb.length - 2]?.id ?? null : null
              setCurrentFolderId(parent)
            }}
          >
            ← Back
          </Button>
        )}
      </div>

      {canManage && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <input
            type="text"
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
            placeholder="Custom document name (optional)"
            className="flex-1 min-w-[200px] h-10 px-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm focus:ring-1 focus:ring-brand-500"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setShowNewFolder((v) => !v)
              setNewFolderName('')
            }}
          >
            New Folder
          </Button>
          <label className="shrink-0 flex items-center justify-center h-10 px-4 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50">
            {uploadingDoc ? 'Uploading...' : 'Upload Document'}
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,application/zip"
              className="hidden"
              onChange={handleUploadDoc}
              disabled={uploadingDoc}
            />
          </label>
          <p className="basis-full text-xs text-neutral-500 dark:text-neutral-400">
            Allowed: PDF, Word, Excel, CSV, TXT, ZIP, PNG, JPEG
          </p>
        </div>
      )}

      {canManage && showNewFolder && (
        <form onSubmit={handleCreateFolder} className="mb-4 flex flex-wrap items-end gap-3">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            autoFocus
            className="flex-1 min-w-[200px] h-10 px-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm focus:ring-1 focus:ring-brand-500"
          />
          <Button type="submit" disabled={creatingFolder || !newFolderName.trim()}>
            {creatingFolder ? 'Creating...' : 'Create Folder'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setShowNewFolder(false)} disabled={creatingFolder}>
            Cancel
          </Button>
        </form>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
          Loading...
        </div>
      ) : isEmpty ? (
        <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center bg-neutral-50 dark:bg-neutral-900/50">
          <div className="text-neutral-500 dark:text-neutral-400">
            {currentFolderId ? 'This folder is empty.' : 'No project documents yet.'}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700">
          <table className="w-full text-left text-sm whitespace-nowrap text-neutral-600 dark:text-neutral-300">
            <thead className="bg-neutral-50 dark:bg-neutral-900/50 border-b border-neutral-200 dark:border-neutral-700">
              <tr>
                <th className="px-4 py-3 font-semibold text-neutral-900 dark:text-white">Name</th>
                <th className="px-4 py-3 font-semibold text-neutral-900 dark:text-white lg:table-cell hidden">Uploaded By</th>
                <th className="px-4 py-3 font-semibold text-neutral-900 dark:text-white">Date</th>
                <th className="px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700 bg-white dark:bg-neutral-900">
              {folders.map((folder) => (
                <tr key={folder.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors group">
                  <td className="px-4 py-3 font-medium text-neutral-900 dark:text-white">
                    {renamingFolderId === folder.id ? (
                      <form
                        className="flex flex-wrap items-center gap-2"
                        onSubmit={(e) => {
                          e.preventDefault()
                          submitRenameFolder()
                        }}
                      >
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          aria-label="Folder name"
                          className="h-8 min-w-[160px] px-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                          autoFocus
                        />
                        <Button type="submit" size="sm" disabled={renaming || !renameValue.trim()}>
                          Save
                        </Button>
                        <Button type="button" variant="secondary" size="sm" onClick={cancelRenameFolder} disabled={renaming}>
                          Cancel
                        </Button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setCurrentFolderId(folder.id)}
                        className="flex items-center gap-2 text-left hover:underline"
                      >
                        <span className="text-amber-500">📁</span>
                        <span>{folder.name}</span>
                        {(folder.documentCount > 0 || folder.subfolderCount > 0) && (
                          <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">
                            ({folder.documentCount} file{folder.documentCount === 1 ? '' : 's'}
                            {folder.subfolderCount > 0
                              ? `, ${folder.subfolderCount} folder${folder.subfolderCount === 1 ? '' : 's'}`
                              : ''}
                            )
                          </span>
                        )}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 lg:table-cell hidden text-neutral-500">{folder.createdBy}</td>
                  <td className="px-4 py-3 text-neutral-500">
                    {folder.createdAt ? new Date(folder.createdAt).toLocaleDateString() : ''}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canManage && renamingFolderId !== folder.id && (
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => startRenameFolder(folder)}>
                          Rename
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => handleDeleteFolder(folder)}>
                          Delete
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors group">
                  <td className="px-4 py-3 font-medium text-neutral-900 dark:text-white">
                    <span className="flex items-center gap-2">
                      <span className="text-red-500">📄</span> {doc.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 lg:table-cell hidden text-neutral-500">{doc.uploadedBy}</td>
                  <td className="px-4 py-3 text-neutral-500">
                    {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : ''}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={fileActionId === doc.id}
                        onClick={() => void handleViewDoc(doc)}
                      >
                        {fileActionId === doc.id && fileActionType === 'view' ? 'Opening…' : 'View'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={fileActionId === doc.id}
                        onClick={() => void handleDownloadDoc(doc)}
                      >
                        {fileActionId === doc.id && fileActionType === 'download' ? 'Downloading…' : 'Download'}
                      </Button>
                      {canManage && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={fileActionId === doc.id}
                          onClick={() => void handleDeleteDoc(doc)}
                        >
                          {fileActionId === doc.id && fileActionType === 'delete' ? 'Deleting…' : 'Delete'}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
