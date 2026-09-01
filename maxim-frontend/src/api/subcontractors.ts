import { api } from '@/api'

export interface SubcontractorPayload {
  companyName: string
  officeContactName: string
  officeContactEmail: string
  officeContactPhone?: string
  siteContactName?: string
  siteContactEmail?: string
  siteContactPhone?: string
  status?: string
  notes?: string
  usingMaximHSManual?: boolean
  wsibInjuryReportOptional?: boolean
  wsibClearanceOptional?: boolean
  form1000Optional?: boolean
}

export interface SubcontractorCertificationPayload {
  name: string
  issuedAt: string
  expiresAt: string
  fileName?: string
  filePath?: string
}

export async function fetchSubcontractorDetail(id: string) {
  const { data } = await api.get(`/subcontractors/${id}`)
  return data
}

export async function listAllSubcontractorCertifications() {
  const { data } = await api.get('/subcontractors/all-certifications')
  return data
}

export async function createSubcontractor(payload: SubcontractorPayload) {
  const { data } = await api.post('/subcontractors', payload)
  return data
}

export async function updateSubcontractor(id: string, payload: Partial<SubcontractorPayload>) {
  const { data } = await api.patch(`/subcontractors/${id}`, payload)
  return data
}

export async function deleteSubcontractor(id: string) {
  await api.delete(`/subcontractors/${id}`)
}

export async function addSubcontractorCertification(subcontractorId: string, payload: SubcontractorCertificationPayload) {
  const { data } = await api.post(`/subcontractors/${subcontractorId}/certifications`, payload)
  return data
}

export async function updateSubcontractorCertification(subcontractorId: string, certId: string, payload: Partial<SubcontractorCertificationPayload>) {
  const { data } = await api.patch(`/subcontractors/${subcontractorId}/certifications/${certId}`, payload)
  return data
}

export async function removeSubcontractorCertification(subcontractorId: string, certId: string) {
  await api.delete(`/subcontractors/${subcontractorId}/certifications/${certId}`)
}

export async function listSubcontractorPersonnel(subcontractorId: string) {
  const { data } = await api.get(`/subcontractors/${subcontractorId}/personnel`)
  return data
}

export async function addSubcontractorPersonnel(subcontractorId: string, payload: any) {
  const { data } = await api.post(`/subcontractors/${subcontractorId}/personnel`, payload)
  return data
}

export async function updateSubcontractorPersonnel(subcontractorId: string, personnelId: string, payload: any) {
  const { data } = await api.patch(`/subcontractors/${subcontractorId}/personnel/${personnelId}`, payload)
  return data
}

export async function deleteSubcontractorPersonnel(subcontractorId: string, personnelId: string) {
  await api.delete(`/subcontractors/${subcontractorId}/personnel/${personnelId}`)
}

export async function addPersonnelJobAssignment(subcontractorId: string, personnelId: string, payload: any) {
  const { data } = await api.post(`/subcontractors/${subcontractorId}/personnel/${personnelId}/jobs`, payload)
  return data
}

export async function updatePersonnelJobAssignment(subcontractorId: string, personnelId: string, assignmentId: string, payload: any) {
  const { data } = await api.patch(`/subcontractors/${subcontractorId}/personnel/${personnelId}/jobs/${assignmentId}`, payload)
  return data
}

export async function removePersonnelJobAssignment(subcontractorId: string, personnelId: string, assignmentId: string) {
  await api.delete(`/subcontractors/${subcontractorId}/personnel/${personnelId}/jobs/${assignmentId}`)
}

export async function addPersonnelCertification(subcontractorId: string, personnelId: string, payload: any | FormData) {
  const isFormData = payload instanceof FormData
  const { data } = await api.post(`/subcontractors/${subcontractorId}/personnel/${personnelId}/certifications`, payload, isFormData ? {
    headers: { 'Content-Type': 'multipart/form-data' },
  } : undefined)
  return data
}

export async function updatePersonnelCertification(subcontractorId: string, personnelId: string, certId: string, payload: any) {
  const { data } = await api.patch(`/subcontractors/${subcontractorId}/personnel/${personnelId}/certifications/${certId}`, payload)
  return data
}

export async function removePersonnelCertification(subcontractorId: string, personnelId: string, certId: string) {
  await api.delete(`/subcontractors/${subcontractorId}/personnel/${personnelId}/certifications/${certId}`)
}

export async function addPersonnelDocument(subcontractorId: string, personnelId: string, payload: FormData) {
  const { data } = await api.post(`/subcontractors/${subcontractorId}/personnel/${personnelId}/documents`, payload, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function removePersonnelDocument(subcontractorId: string, personnelId: string, docId: string) {
  await api.delete(`/subcontractors/${subcontractorId}/personnel/${personnelId}/documents/${docId}`)
}

// ================= Contracts =================
export async function addSubcontractorContract(subcontractorId: string, formData: FormData) {
  const { data } = await api.post(`/subcontractors/${subcontractorId}/contracts`, formData, {
    headers: { 'Content-Type': undefined } // let browser set multipart/form-data boundary
  })
  return data
}

export async function removeSubcontractorContract(subcontractorId: string, contractId: string) {
  const { data } = await api.delete(`/subcontractors/${subcontractorId}/contracts/${contractId}`)
  return data
}

export async function fetchSubcontractorFileBlob(filePath: string): Promise<Blob> {
  const { data } = await api.get<Blob>(`/subcontractors/files/${encodeURIComponent(filePath)}`, { responseType: 'blob' })
  return data
}

export async function uploadSubcontractorHSManualPdf(subcontractorId: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post(`/subcontractors/${subcontractorId}/hs-manual-pdf`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function uploadSubcontractorWsibInjuryReportPdf(subcontractorId: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post(`/subcontractors/${subcontractorId}/wsib-injury-report-pdf`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function uploadSubcontractorHrSafetyAgreementPdf(subcontractorId: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post(`/subcontractors/${subcontractorId}/hr-safety-agreement-pdf`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function uploadSubcontractorForm1000Pdf(subcontractorId: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post(`/subcontractors/${subcontractorId}/form1000-pdf`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function addSubcontractorInsurance(
  subcontractorId: string,
  payload: { type: string; policyNumber?: string; expiresAt?: string },
  file: File | null,
) {
  const form = new FormData()
  form.append('type', payload.type)
  if (payload.policyNumber) form.append('policyNumber', payload.policyNumber)
  if (payload.expiresAt) form.append('expiresAt', payload.expiresAt)
  if (file) form.append('file', file)
  const { data } = await api.post(`/subcontractors/${subcontractorId}/insurances`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function deleteSubcontractorInsurance(subcontractorId: string, insuranceId: string) {
  await api.delete(`/subcontractors/${subcontractorId}/insurances/${insuranceId}`)
}

export async function listSubcontractorPersonnelCheckIns(subcontractorId: string) {
  const { data } = await api.get(`/subcontractors/${subcontractorId}/personnel-checkins`)
  return data
}

export async function checkInSubcontractorPersonnel(subcontractorId: string, personnelId: string, jobId: string, date: string) {
  const { data } = await api.post(`/subcontractors/${subcontractorId}/personnel/${personnelId}/jobs/${jobId}/checkin`, { date })
  return data
}

export async function checkOutSubcontractorPersonnel(subcontractorId: string, personnelId: string, jobId: string, date: string) {
  const { data } = await api.post(`/subcontractors/${subcontractorId}/personnel/${personnelId}/jobs/${jobId}/checkout`, { date })
  return data
}

