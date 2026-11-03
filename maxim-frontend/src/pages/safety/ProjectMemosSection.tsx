import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  deleteLibraryDocument,
  fetchLibraryDocumentBlob,
  fetchLibraryDocumentsByJob,
  suggestLibraryDocumentFileName,
  uploadLibraryDocument,
} from '@/api/library'
import { downloadBlob, quickViewBlob } from '@/utils/fileActions'

/** LibraryDocument.type for project-scoped memos/notices under Job Management. */
export const PROJECT_MEMO_DOCUMENT_TYPE = 'project-memo'

export function isProjectMemoDocumentType(type: string | undefined): boolean {
  return (type ?? '').trim().toLowerCase() === PROJECT_MEMO_DOCUMENT_TYPE
}

type MemoDoc = {
  id: string
  name: string
  type?: string
  uploadedBy: string
  createdAt?: string
}

type Props = {
  jobId: string
  canManage: boolean
}

export function ProjectMemosSection({ jobId, canManage }: Props) {
  const [documents, setDocuments] = useState<MemoDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [docName, setDocName] = useState('')
  const [uploadingDoc, setUploadingDoc] = useState(false)

  const [fileActionId, setFileActionId] = useState<string | null>(null)
  const [fileActionType, setFileActionType] = useState<'view' | 'download' | 'delete' | null>(null)

  const loadContents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const docRows = await fetchLibraryDocumentsByJob(jobId)
      const memos = (Array.isArray(docRows) ? docRows : []).filter((d: MemoDoc) =>
        isProjectMemoDocumentType(d.type),
      )
      setDocuments(memos)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error ??
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to load memos'
      setError(msg)
      setDocuments([])
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    loadContents()
  }, [loadContents])

  const handleUploadDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingDoc(true)
    try {
      await uploadLibraryDocument(file, {
        name: docName.trim() || file.name.replace(/\.[^.]+$/i, ''),
        type: PROJECT_MEMO_DOCUMENT_TYPE,
        jobId,
        visibility: 'everyone',
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

  const handleViewDoc = async (doc: MemoDoc) => {
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

  const handleDownloadDoc = async (doc: MemoDoc) => {
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

  const handleDeleteDoc = async (doc: MemoDoc) => {
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

  return (
    <div className="mt-4">
      {canManage && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <input
            type="text"
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
            placeholder="Memo / notice title (optional)"
            className="flex-1 min-w-[200px] h-10 px-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm focus:ring-1 focus:ring-brand-500"
          />
          <label className="shrink-0 flex items-center justify-center h-10 px-4 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50">
            {uploadingDoc ? 'Uploading...' : 'Upload Memo / Notice'}
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,application/zip"
              className="hidden"
              onChange={handleUploadDoc}
              disabled={uploadingDoc}
            />
          </label>
          <p className="basis-full text-xs text-neutral-500 dark:text-neutral-400">
            Allowed: PDF, Word, Excel, CSV, TXT, ZIP, PNG, JPEG. Visible to everyone on this project.
          </p>
        </div>
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
      ) : documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center bg-neutral-50 dark:bg-neutral-900/50">
          <div className="text-neutral-500 dark:text-neutral-400">
            No memos or notices for this project yet.
            {canManage ? ' Upload a document above for the team to review.' : ''}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700">
          <table className="w-full text-left text-sm whitespace-nowrap text-neutral-600 dark:text-neutral-300">
            <thead className="bg-neutral-50 dark:bg-neutral-900/50 border-b border-neutral-200 dark:border-neutral-700">
              <tr>
                <th className="px-4 py-3 font-semibold text-neutral-900 dark:text-white">Name</th>
                <th className="px-4 py-3 font-semibold text-neutral-900 dark:text-white lg:table-cell hidden">
                  Uploaded By
                </th>
                <th className="px-4 py-3 font-semibold text-neutral-900 dark:text-white">Date</th>
                <th className="px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700 bg-white dark:bg-neutral-900">
              {documents.map((doc) => (
                <tr
                  key={doc.id}
                  className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors group"
                >
                  <td className="px-4 py-3 font-medium text-neutral-900 dark:text-white">
                    <span className="flex items-center gap-2">
                      <span aria-hidden>📋</span> {doc.name}
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
                        {fileActionId === doc.id && fileActionType === 'download'
                          ? 'Downloading…'
                          : 'Download'}
                      </Button>
                      {canManage && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={fileActionId === doc.id}
                          onClick={() => void handleDeleteDoc(doc)}
                        >
                          {fileActionId === doc.id && fileActionType === 'delete'
                            ? 'Deleting…'
                            : 'Delete'}
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
