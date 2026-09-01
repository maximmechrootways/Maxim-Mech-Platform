import { api } from '@/api'

export type QualityFindingListRow = {
  id: string
  sourceType: string
  sourceId: string
  ruleCode: string
  ruleVersion: number
  severity: string
  templateId: string | null
  templateNameSnapshot: string | null
  fieldId: string | null
  fieldLabelSnapshot: string | null
  valueSnapshot: string | null
  linkedJobId: string | null
  detectedAt: string
  /** Same calendar date as the form review subtitle (submission createdAt). */
  formSubmittedAt: string | null
  acknowledgedAt: string | null
  submissionTitle: string | null
  submissionTemplateName: string | null
  submissionStatus: string | null
  submittedByDisplay: string | null
}

export async function fetchQualityFindingsSummary(): Promise<{
  openCount: number
  resolvedCount: number
  byRule: Record<string, number>
}> {
  const { data } = await api.get<{ openCount: number; resolvedCount: number; byRule: Record<string, number> }>(
    '/quality-findings/summary'
  )
  return data
}

/** Collapse duplicate rows in DB (same field id or same checklist label+value per submission). */
export async function postDedupeQualityFindings(): Promise<void> {
  await api.post('/quality-findings/dedupe')
}

/** Re-scan all non-draft PDF submissions so substandard checklist rows appear in Form Red Flags. */
export async function postSyncQualityFindingsFromCompletedForms(): Promise<{ processed: number; failed: number }> {
  const { data } = await api.post<{ processed: number; failed: number }>('/quality-findings/sync-from-completed-forms')
  return data
}

/** Mark a flag as reviewed (no longer in the open queue). */
export async function postAcknowledgeQualityFinding(findingId: string): Promise<void> {
  await api.post(`/quality-findings/${encodeURIComponent(findingId)}/acknowledge`)
}

export async function fetchQualityFindings(params?: {
  /** open | resolved | all */
  queue?: 'open' | 'resolved' | 'all'
  from?: string
  to?: string
  templateId?: string
  ruleCode?: string
  linkedJobId?: string
  /** Case-insensitive: matches submission title or template name */
  formName?: string
  limit?: number
  offset?: number
}): Promise<{ rows: QualityFindingListRow[]; total: number }> {
  const { data } = await api.get<{ rows: QualityFindingListRow[]; total: number }>('/quality-findings', {
    params: {
      queue: params?.queue ?? 'open',
      from: params?.from,
      to: params?.to,
      templateId: params?.templateId,
      ruleCode: params?.ruleCode,
      linkedJobId: params?.linkedJobId,
      formName: params?.formName?.trim() || undefined,
      limit: params?.limit,
      offset: params?.offset,
    },
  })
  return data
}
