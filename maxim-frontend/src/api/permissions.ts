import { api } from '@/api'

export interface FeaturePermission {
  feature: string
  label: string
  viewRoles: string[]
  manageRoles?: string[]
}

export async function fetchPermissions() {
  const { data } = await api.get<FeaturePermission[]>('/permissions')
  return data
}
