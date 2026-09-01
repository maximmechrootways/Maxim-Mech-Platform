import { api } from '@/api'

export interface DhaPreset {
  id: string
  name: string
  data: {
    activities?: string[]
    hazards?: string[]
    controls?: string[]
    ppe?: string[]
    toolsReplaced?: string
    additionalComments?: string
    jhaRows?: Array<{
      job: string
      hazard?: string
      riskRatingRequired?: string
      control?: string
      riskBeforeControls?: string
      riskAfterControls?: string
    }>
    violenceAnswers?: Record<number, string>
    violenceActions?: string
  }
  createdBy: string
  createdAt: string
  updatedAt: string
}

export async function fetchDhaPresets(): Promise<DhaPreset[]> {
  const { data } = await api.get<DhaPreset[]>('/dha-presets')
  return Array.isArray(data) ? data : []
}

export async function createDhaPreset(name: string, data: DhaPreset['data']): Promise<{ id: string; name: string }> {
  const { data: result } = await api.post('/dha-presets', { name, data })
  return result
}

export async function updateDhaPreset(id: string, name: string, data: DhaPreset['data']): Promise<{ id: string; name: string }> {
  const { data: result } = await api.patch(`/dha-presets/${id}`, { name, data })
  return result
}

export async function deleteDhaPreset(id: string): Promise<void> {
  await api.delete(`/dha-presets/${id}`)
}
