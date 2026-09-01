import { api } from '@/api'

export interface ProductFeedbackCommentRecord {
  id: string
  feedbackId: string
  authorId: string
  authorName: string
  body: string
  createdAt: string
}

export interface ProductFeedbackRecord {
  id: string
  userId: string
  userName: string
  userEmail: string
  userRole: string
  message: string
  pageUrl: string | null
  completed: boolean
  completedAt: string | null
  createdAt: string
  forwardedAt: string | null
  forwardError: string | null
  comments: ProductFeedbackCommentRecord[]
}

export async function submitProductFeedback(payload: { message: string; pageUrl?: string }) {
  const { data } = await api.post<ProductFeedbackRecord>('/feedback', payload)
  return data
}

export async function fetchProductFeedback() {
  const { data } = await api.get<ProductFeedbackRecord[]>('/feedback')
  return Array.isArray(data) ? data : []
}

export async function updateProductFeedback(id: string, payload: { message?: string; completed?: boolean }) {
  const { data } = await api.patch<ProductFeedbackRecord>(`/feedback/${id}`, payload)
  return data
}

export async function deleteProductFeedback(id: string) {
  const { data } = await api.delete<{ id: string; deleted: true }>(`/feedback/${id}`)
  return data
}

export async function retryProductFeedbackForward(id: string) {
  const { data } = await api.post<ProductFeedbackRecord>(`/feedback/${id}/retry-forward`)
  return data
}

export async function createProductFeedbackComment(id: string, payload: { body: string }) {
  const { data } = await api.post<ProductFeedbackCommentRecord>(`/feedback/${id}/comments`, payload)
  return data
}
