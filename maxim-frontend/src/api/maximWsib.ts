import { api } from '@/api'

export const MAXIM_WSIB_DOCUMENT_TYPES = ['WSIB Clearance', 'CAD-7', 'NEER', 'Other'] as const
export type MaximWsibDocumentType = (typeof MAXIM_WSIB_DOCUMENT_TYPES)[number]

export interface MaximWsibDocument {
  id: string
  title: string
  documentType: string
  issueDate?: string
  expirationDate?: string
  fileName: string
  filePath: string
  uploadedById: string
  uploadedBy: string
  uploadedAt: string
  updatedAt: string
  notes?: string
}

export async function fetchMaximWsibDocuments(): Promise<MaximWsibDocument[]> {
  const { data } = await api.get('/maxim-wsib')
  return data
}

export async function fetchMaximWsibDocument(id: string): Promise<MaximWsibDocument> {
  const { data } = await api.get(`/maxim-wsib/${id}`)
  return data
}

export async function createMaximWsibDocument(payload: FormData): Promise<MaximWsibDocument> {
  const { data } = await api.post('/maxim-wsib', payload, {
    headers: { 'Content-Type': undefined },
  })
  return data
}

export async function updateMaximWsibDocument(id: string, payload: FormData | Record<string, unknown>): Promise<MaximWsibDocument> {
  const isForm = payload instanceof FormData
  const { data } = await api.patch(
    `/maxim-wsib/${id}`,
    payload,
    isForm ? { headers: { 'Content-Type': undefined } } : undefined
  )
  return data
}

export async function deleteMaximWsibDocument(id: string): Promise<void> {
  await api.delete(`/maxim-wsib/${id}`)
}

export async function fetchMaximWsibFileBlob(id: string, options?: { download?: boolean }) {
  const params = options?.download ? { download: 'true' } : {}
  const { data } = await api.get<Blob>(`/maxim-wsib/${id}/file`, { params, responseType: 'blob' })
  return data
}
