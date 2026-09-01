import { api } from '@/api'

export type EmployeeDocumentCategory = 'license' | 'certification' | 'training' | 'hiring'

export interface EmployeeDocumentRecord {
  id: string
  category: string
  name: string
  originalName: string
  uploadedAt: string
  expiresAt?: string
  completedAt?: string
  licenseNumber?: string
  certificateId?: string
  hoursCompleted?: number
  trainingFacility?: string
  hasFile?: boolean
}

export async function fetchEmployeeDocuments(employeeId: string): Promise<EmployeeDocumentRecord[]> {
  const { data } = await api.get<EmployeeDocumentRecord[]>(`/employee-documents`, {
    params: { employeeId },
  })
  return Array.isArray(data) ? data : []
}

export async function uploadEmployeeDocument(
  employeeId: string,
  file: File | null,
  category: EmployeeDocumentCategory,
  options?: {
    expiresAt?: string
    completedAt?: string
    displayName?: string
    licenseNumber?: string
    hoursCompleted?: string
    trainingFacility?: string
  }
): Promise<EmployeeDocumentRecord> {
  const form = new FormData()
  if (file) form.append('file', file)
  form.append('employeeId', employeeId)
  form.append('category', category)
  if (options?.expiresAt) form.append('expiresAt', options.expiresAt)
  if (options?.completedAt) form.append('completedAt', options.completedAt)
  if (options?.displayName) form.append('displayName', options.displayName)
  if (options?.licenseNumber) form.append('licenseNumber', options.licenseNumber)
  if (options?.hoursCompleted) form.append('hoursCompleted', options.hoursCompleted)
  if (options?.trainingFacility) form.append('trainingFacility', options.trainingFacility)
  const { data } = await api.post<EmployeeDocumentRecord>('/employee-documents', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function getEmployeeDocumentFileUrl(docId: string): Promise<{ url: string; expiresInMinutes: number }> {
  const { data } = await api.get<{ url: string; expiresInMinutes: number }>(`/employee-documents/${docId}/file-url`)
  return data
}

export async function fetchEmployeeDocumentBlob(docId: string, options?: { download?: boolean }): Promise<Blob> {
  const params = options?.download ? { download: 'true' } : {}
  const { data } = await api.get<Blob>(`/employee-documents/${docId}/file`, {
    params,
    responseType: 'blob',
  })
  return data
}

export async function deleteEmployeeDocument(docId: string): Promise<void> {
  await api.delete(`/employee-documents/${docId}`)
}
