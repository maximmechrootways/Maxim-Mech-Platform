import { api } from '@/api'

export type HazardTemplateMeta = {
  key: string
  title: string
  shortLabel: string
  description: string
}

export type HazardField = {
  id: string
  /** Stable key within template (e.g. risk_likelihood); survives label text changes. */
  stableId?: string
  type: string
  label: string
  required: boolean
}

export type HazardSubmission = {
  id: string
  templateKey: string
  status: string
  fieldValues: Record<string, string>
  jobId: string | null
  submittedById: string
  submittedAt: string | null
  createdAt: string
  updatedAt: string
  fields?: HazardField[]
  submittedBy?: { id: string; name: string; email: string; role: string }
  job?: { id: string; title: string; siteId?: string } | null
}

export type HazardComment = {
  id: string
  templateKey: string
  body: string
  authorId: string
  authorName: string
  createdAt: string
  deletedAt: string | null
  hrRemark: string | null
  hrRemarkAt: string | null
  hrRemarkByName: string | null
}

export async function fetchHazardTemplates() {
  const { data } = await api.get<HazardTemplateMeta[]>('/hazard-review/templates')
  return data
}

export async function fetchHazardSubmission(id: string) {
  const { data } = await api.get<HazardSubmission>(`/hazard-review/submissions/${id}`)
  return data
}

export async function createHazardSubmission(templateKey: string, jobId?: string | null) {
  const { data } = await api.post<HazardSubmission>('/hazard-review/submissions', { templateKey, jobId: jobId || undefined })
  return data
}

export async function patchHazardSubmissionValues(id: string, fieldValues: Record<string, string>) {
  const { data } = await api.patch<HazardSubmission>(`/hazard-review/submissions/${id}/values`, { fieldValues })
  return data
}

export async function submitHazardAssessment(id: string) {
  const { data } = await api.post<HazardSubmission>(`/hazard-review/submissions/${id}/submit`, {})
  return data
}

export async function fetchHazardSubmissions(params?: {
  templateKey?: string
  status?: string
  q?: string
  /** When `template_library` with templateKey + SUBMITTED: list all completed rows for that template (every role). */
  scope?: 'template_library'
  /** Filter to submissions whose linked job is on this site (completed hazard assessments per site). */
  siteId?: string
}) {
  const { data } = await api.get<HazardSubmission[]>('/hazard-review/submissions', { params })
  return data
}

export async function fetchHazardTemplateFields(templateKey: string) {
  const { data } = await api.get<{ templateKey: string; fields: HazardField[] }>(
    `/hazard-review/templates/${encodeURIComponent(templateKey)}/fields`
  )
  return data.fields
}

export async function deleteHazardSubmission(id: string) {
  const { data } = await api.delete<{ ok: boolean }>(`/hazard-review/submissions/${id}`)
  return data
}

/** Comments for one hazard template (message board on the assessment PDF page). */
export async function fetchHazardCommentsForTemplate(templateKey: string) {
  const { data } = await api.get<HazardComment[]>('/hazard-review/comments', {
    params: { templateKey },
  })
  return data
}

export async function postHazardComment(body: string, templateKey: string) {
  const { data } = await api.post<HazardComment>('/hazard-review/comments', { body, templateKey })
  return data
}

export async function moderateHazardComment(commentId: string, action: 'delete' | 'remark', remark?: string) {
  const { data } = await api.patch<{ ok: boolean }>(`/hazard-review/comments/${commentId}`, { action, remark })
  return data
}

export type HazardCustomDocumentMeta = {
  id: string
  templateKey: string
  shortLabel: string
  title: string
  description: string
  createdAt: string
  updatedAt: string
}

export type HazardReviewCatalog = {
  customDocuments?: HazardCustomDocumentMeta[]
  staticHiddenTemplateKeys?: string[]
  staticOverrideTemplateKeys?: string[]
}

export async function fetchHazardReviewCatalog() {
  const { data } = await api.get<HazardReviewCatalog>('/hazard-review/catalog')
  return data
}

/** @deprecated prefer fetchHazardReviewCatalog */
export async function fetchHazardCustomDocuments() {
  const { data } = await api.get<HazardCustomDocumentMeta[]>('/hazard-review/custom-documents')
  return data
}

export async function createHazardCustomDocument(shortLabel: string, file: File) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('shortLabel', shortLabel)
  const { data } = await api.post<HazardCustomDocumentMeta>('/hazard-review/custom-documents', fd)
  return data
}

export async function updateHazardCustomDocumentLabel(id: string, shortLabel: string) {
  const { data } = await api.patch<HazardCustomDocumentMeta>(`/hazard-review/custom-documents/${id}`, { shortLabel })
  return data
}

export async function replaceHazardCustomDocumentFile(id: string, file: File) {
  const fd = new FormData()
  fd.append('file', file)
  const { data } = await api.put<{ id: string; templateKey: string; filePath: string }>(
    `/hazard-review/custom-documents/${id}/file`,
    fd
  )
  return data
}

export async function deleteHazardCustomDocument(id: string) {
  const { data } = await api.delete<{ ok: boolean }>(`/hazard-review/custom-documents/${id}`)
  return data
}

export async function fetchHazardCustomDocumentViewUrl(id: string) {
  const { data } = await api.get<{ url: string }>(`/hazard-review/custom-documents/${id}/view-url`)
  return data.url
}

export async function fetchHazardStaticOverrideViewUrl(templateKey: string) {
  const enc = encodeURIComponent(templateKey)
  const { data } = await api.get<{ url: string }>(`/hazard-review/static-library/${enc}/view-url`)
  return data.url
}

export async function replaceHazardStaticTemplatePdf(templateKey: string, file: File) {
  const fd = new FormData()
  fd.append('file', file)
  const enc = encodeURIComponent(templateKey)
  const { data } = await api.put<{ templateKey: string; ok: boolean }>(
    `/hazard-review/static-library/${enc}/file`,
    fd
  )
  return data
}

export async function hideHazardStaticTemplate(templateKey: string) {
  const enc = encodeURIComponent(templateKey)
  const { data } = await api.delete<{ ok: boolean }>(`/hazard-review/static-library/${enc}`)
  return data
}
