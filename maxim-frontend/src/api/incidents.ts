import { api } from '@/api'

export interface IncidentPayload {
  title: string
  siteId?: string
  siteName?: string
  date?: string
  status?: string
  severity?: string
  incidentType?: string
  severityLevel?: number
  equipmentInvolved?: string
  description?: string
  reportedBy?: string
  specificArea?: string
  employeesInvolved?: string[]
  actionsTaken?: string
  correctiveActionsCompleted?: boolean
  photos?: string[]
  documents?: string[]
  employeeSignature?: string
  reportedBySignature?: string
  supervisorSignature?: string
  signatureMeta?: {
    employee?: { name: string; timestamp: string }
    reportedBy?: { name: string; timestamp: string }
    supervisor?: { name: string; timestamp: string }
    incidentMedical?: {
      injuryInvolved?: boolean
      injuryCategory?: string
      injuryDetails?: string
      takenToHospital?: boolean
      hospitalName?: string
      professionalTreatmentDetails?: string
    }
  }
}

export async function fetchIncidents(params?: { status?: string; siteId?: string }) {
  const { data } = await api.get('/incidents', { params })
  return data
}

export async function fetchIncident(id: string) {
  const { data } = await api.get(`/incidents/${id}`)
  return data
}

export async function createIncident(payload: IncidentPayload) {
  const { data } = await api.post('/incidents', payload)
  return data
}

export async function updateIncident(id: string, payload: Partial<IncidentPayload>) {
  const { data } = await api.patch(`/incidents/${id}`, payload)
  return data
}

export async function deleteIncident(id: string) {
  await api.delete(`/incidents/${id}`)
}
