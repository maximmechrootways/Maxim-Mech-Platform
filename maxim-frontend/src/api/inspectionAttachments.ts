import { api } from '@/api'

export interface InspectionAttachmentRecord {
  id: string
  scheduleId?: string
  name: string
  notes?: string
  uploadedAt: string
}

export async function fetchInspectionAttachments(): Promise<InspectionAttachmentRecord[]> {
  const { data } = await api.get<InspectionAttachmentRecord[]>('/inspection-attachments')
  return Array.isArray(data) ? data : []
}

export async function uploadInspectionAttachment(
  file: File,
  options?: { scheduleId?: string | null; notes?: string }
): Promise<InspectionAttachmentRecord> {
  const form = new FormData()
  form.append('file', file)
  if (options?.scheduleId) form.append('scheduleId', options.scheduleId)
  if (options?.notes !== undefined) form.append('notes', options.notes)
  const { data } = await api.post<InspectionAttachmentRecord>('/inspection-attachments', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function getInspectionAttachmentFileUrl(attachmentId: string): Promise<{ url: string; expiresInMinutes: number }> {
  const { data } = await api.get<{ url: string; expiresInMinutes: number }>(`/inspection-attachments/${attachmentId}/file-url`)
  return data
}

export async function deleteInspectionAttachment(attachmentId: string): Promise<void> {
  await api.delete(`/inspection-attachments/${attachmentId}`)
}
