import { api } from '@/api'

export interface CertificatePayload {
  name: string
  holderName: string
  holderUserId?: string
  issueDate?: string
  expirationDate?: string
  fileName?: string
  filePath?: string
}

export async function fetchCertificates() {
  const { data } = await api.get('/certificates')
  return data
}

/** Backfill links between training records and the global certificate register. */
export async function reconcileCertificateLinks(): Promise<{ stats: Record<string, number>; certificates: unknown[] }> {
  const { data } = await api.post('/certificates/reconcile-links')
  return data
}

export async function fetchCertificate(id: string) {
  const { data } = await api.get(`/certificates/${id}`)
  return data
}

export async function createCertificate(payload: CertificatePayload | FormData) {
  const isForm = payload instanceof FormData
  const { data } = await api.post(
    '/certificates',
    payload,
    isForm ? { headers: { 'Content-Type': undefined } } : undefined
  )
  return data
}

export async function updateCertificate(id: string, payload: Partial<CertificatePayload> | FormData) {
  const isForm = payload instanceof FormData
  const { data } = await api.patch(
    `/certificates/${id}`,
    payload,
    isForm ? { headers: { 'Content-Type': undefined } } : undefined
  )
  return data
}

export async function deleteCertificate(id: string) {
  await api.delete(`/certificates/${id}`)
}

export async function markCertificateReminderSent(id: string) {
  const { data } = await api.post(`/certificates/${id}/reminder-sent`)
  return data
}

export async function fetchCertificateFileBlob(id: string, options?: { download?: boolean }) {
  const params = options?.download ? { download: 'true' } : {}
  const { data } = await api.get<Blob>(`/certificates/${id}/file`, { params, responseType: 'blob' })
  return data
}
