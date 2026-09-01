/**
 * Shared validation for hazard risk assessment submissions (mirrors frontend rules).
 */
import { getHazardRiskTemplateFieldsWithIds, type HraFieldWithId } from './hazardRiskAssessmentTemplateFields'

function isSectionLabel(label: string) {
  return label.trim().startsWith('[SECTION]')
}

function isInfoLabel(label: string) {
  return label.trim().startsWith('[INFO]')
}

/** User-facing label for errors (dropdowns, plain text). */
export function humanReadableFieldLabel(label: string): string {
  let x = label.trim()
  if (x.startsWith('[DROPDOWN]')) {
    x = x.slice('[DROPDOWN]'.length)
    if (x.startsWith('[RISK]')) x = x.slice('[RISK]'.length)
    const [q] = x.split('::')
    return (q ?? '').trim() || 'Field'
  }
  return x
}

function fieldBlocksSubmit(f: HraFieldWithId): boolean {
  if (isSectionLabel(f.label) || isInfoLabel(f.label)) return false
  return f.required
}

/**
 * Returns an error message if invalid, or null if all required inputs are present.
 */
export function validateHazardSubmissionFieldValues(
  templateKey: string,
  fieldValues: Record<string, string>
): string | null {
  const fields = getHazardRiskTemplateFieldsWithIds(templateKey)
  if (!fields) return 'Invalid template'

  for (const f of fields) {
    if (!fieldBlocksSubmit(f)) continue
    const v = String(fieldValues[f.id] ?? '').trim()
    if (!v) {
      return `Please complete: ${humanReadableFieldLabel(f.label)}`
    }
  }
  return null
}

/** Keep only keys that belong to the current template (drops stale / forged keys). */
export function sanitizeFieldValuesForTemplate(
  templateKey: string,
  fieldValues: Record<string, string>
): Record<string, string> {
  const fields = getHazardRiskTemplateFieldsWithIds(templateKey)
  if (!fields) return {}
  const allowed = new Set(fields.map((f) => f.id))
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(fieldValues)) {
    if (allowed.has(k)) out[k] = v
  }
  return out
}
