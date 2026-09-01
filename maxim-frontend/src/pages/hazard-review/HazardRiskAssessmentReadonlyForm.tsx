import { useMemo } from 'react'
import type { HazardField } from '@/api/hazardReview'

function isSectionLabel(label: string) {
  return label.trim().startsWith('[SECTION]')
}

function isInfoLabel(label: string) {
  return label.trim().startsWith('[INFO]')
}

function sectionTitle(label: string) {
  return label.replace(/^\[SECTION\]\s*/i, '').trim() || 'Section'
}

function infoBody(label: string) {
  return label.replace(/^\[INFO\]\s*/i, '').trim()
}

function parseDropdown(label: string): { prompt: string; options: string[] } | null {
  const t = label.trim()
  let body = ''
  if (t.includes('[DROPDOWN][RISK]')) body = t.split('[DROPDOWN][RISK]')[1] ?? ''
  else if (t.startsWith('[DROPDOWN]')) body = t.replace(/^\[DROPDOWN\](\[RISK\])?/, '')
  else return null
  const [q, rest] = body.split('::')
  const options = (rest ?? '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
  return { prompt: (q ?? '').trim() || 'Select', options }
}

function humanFieldLabel(label: string) {
  const d = parseDropdown(label)
  if (d) return d.prompt
  return label.trim()
}

function truthy(v: string | undefined) {
  return String(v || '').toLowerCase() === 'true'
}

type ReadonlyFormProps = {
  fields: HazardField[]
  values: Record<string, string>
  searchQuery?: string
}

export function HazardRiskAssessmentReadonlyForm({ fields, values, searchQuery = '' }: ReadonlyFormProps) {
  const q = searchQuery.trim().toLowerCase()

  const visibleFieldIds = useMemo(() => {
    if (!q) return new Set(fields.map((f) => f.id))
    const ids = new Set<string>()
    for (const f of fields) {
      const value = values[f.id] ?? ''
      const labelText = humanFieldLabel(f.label)
      if (
        labelText.toLowerCase().includes(q) ||
        f.label.toLowerCase().includes(q) ||
        String(value).toLowerCase().includes(q)
      ) {
        ids.add(f.id)
      }
    }
    return ids
  }, [fields, values, q])

  const hasAnyMatch = visibleFieldIds.size > 0

  if (!hasAnyMatch) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-400">No matching fields for this search.</p>
  }

  return (
    <div className="space-y-5">
      {fields.map((field) => {
        if (!visibleFieldIds.has(field.id)) return null

        if (isSectionLabel(field.label)) {
          return (
            <h3
              key={field.id}
              className="text-base font-semibold text-neutral-900 dark:text-white border-b border-neutral-200 dark:border-neutral-700 pb-2"
            >
              {sectionTitle(field.label)}
            </h3>
          )
        }

        if (isInfoLabel(field.label)) {
          return (
            <p
              key={field.id}
              className="text-sm text-neutral-700 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-900/40 rounded-xl p-4 border border-neutral-200 dark:border-neutral-700"
            >
              {infoBody(field.label)}
            </p>
          )
        }

        const v = values[field.id] ?? ''
        const labelText = humanFieldLabel(field.label)

        if (field.type === 'CHECKBOX') {
          return (
            <div
              key={field.id}
              className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-3 flex items-center justify-between gap-3"
            >
              <p className="text-sm text-neutral-800 dark:text-neutral-200">{labelText}</p>
              <span
                className={`text-xs font-medium px-2 py-1 rounded ${
                  truthy(v)
                    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200'
                    : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                }`}
              >
                {truthy(v) ? 'Yes' : 'No'}
              </span>
            </div>
          )
        }

        if (field.type === 'SIGNATURE') {
          return (
            <div key={field.id} className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-4">
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">{labelText}</p>
              {v ? (
                <img src={v} alt="" className="max-h-24 border rounded bg-white object-contain" />
              ) : (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">No signature recorded.</p>
              )}
            </div>
          )
        }

        const valueText = v || '—'
        return (
          <div key={field.id} className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-4">
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{labelText}</p>
            <p className="text-sm text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap break-words">{valueText}</p>
          </div>
        )
      })}
    </div>
  )
}
