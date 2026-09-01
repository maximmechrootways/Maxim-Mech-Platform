import { api, getAuthToken } from '@/api'

export async function fetchScannedPdfs() {
  const { data } = await api.get('/templates/pdfs')
  return data
}

export async function fetchScannedPdfById(id: string) {
  const { data } = await api.get(`/templates/pdfs/${id}`)
  return data
}

export async function uploadScannedPdf(file: File, name?: string) {
  const form = new FormData()
  form.append('file', file)
  if (name) form.append('name', name)
  const { data } = await api.post('/templates/pdf/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function fetchSignableTemplates() {
  const { data } = await api.get('/templates/signable')
  return data
}

export async function fetchSignableTemplate(id: string) {
  const { data } = await api.get(`/templates/signable/${id}`)
  return data
}

export async function createSignableTemplate(payload: any) {
  const { data } = await api.post('/templates/signable', payload)
  return data
}

export async function updateSignableTemplate(id: string, payload: any) {
  const { data } = await api.patch(`/templates/signable/${id}`, payload)
  return data
}

export async function fetchFormSubmissions(params?: { status?: string; templateId?: string }) {
  const { data } = await api.get('/submissions', { params })
  return data
}

export async function fetchFormSubmission(id: string) {
  const { data } = await api.get(`/submissions/${id}`)
  return data
}

export async function createFormSubmission(payload: any) {
  const { data } = await api.post('/submissions', payload)
  return data
}

export async function updateFormSubmission(id: string, payload: any) {
  const { data } = await api.patch(`/submissions/${id}`, payload)
  return data
}

export async function fetchDailyForms() {
  const { data } = await api.get('/daily-forms')
  return data
}

export async function fetchDailyFormsMyTeam(): Promise<{ id: string; name: string }[]> {
  const { data } = await api.get('/daily-forms/my-team')
  return Array.isArray(data) ? data : []
}

export async function passAlongFormAssignment(payload: {
  assignmentId: string
  toUserId: string
  note?: string
  dueDate?: string
}) {
  const { data } = await api.post('/daily-forms/pass', payload)
  return data
}

export async function fetchAssignmentChain(assignmentId: string) {
  const { data } = await api.get(`/daily-forms/assignments/${assignmentId}/chain`)
  return data
}

export async function submitSequentialSignature(assignmentId: string, payload: { signatureUrl: string; fieldValues: object }) {
  const { data } = await api.post(`/daily-forms/${assignmentId}/sequential-sign`, payload)
  return data
}

export async function forwardAssignmentToHR(assignmentId: string) {
  const { data } = await api.post(`/form-assignments/${assignmentId}/forward-hr`)
  return data
}

export async function fetchAssignmentDetails(assignmentId: string) {
  const { data } = await api.get(`/daily-forms/assignments/${assignmentId}`)
  return data
}

export async function assignDailyForm(payload: {
  signableFormTemplateId: string
  assignedToUserIds: string[]
  dueDate: string
  schedule: 'daily' | 'monthly' | 'yearly'
}) {
  const { data } = await api.post('/daily-forms/assign', payload)
  return data
}

export async function fetchSignableSubmissions(params?: { signableFormId?: string }) {
  const { data } = await api.get('/signable-submissions', { params })
  return data
}

export async function fetchSignableSubmission(id: string) {
  const { data } = await api.get(`/signable-submissions/${id}`)
  return data
}

export async function createSignableSubmission(payload: any) {
  const { data } = await api.post('/signable-submissions', payload)
  return data
}

export async function updateSignableSubmission(id: string, payload: any) {
  const { data } = await api.patch(`/signable-submissions/${id}`, payload)
  return data
}

export async function fetchLibraryDocuments() {
  const { data } = await api.get('/documents/library')
  return data
}

export async function fetchLibraryDocument(id: string) {
  const { data } = await api.get(`/documents/library/${id}`)
  return data
}

export function getLibraryDocumentFileUrl(id: string): string {
  const token = getAuthToken() || ''
  const path = `/documents/library/${id}/file?token=${encodeURIComponent(token)}`
  if (import.meta.env.DEV) return path
  const base = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '')
  return `${base}${path}`
}

