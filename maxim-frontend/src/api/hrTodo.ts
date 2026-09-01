import { api } from '@/api'

export interface HRTodoPayload {
  title: string
  recurrence?: string
  dueDate: string
  dueTime?: string
  linkTo?: string
}

export async function fetchHRTodo(params?: { dueDate?: string; completed?: string }) {
  const { data } = await api.get('/hr-todo', { params: params ?? {} })
  return data
}

export async function createHRTodo(payload: HRTodoPayload) {
  const { data } = await api.post('/hr-todo', payload)
  return data
}

export async function updateHRTodo(id: string, payload: Partial<HRTodoPayload> & { completed?: boolean }) {
  const { data } = await api.patch(`/hr-todo/${id}`, payload)
  return data
}

export async function deleteHRTodo(id: string) {
  await api.delete(`/hr-todo/${id}`)
}
