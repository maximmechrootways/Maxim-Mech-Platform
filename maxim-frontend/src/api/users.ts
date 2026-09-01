import { api } from '@/api'
import type { UiPreferences } from '@/types'

export interface AdminUser {
  id: string
  email: string
  firstName: string
  lastName: string
  name: string
  role: string
  isActive: boolean
  createdAt: string | null
  lastLogin: string | null
}

export async function fetchUsersAdmin() {
  const { data } = await api.get<AdminUser[]>('/users/admin')
  return data
}

export async function fetchMyUiPreferences() {
  const { data } = await api.get<UiPreferences>('/users/me/preferences')
  return data
}

export async function updateMyUiPreferences(patch: Partial<UiPreferences>) {
  const { data } = await api.patch<UiPreferences>('/users/me/preferences', patch)
  return data
}

export async function fetchUserUiPreferences(userId: string) {
  const { data } = await api.get<UiPreferences>(`/users/${userId}/preferences`)
  return data
}

export async function updateUserUiPreferences(userId: string, patch: Partial<UiPreferences>) {
  const { data } = await api.patch<UiPreferences>(`/users/${userId}/preferences`, patch)
  return data
}