export async function fetchLibraryDocumentBlob(id: string, options?: { download?: boolean }): Promise<Blob> {
  const { data } = await api.get(`/documents/library/${id}/file`, {
    params: options?.download ? { download: 'true' } : {},
    responseType: 'blob',
  })
  return data
}

export function suggestLibraryDocumentFileName(displayName: string, blob: Blob): string {
  const safe = (displayName || 'document').replace(/[/\\?%*:|"<>]/g, '_').trim() || 'document'
  if (/\.[a-z0-9]+$/i.test(safe)) return safe
  const type = blob.type.toLowerCase()
  if (type.includes('png')) return `${safe}.png`
  if (type.includes('jpeg') || type.includes('jpg')) return `${safe}.jpg`
  return `${safe}.pdf`
}

export async function uploadLibraryDocument(file: File, meta: { name?: string; type?: string; siteId?: string; jobId?: string; folderId?: string | null; date?: string; visibility?: string; visibleToRoles?: string[]; visibleToUserIds?: string[] }) {
  const form = new FormData()
  form.append('file', file)
  if (meta.name) form.append('name', meta.name)
  if (meta.type) form.append('type', meta.type)
  if (meta.siteId) form.append('siteId', meta.siteId)
  if (meta.jobId) form.append('jobId', meta.jobId)
  if (meta.folderId) form.append('folderId', meta.folderId)
  if (meta.date) form.append('date', meta.date)
  if (meta.visibility) form.append('visibility', meta.visibility)
  if (meta.visibleToRoles) form.append('visibleToRoles', JSON.stringify(meta.visibleToRoles))
  if (meta.visibleToUserIds) form.append('visibleToUserIds', JSON.stringify(meta.visibleToUserIds))
  // Large SDS books (~10–50MB) need headroom beyond the default FormData 120s.
  const timeoutMs = Math.min(600_000, Math.max(180_000, Math.ceil(file.size / 40)))
  const { data } = await api.post('/documents/library', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: timeoutMs,
  })
  return data
}

export type ProjectDocumentFolder = {
  id: string
  name: string
  parentId: string | null
  createdAt: string
  createdBy: string
  documentCount: number
  subfolderCount: number
}

export type ProjectDocumentFolderPathItem = {
  id: string
  name: string
}

export async function fetchProjectDocumentFolders(jobId: string, parentId?: string | null) {
  const { data } = await api.get(`/jobs/${jobId}/document-folders`, {
    params: { parentId: parentId ?? 'root' },
  })
  return data as ProjectDocumentFolder[]
}

export async function fetchProjectDocumentFolderPath(jobId: string, folderId: string) {
  const { data } = await api.get(`/jobs/${jobId}/document-folders/${folderId}/path`)
  return data as ProjectDocumentFolderPathItem[]
}

export async function createProjectDocumentFolder(jobId: string, payload: { name: string; parentId?: string | null }) {
  const { data } = await api.post(`/jobs/${jobId}/document-folders`, payload)
  return data as ProjectDocumentFolder
}

export async function renameProjectDocumentFolder(jobId: string, folderId: string, name: string) {
  const { data } = await api.patch(`/jobs/${jobId}/document-folders/${folderId}`, { name })
  return data as ProjectDocumentFolder
}

export async function deleteProjectDocumentFolder(jobId: string, folderId: string) {
  const { data } = await api.delete(`/jobs/${jobId}/document-folders/${folderId}`)
  return data
}

export async function fetchLibraryDocumentsByJob(jobId: string, folderId?: string | null) {
  const params: { jobId: string; folderId?: string } = { jobId }
  if (folderId !== undefined) {
    params.folderId = folderId ?? 'root'
  }
  const { data } = await api.get(`/documents/library`, { params })
  return data
}

export async function updateLibraryDocument(id: string, payload: any) {
  const { data } = await api.patch(`/documents/library/${id}`, payload)
  return data
}

export async function deleteLibraryDocument(id: string) {
  const { data } = await api.delete(`/documents/library/${id}`)
  return data
}

export async function replaceLibraryDocumentFile(id: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.put(`/documents/library/${id}/file`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}


// --- PDF Template Editor (backend Prisma: PdfTemplate, PdfSubmission) ---

export interface PdfTemplateRecord {
  id: string
  name: string
  description?: string
  filePath?: string
  pageCount?: number
  assignedRoles?: string[]
  assignedUserIds?: string[]
  isActive?: boolean
  createdAt: string
}

export interface PdfSubmissionRecord {
  id: string
  templateId: string
  templateName?: string
  title?: string
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'AWAITING_SIGNATURES' | 'RESUBMIT_REQUIRED'
  submittedById?: string
  submittedBy?: { displayName: string }
  submittedAt?: string
  createdAt: string
  needsMySignature?: boolean
  signedSignatureCount?: number
  pendingSignatureCount?: number
  jobId?: string
  jobTitle?: string
  jobSiteName?: string
  resubmissionReason?: string
  resubmissionRequestedAt?: string
  resubmittedAt?: string
  /** Daily Hazard: true only after the user clicks Save draft. Always true for other templates. */
  userSavedDraft?: boolean
}

export async function fetchPdfTemplates(): Promise<PdfTemplateRecord[]> {
  const { data } = await api.get<PdfTemplateRecord[]>('/pdf-templates')
  return Array.isArray(data) ? data : []
}

export async function getPdfTemplate(id: string): Promise<PdfTemplateRecord & { fields?: Array<{ id: string; label?: string; type: string; page?: number; x?: number; y?: number; width?: number; height?: number; required?: boolean }> } | null> {
  try {
    const { data } = await api.get(`/pdf-templates/${id}`)
    return data
  } catch {
    return null
  }
}

export async function uploadPdfTemplate(file: File, name?: string): Promise<PdfTemplateRecord> {
  const form = new FormData()
  form.append('pdf', file)
  if (name) form.append('name', name)
  const { data } = await api.post<PdfTemplateRecord>('/pdf-templates', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function createCustomPdfTemplate(payload: {
  name: string
  description?: string
  assignedRoles?: string[]
  assignedUserIds?: string[]
  fields?: Array<{ type?: string; label?: string; required?: boolean }>
}): Promise<PdfTemplateRecord> {
  const { data } = await api.post<PdfTemplateRecord>('/pdf-templates/custom', payload)
  return data
}

export async function updatePdfTemplate(
  id: string,
  payload: { name?: string; description?: string; assignedRoles?: string[]; assignedUserIds?: string[]; fields?: Array<{ id?: string; type: string; label: string; page?: number; x?: number; y?: number; width?: number; height?: number; required?: boolean }> }
) {
  const { data } = await api.patch(`/pdf-templates/${id}`, payload)
  return data
}

export async function deletePdfTemplate(id: string): Promise<void> {
  await api.delete(`/pdf-templates/${id}`)
}

export async function fetchPdfSubmissions(params?: { submittedById?: string; titleSearch?: string; status?: string }): Promise<PdfSubmissionRecord[]> {
  const { data } = await api.get<PdfSubmissionRecord[]>('/pdf-submissions', { params })
  return Array.isArray(data) ? data : []
}

export interface PdfSubmissionDetailTemplate {
  id: string
  name: string
  filePath?: string
  pageCount?: number
  fields: Array<{
    id: string
    label?: string
    type: string
    page?: number
    x?: number
    y?: number
    width?: number
    height?: number
    required?: boolean
  }>
}

export interface PdfSubmissionDetail {
  id: string
  /** Optional custom title set on submit; falls back to template name in UI when absent */
  title?: string
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'AWAITING_SIGNATURES' | 'RESUBMIT_REQUIRED'
  createdAt: string
  jobId?: string
  job?: { id: string; title: string; siteName?: string }
  template: PdfSubmissionDetailTemplate
  values: Array<{ fieldId: string; value?: string | number | boolean }>
  signatures?: Array<{
    id: string
    signerRole?: string
    imageData?: string
    fieldId?: string
    signedAt?: string
    signerName?: string
    signer?: { displayName: string }
  }>
  signers?: Array<{
    id: string
    labourerUserId: string
    signatureStatus: 'pending' | 'signed' | string
    signedAt?: string
    signer?: { displayName: string }
  }>
  needsMySignature?: boolean
  pendingSignatureCount?: number
  finalPdfBlobPath?: string
  selectedToolboxTopic?: {
    id: string
    topicTitle: string
    summary?: string
    keyPoints?: string[]
    sourcePdfUrl: string
    sourcePageUrl?: string
  }
  extraPdfBlobPath?: string
  extraPdfOriginalName?: string
  submittedBy?: { displayName: string }
  resubmissionReason?: string
  resubmissionRequestedAt?: string
  resubmissionRequestedById?: string
  resubmissionRequestedBy?: { displayName: string }
  resubmittedAt?: string
  resubmissionHistory?: Array<{
    action: 'requested' | 'resubmitted' | string
    at: string
    byId?: string
    byName?: string
    reason?: string
  }>
  /** When set, each pending signer must sign the matching template signature field */
  signerFieldAssignments?: Array<{ labourerUserId: string; fieldId: string }>
}

export async function fetchPdfSubmission(id: string): Promise<{ submission: PdfSubmissionDetail | null; error?: string }> {
  try {
    const { data } = await api.get<PdfSubmissionDetail>(`/pdf-submissions/${id}`)
    return { submission: data }
  } catch (e: any) {
    const status = e?.response?.status
    const bodyMsg = e?.response?.data?.error
    if (status === 403) {
      return { submission: null, error: bodyMsg || 'You do not have access to this submission.' }
    }
    if (status === 401) {
      return { submission: null, error: bodyMsg || 'Please sign in again to view this submission.' }
    }
    const message = bodyMsg ?? e?.message ?? (status === 404 ? 'Submission not found' : 'Could not load submission')
    return { submission: null, error: message }
  }
}

export async function updatePdfSubmissionStatus(id: string, status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'AWAITING_SIGNATURES' | 'RESUBMIT_REQUIRED') {
  const { data } = await api.patch(`/pdf-submissions/${id}`, { status })
  return data
}

export async function deletePdfSubmission(id: string): Promise<void> {
  await api.delete(`/pdf-submissions/${id}`)
}

export async function deleteDraftPdfSubmissions(submissionIds: string[]): Promise<{ deleted: number }> {
  const { data } = await api.post('/pdf-submissions/bulk-delete-drafts', { submissionIds })
  return data
}

export async function exportMergedPdfSubmissions(submissionRefs: string[]): Promise<Blob> {
  try {
    const { data } = await api.post('/pdf-submissions/export-merged-pdf', { submissionRefs }, { responseType: 'blob' })
    return data
  } catch (e: any) {
    const status = e?.response?.status
    const payload = e?.response?.data
    let backendError = ''
    if (payload instanceof Blob) {
      const text = await payload.text().catch(() => '')
      if (text) {
        try {
          const parsed = JSON.parse(text)
          backendError = String(parsed?.error ?? parsed?.message ?? '').trim()
        } catch {
          backendError = text.trim()
        }
      }
    } else if (payload && typeof payload === 'object') {
      backendError = String(payload.error ?? payload.message ?? '').trim()
    }
    throw new Error(
      backendError ||
      (status ? `Export request failed (${status}).` : 'Export request failed.')
    )
  }
}

export async function approvePdfSubmission(id: string) {
  const { data } = await api.patch(`/pdf-submissions/${id}/approve`)
  return data
}

export async function requestPdfSubmissionResubmission(id: string, reason: string) {
  const { data } = await api.post(`/pdf-submissions/${id}/request-resubmission`, { reason })
  return data
}

/** Fetch PDF file from uploads (with auth). Returns blob. */
export async function fetchPdfBlob(filePath: string): Promise<Blob> {
  const path = filePath.startsWith('/') ? filePath : `/uploads/${filePath}`
  const { data } = await api.get<Blob>(path, { responseType: 'blob' })
  return data
}

export async function uploadPdfSubmissionExtraPdf(
  submissionId: string,
  file: File
): Promise<{ extraPdfBlobPath: string | null; extraPdfOriginalName: string | null }> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post(`/pdf-submissions/${submissionId}/extra-pdf`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export type ToolboxTopicRecord = {
  id: string
  topicTitle: string
  category?: string
  summary?: string
  keyPoints: string[]
  sourcePdfUrl: string
  sourcePageUrl?: string
  lastImportedAt?: string
  importStatus: string
  isActive: boolean
}

export async function fetchToolboxTopics(params?: {
  search?: string
  cursor?: string
  limit?: number
}): Promise<{ items: ToolboxTopicRecord[]; nextCursor: string | null }> {
  const { data } = await api.get('/toolbox-topics', { params })
  const items = Array.isArray(data?.items) ? data.items : []
  return {
    items,
    nextCursor: typeof data?.nextCursor === 'string' && data.nextCursor ? data.nextCursor : null,
  }
}

export async function attachToolboxTopicToSubmission(
  submissionId: string,
  topicId: string
): Promise<{
  selectedToolboxTopicId: string | null
  extraPdfBlobPath: string | null
  extraPdfOriginalName: string | null
}> {
  const { data } = await api.post(`/pdf-submissions/${submissionId}/topic/${topicId}/attach`)
  return data
}

export async function fetchSignatureRequests() {
  const { data } = await api.get('/signing')
  return data
}

export async function fetchSignatureRequest(id: string) {
  const { data } = await api.get(`/signing/${id}`)
  return data
}

export async function signRequest(id: string) {
  const { data } = await api.post(`/signing/${id}/sign`, {})
  return data
}

// --- PDF Form Assignments (supervisor → labourer) ---

export interface FormAssignmentRecord {
  id: string
  templateId: string
  templateName: string
  templatePageCount?: number
  assignedTo: string
  assignedToId: string
  assignedBy: string
  assignedById: string
  dueDate?: string
  recurrence?: string
  note?: string
  status: 'pending' | 'in_progress' | 'completed' | 'reviewed' | 'resubmission_required'
  submissionId?: string
  reviewComment?: string
  createdAt: string
  updatedAt: string
}

export async function fetchFormAssignments(params?: { status?: string; templateId?: string; assignedToId?: string }): Promise<FormAssignmentRecord[]> {
  const { data } = await api.get<FormAssignmentRecord[]>('/form-assignments', { params })
  return Array.isArray(data) ? data : []
}

export async function fetchFormAssignmentCounts(): Promise<{ pendingReview?: number; pending?: number; total?: number }> {
  const { data } = await api.get('/form-assignments/counts')
  return data
}

export async function createFormAssignment(payload: {
  templateId: string
  assignedToUserIds: string[]
  dueDate?: string
  recurrence?: 'once' | 'daily' | 'weekly' | 'monthly'
  note?: string
}) {
  const { data } = await api.post('/form-assignments', payload)
  return data
}

export async function submitFormAssignment(assignmentId: string, submissionId: string) {
  const { data } = await api.patch(`/form-assignments/${assignmentId}/submit`, { submissionId })
  return data
}

export async function reviewFormAssignment(assignmentId: string, action: 'reviewed' | 'resubmission_required', comment?: string) {
  const { data } = await api.patch(`/form-assignments/${assignmentId}/review`, { action, comment })
  return data
}

// --- Toolbox Talk Summary ---

export async function fetchToolboxTalkSummary(jobId: string): Promise<{
  total: number
  submitted: number
  approved: number
  recentTalks?: { id: string; title: string; date: string; status: string }[]
}> {
  const { data } = await api.get(`/pdf-submissions/by-job/${jobId}/toolbox-summary`)
  return data
}

export type AssignedPersonnelSubmission = {
  id: string
  title: string
  templateName: string
  status: 'SUBMITTED' | 'APPROVED' | 'AWAITING_SIGNATURES' | 'RESUBMIT_REQUIRED' | string
  submittedAt: string
  submittedById?: string
  submittedByName?: string
  submittedByRole?: string
}

export async function fetchAssignedPersonnelSubmissionsByJob(jobId: string): Promise<AssignedPersonnelSubmission[]> {
  const { data } = await api.get(`/pdf-submissions/by-job/${jobId}/assigned-submissions`)
  return Array.isArray(data) ? data : []
}
