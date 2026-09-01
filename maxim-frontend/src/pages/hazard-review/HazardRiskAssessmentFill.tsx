import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import SignatureModal from '@/components/pdf/SignatureModal'
import {
  fetchHazardSubmission,
  patchHazardSubmissionValues,
  submitHazardAssessment,
  type HazardField,
  type HazardSubmission,
} from '@/api/hazardReview'

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
  const options = (rest ?? '').split('|').map((s) => s.trim()).filter(Boolean)
  return { prompt: (q ?? '').trim() || 'Select', options }
}

function humanFieldLabel(label: string) {
  const d = parseDropdown(label)
  if (d) return d.prompt
  return label.trim()
}

export function HazardRiskAssessmentFill() {
  const { submissionId } = useParams<{ submissionId: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submission, setSubmission] = useState<(HazardSubmission & { fields?: HazardField[] }) | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [sigField, setSigField] = useState<{ id: string; label: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    if (!submissionId) return
    setLoading(true)
    setError(null)
    try {
      const sub = await fetchHazardSubmission(submissionId)
      setSubmission(sub as HazardSubmission & { fields?: HazardField[] })
      setValues({ ...(sub.fieldValues ?? {}) })
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setError(err?.response?.data?.error ?? 'Could not load submission')
    } finally {
      setLoading(false)
    }
  }, [submissionId])

  useEffect(() => {
    load()
  }, [load])

  const readOnly = submission?.status === 'SUBMITTED'

  async function saveValues(next: Record<string, string>) {
    if (!submissionId || readOnly) return
    setSaving(true)
    try {
      const updated = await patchHazardSubmissionValues(submissionId, next)
      setSubmission((prev) => (prev ? { ...prev, ...updated, fields: prev.fields } : updated as any))
    } catch {
      /* keep local */
    } finally {
      setSaving(false)
    }
  }

  function setField(id: string, v: string) {
    setValues((prev) => {
      const next = { ...prev, [id]: v }
      void saveValues(next)
      return next
    })
  }

  async function handleSubmit() {
    if (!submissionId || readOnly) return
    setSubmitting(true)
    setError(null)
    try {
      await submitHazardAssessment(submissionId)
      navigate('/hazard-review', { replace: true })
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setError(err?.response?.data?.error ?? 'Submit failed — check required fields.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-neutral-500">Loading…</div>
    )
  }

  if (error && !submission) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <p className="text-red-600 dark:text-red-400">{error}</p>
        <Link to="/hazard-review" className="text-brand-600 dark:text-brand-400 hover:underline">
          ← Back to Hazard Review
        </Link>
      </div>
    )
  }

  const fields = submission?.fields ?? []
  const meta = submission
    ? `${submission.templateKey} · ${readOnly ? 'Submitted' : 'Draft'}`
    : ''

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6 pb-24">
      <div>
        <Link to="/hazard-review" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
          ← Hazard Review
        </Link>
        <h1 className="text-2xl font-display font-semibold text-neutral-900 dark:text-white mt-2">
          Hazard risk assessment
        </h1>
        <p className="text-sm text-neutral-500 mt-1">{meta}</p>
        {saving && !readOnly && <p className="text-xs text-neutral-400 mt-1">Saving…</p>}
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {fields.map((field) => {
          if (isSectionLabel(field.label)) {
            return (
              <h2
                key={field.id}
                className="text-lg font-semibold text-neutral-900 dark:text-white border-b border-neutral-200 dark:border-neutral-700 pb-2"
              >
                {sectionTitle(field.label)}
              </h2>
            )
          }
          if (isInfoLabel(field.label)) {
            return (
              <p key={field.id} className="text-sm text-neutral-600 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-900/40 rounded-xl p-4 border border-neutral-200 dark:border-neutral-700">
                {infoBody(field.label)}
              </p>
            )
          }

          const dropdown = parseDropdown(field.label)
          const v = values[field.id] ?? ''
          const labelText = humanFieldLabel(field.label)
          const required = field.required

          if (dropdown) {
            return (
              <label key={field.id} className="block">
                <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  {labelText}
                  {required ? ' *' : ''}
                </span>
                <select
                  value={v}
                  disabled={readOnly}
                  onChange={(e) => setField(field.id, e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 text-sm text-neutral-900 dark:text-white disabled:opacity-60"
                >
                  <option value="">Select…</option>
                  {dropdown.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
            )
          }

          if (field.type === 'CHECKBOX') {
            return (
              <label key={field.id} className="flex items-center gap-3 rounded-xl border border-neutral-200 dark:border-neutral-700 p-3">
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={v === 'true'}
                  onChange={(e) => setField(field.id, e.target.checked ? 'true' : 'false')}
                  className="w-5 h-5 rounded accent-brand-600"
                />
                <span className="text-sm text-neutral-800 dark:text-neutral-200">
                  {field.label}
                  {required ? ' *' : ''}
                </span>
              </label>
            )
          }

          if (field.type === 'DATE') {
            return (
              <label key={field.id} className="block">
                <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  {labelText}
                  {required ? ' *' : ''}
                </span>
                <input
                  type="date"
                  disabled={readOnly}
                  value={v}
                  onChange={(e) => setField(field.id, e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 text-sm disabled:opacity-60"
                />
              </label>
            )
          }

          if (field.type === 'SIGNATURE') {
            return (
              <div key={field.id} className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-4">
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  {labelText}
                  {required ? ' *' : ''}
                </p>
                {readOnly ? (
                  v ? (
                    <img src={v} alt="" className="max-h-24 border rounded bg-white object-contain" />
                  ) : (
                    <p className="text-sm text-neutral-500">No signature</p>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={() => setSigField({ id: field.id, label: labelText })}
                    className="w-full min-h-[52px] border border-dashed rounded-lg flex items-center justify-center hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  >
                    {v ? (
                      <img src={v} alt="" className="max-h-20 object-contain" />
                    ) : (
                      <span className="text-sm text-neutral-500">Tap to sign</span>
                    )}
                  </button>
                )}
              </div>
            )
          }

          const multiline = field.label.length > 90 || String(field.label).toLowerCase().includes('controls')
          return (
            <label key={field.id} className="block">
              <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                {field.label}
                {required ? ' *' : ''}
              </span>
              {multiline ? (
                <textarea
                  disabled={readOnly}
                  value={v}
                  onChange={(e) => setField(field.id, e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm disabled:opacity-60"
                />
              ) : (
                <input
                  type="text"
                  disabled={readOnly}
                  value={v}
                  onChange={(e) => setField(field.id, e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 text-sm disabled:opacity-60"
                />
              )}
            </label>
          )
        })}
      </div>

      {!readOnly && (
        <Card padding="md">
          <CardHeader title="Submit" subtitle="Required fields must be completed before submit." />
          <div className="flex flex-wrap gap-3 mt-4">
            <Button type="button" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit assessment'}
            </Button>
          </div>
        </Card>
      )}

      {sigField && (
        <SignatureModal
          fieldLabel={sigField.label}
          onSave={(dataUrl) => {
            setField(sigField.id, dataUrl)
            setSigField(null)
          }}
          onClose={() => setSigField(null)}
        />
      )}
    </div>
  )
}
