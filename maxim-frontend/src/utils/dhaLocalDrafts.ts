/** Browser-local drafts for /forms/daily-hazard-analysis (legacy standalone form). */

export type DhaLocalDraftRecord = {
  id: string
  updatedAt: string
  label: string
  payload: Record<string, unknown>
}

const multiKey = (userId: string) => `maxim:daily-hazard-analysis:drafts:${userId}`
const legacyKey = (userId: string) => `maxim:daily-hazard-analysis:draft:${userId}`

function readStore(userId: string): DhaLocalDraftRecord[] {
  try {
    const raw = localStorage.getItem(multiKey(userId))
    if (raw) {
      const parsed = JSON.parse(raw) as { drafts?: DhaLocalDraftRecord[] }
      return Array.isArray(parsed?.drafts) ? parsed.drafts : []
    }
    const legacyRaw = localStorage.getItem(legacyKey(userId))
    if (!legacyRaw) return []
    const legacyPayload = JSON.parse(legacyRaw) as Record<string, unknown>
    const migrated: DhaLocalDraftRecord = {
      id: `legacy-${Date.now()}`,
      updatedAt: new Date().toISOString(),
      label: draftLabelFromPayload(legacyPayload),
      payload: legacyPayload,
    }
    writeStore(userId, [migrated])
    localStorage.removeItem(legacyKey(userId))
    return [migrated]
  } catch {
    return []
  }
}

function writeStore(userId: string, drafts: DhaLocalDraftRecord[]) {
  localStorage.setItem(multiKey(userId), JSON.stringify({ drafts }))
}

export function draftLabelFromPayload(payload: Record<string, unknown>): string {
  const project = String(payload.project ?? '').trim()
  const date = String(payload.date ?? '').trim()
  if (project && date) return `${date} · ${project}`
  if (date) return date
  if (project) return project
  return 'Daily Hazard Analysis draft'
}

export function listDhaLocalDrafts(userId: string): DhaLocalDraftRecord[] {
  return readStore(userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function loadDhaLocalDraft(userId: string, draftId: string): DhaLocalDraftRecord | null {
  return readStore(userId).find((d) => d.id === draftId) ?? null
}

export function saveDhaLocalDraft(
  userId: string,
  draftId: string,
  payload: Record<string, unknown>
): DhaLocalDraftRecord {
  const drafts = readStore(userId)
  const now = new Date().toISOString()
  const label = draftLabelFromPayload(payload)
  const existingIdx = drafts.findIndex((d) => d.id === draftId)
  const record: DhaLocalDraftRecord = { id: draftId, updatedAt: now, label, payload }
  if (existingIdx >= 0) drafts[existingIdx] = record
  else drafts.unshift(record)
  writeStore(userId, drafts)
  return record
}

export function removeDhaLocalDraft(userId: string, draftId: string) {
  writeStore(
    userId,
    readStore(userId).filter((d) => d.id !== draftId)
  )
}

export function hasAnyDhaLocalDraft(userId: string): boolean {
  return readStore(userId).length > 0
}
