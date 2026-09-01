import { api } from '@/api'

export type FormQrCode = {
  id: string
  slug: string
  label: string
  targetPath: string
  isActive: boolean
  createdById: string
  scanCount: number
  lastScannedAt?: string | null
  createdAt: string
  updatedAt: string
}

export async function listFormQrCodes() {
  const { data } = await api.get<FormQrCode[]>('/form-qr-codes')
  return data
}

export async function createFormQrCode(payload: { label: string; targetPath: string; isActive?: boolean }) {
  const { data } = await api.post<FormQrCode>('/form-qr-codes', payload)
  return data
}

export async function updateFormQrCode(id: string, payload: { label?: string; targetPath?: string; isActive?: boolean }) {
  const { data } = await api.patch<FormQrCode>(`/form-qr-codes/${id}`, payload)
  return data
}

export async function resolveFormQrSlug(slug: string) {
  const { data } = await api.get<{ slug: string; label: string; targetPath: string }>(`/qr/${encodeURIComponent(slug)}`)
  return data
}

