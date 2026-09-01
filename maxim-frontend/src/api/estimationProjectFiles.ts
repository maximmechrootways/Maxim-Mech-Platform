import { api } from '@/api'
import type { EstimationFolderApi } from '@/estimating/estimationFolders'
import type { PastProjectFolderApi } from '@/estimating/pastProjectFolders'

export type EstimationProjectFolderApi = EstimationFolderApi | PastProjectFolderApi

export interface EstimationProjectFileRow {
  id: string
  folder: EstimationProjectFolderApi
  name: string
  siteId: string | null
  site: { id: string; name: string } | null
  originalName: string
  mimeType: string
  sizeBytes: number
  notes: string | null
  createdAt: string
  uploadedBy: { id: string; firstName: string; lastName: string; email: string }
}

export async function fetchEstimationProjectFiles(params?: {
  folder?: EstimationProjectFolderApi
  siteId?: string
}): Promise<EstimationProjectFileRow[]> {
  const { data } = await api.get<EstimationProjectFileRow[]>('/estimation-project-files', {
    params: {
      folder: params?.folder,
      siteId: params?.siteId,
    },
  })
  return data
}

export async function uploadEstimationProjectFile(payload: {
  file: File
  folder: EstimationProjectFolderApi
  name: string
  siteId?: string | null
  notes?: string | null
}): Promise<EstimationProjectFileRow> {
  const form = new FormData()
  form.append('folder', payload.folder)
  form.append('name', payload.name.trim())
  if (payload.siteId) form.append('siteId', payload.siteId)
  if (payload.notes != null && payload.notes.trim()) form.append('notes', payload.notes.trim())
  form.append('file', payload.file)
  const { data } = await api.post<EstimationProjectFileRow>('/estimation-project-files', form)
  return data
}

export async function deleteEstimationProjectFile(id: string) {
  await api.delete(`/estimation-project-files/${id}`)
}

export async function downloadEstimationProjectFile(id: string, downloadName: string) {
  const res = await api.get(`/estimation-project-files/${id}/file`, {
    params: { download: 'true' },
    responseType: 'blob',
  })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = downloadName.replace(/[/\\?%*:|"<>]/g, '_')
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function openEstimationProjectFileInline(id: string) {
  const res = await api.get(`/estimation-project-files/${id}/file`, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  window.open(url, '_blank', 'noopener,noreferrer')
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
}
