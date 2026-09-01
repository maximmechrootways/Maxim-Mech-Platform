import { api } from '@/api'

export interface TrainingCourseType {
  id: string
  name: string
  isPrimary: boolean
  sortOrder: number
  isActive: boolean
  usageCount: number
  createdAt: string
  updatedAt: string
}

export async function fetchTrainingCourseTypes(options?: { includeInactive?: boolean }) {
  const { data } = await api.get<TrainingCourseType[]>('/training-course-types', {
    params: options?.includeInactive ? { includeInactive: true } : undefined,
  })
  return data
}

export async function refreshTrainingCourseCatalog() {
  const { data } = await api.post<TrainingCourseType[]>('/training-course-types/ensure')
  return data
}

export async function createTrainingCourseType(payload: { name: string; isPrimary?: boolean }) {
  const { data } = await api.post<TrainingCourseType>('/training-course-types', payload)
  return data
}

export async function updateTrainingCourseType(
  id: string,
  payload: { name?: string; isPrimary?: boolean; sortOrder?: number; isActive?: boolean },
) {
  const { data } = await api.patch<TrainingCourseType & { certificatesUpdated?: number; documentsUpdated?: number }>(
    `/training-course-types/${id}`,
    payload,
  )
  return data
}

export async function mergeTrainingCourseType(fromId: string, intoId: string) {
  const { data } = await api.post<{
    into: TrainingCourseType
    certificatesUpdated: number
    documentsUpdated: number
    removedId?: string
  }>(`/training-course-types/${fromId}/merge`, { intoId })
  return data
}

export async function deleteTrainingCourseType(id: string, mergeIntoId?: string) {
  const { data } = await api.delete<{
    deleted: true
    certificatesUpdated?: number
    documentsUpdated?: number
    mergedInto?: TrainingCourseType
  }>(`/training-course-types/${id}`, {
    params: mergeIntoId ? { mergeIntoId } : undefined,
  })
  return data
}
