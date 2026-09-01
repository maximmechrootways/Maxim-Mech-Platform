import { api } from '@/api'
import { downloadBlob, quickViewBlob } from '@/utils/fileActions'

export type OfflineSubcontractorFormRecord = {
  id: string
  title: string
  filePath: string
  originalName: string
  mimeType?: string
  sizeBytes?: number
  uploadedById: string
  uploadedByName: string
  createdAt: string
}

export async function listOfflineSubcontractorForms() {
  const { data } = await api.get<OfflineSubcontractorFormRecord[]>('/offline-subcontractor-forms')
  return data
}

export async function uploadOfflineSubcontractorForm(title: string, file: File) {
  const form = new FormData()
  form.append('title', title)
  form.append('file', file)
  const { data } = await api.post<OfflineSubcontractorFormRecord>('/offline-subcontractor-forms', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function deleteOfflineSubcontractorForm(id: string) {
  const { data } = await api.delete<{ message: string }>(`/offline-subcontractor-forms/${id}`)
  return data
}

export async function fetchOfflineSubcontractorFormBlob(filePath: string): Promise<Blob> {
  const { data } = await api.get<Blob>(`/offline-subcontractor-forms/files/${encodeURIComponent(filePath)}`, {
    responseType: 'blob',
  })
  return data
}

export function quickViewOfflineForm(filePath: string) {
  return fetchOfflineSubcontractorFormBlob(filePath).then(quickViewBlob)
}

export function downloadOfflineForm(filePath: string, fileName: string) {
  return fetchOfflineSubcontractorFormBlob(filePath).then((b) => downloadBlob(b, fileName))
}
