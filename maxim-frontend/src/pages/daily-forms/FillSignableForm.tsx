import { useState, useCallback, useMemo, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useSignableTemplates } from '@/contexts/SignableTemplatesContext'
import { useSignableSubmissions } from '@/contexts/SignableSubmissionsContext'
import { useUser } from '@/contexts/UserContext'
import { createSignableSubmission, fetchDailyFormsMyTeam } from '@/api/library'
import { fetchUsers } from '@/api/jobs'
import type { PlacedFormField } from '@/types'
import { KissFormShell } from '@/components/forms/kiss/KissFormShell'
import { KissField } from '@/components/forms/kiss/KissField'
import { KissValidationSummary } from '@/components/forms/kiss/KissValidationSummary'

export function FillSignableForm({ forceKissMode = false }: { forceKissMode?: boolean } = {}) {
  const { dailyFormId } = useParams()
  const navigate = useNavigate()
  const { user } = useUser()
  const { templates } = useSignableTemplates()
  const { dailyForms, addSubmission, refetchDailyForms, refetch } = useSignableSubmissions()
  const [users, setUsers] = useState<{ id: string; name: string; role: string }[]>([])
  const dailyForm = dailyFormId ? dailyForms.find((f) => f.id === dailyFormId) : undefined
  const template = templates.find((t) => t.id === dailyForm?.signableFormId)

  useEffect(() => {
    fetchUsers().then((list) => setUsers(list ?? [])).catch(() => { })
  }, [])
  const fields = template?.placedFields ?? []

  const [values, setValues] = useState<Record<string, string>>(dailyForm?.formDataSnapshot ?? {})
  useEffect(() => {
    if (dailyForm?.formDataSnapshot && Object.keys(values).length === 0) {
      setValues(dailyForm.formDataSnapshot)
    }
  }, [dailyForm?.formDataSnapshot])
  const [signatureText, setSignatureText] = useState(user?.name ?? '')
  const [, setGeo] = useState<{ lat: number; lng: number; address?: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [sendToLabourers, setSendToLabourers] = useState(false)
  const [selectedLabourerIds, setSelectedLabourerIds] = useState<string[]>([])

  // "Send to team for signatures" flow: one form, labourers sign first → supervisor signs → then to HR
  const [fillMyself, setFillMyself] = useState(true)
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([])
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sendSuccess, setSendSuccess] = useState(false)
  const [missingLabels, setMissingLabels] = useState<string[]>([])
  const isKissMode = forceKissMode

  const isSupervisor = user?.role === 'supervisor'
  const myLabourers = useMemo(() => users.filter((u) => u.role === 'labourer'), [users])
  const hasLabourers = myLabourers.length > 0

  useEffect(() => {
    if (isSupervisor && !fillMyself) fetchDailyFormsMyTeam().then(setTeamMembers).catch(() => setTeamMembers([]))
  }, [isSupervisor, fillMyself])

  const handleSendToTeamForSignatures = async () => {
    if (!template || !user?.id || selectedTeamIds.length === 0) {
      setSendError('Select at least one team member.')
      return
    }
    setSendError(null)
    setSending(true)
    captureGeo()
    const fieldValues: Record<string, string> = { ...values }
    fields.forEach((f) => {
      if (f.type === 'signature') fieldValues[f.id] = signatureText.trim()
      else if (values[f.id] !== undefined) fieldValues[f.id] = values[f.id]
    })
    try {
      await createSignableSubmission({
        signableFormId: template.id,
        templateName: template.name,
        dailyFormId: dailyForm?.id,
        fieldValues,
        signatureText: '', // supervisor signs when form comes back
        workflowType: 'site_meeting',
        siteSignerIds: [...selectedTeamIds, user.id], // labourers first, supervisor last
      })
      await refetchDailyForms()
      await refetch()
      setSendSuccess(true)
    } catch (e: any) {
      setSendError(e?.response?.data?.message || e?.message || 'Failed to send form.')
    } finally {
      setSending(false)
    }
  }

  const hasPosition = (f: PlacedFormField) => typeof f.x === 'number' && typeof f.y === 'number'
  const fieldsOnPdf = fields.filter(hasPosition)
  const fieldsListOnly = fields.filter((f) => !hasPosition(f))

  const captureGeo = useCallback(() => {
    if (!navigator.geolocation) {
      setGeo({ lat: 49.2827, lng: -123.1207, address: 'Location unavailable' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude, address: undefined }),
      () => setGeo({ lat: 49.2827, lng: -123.1207, address: 'Permission denied' })
    )
  }, [])

  const submit = async () => {
    const required = fields.filter((f) => f.required)
    const missing = required.filter((f) => (f.type === 'signature' ? !signatureText.trim() : !values[f.id]?.trim()))
    if (missing.length > 0) {
      setMissingLabels(missing.map((f) => f.label || 'Required field'))
      if (!isKissMode) {
        alert(`Please fill: ${missing.map((f) => f.label).join(', ')}`)
      }
      return
    }
    setMissingLabels([])
    if (sendToLabourers && selectedLabourerIds.length === 0) {
      alert('Select at least one labourer to send the form to for signing.')
      return
    }
    setLoading(true)
    captureGeo()
    const fieldValues: Record<string, string> = { ...values }
    fields.forEach((f) => {
      if (f.type === 'signature') fieldValues[f.id] = signatureText.trim()
    })
    const now = new Date().toISOString()
    const payload = {
      signableFormId: template!.id,
      templateName: template!.name,
      dailyFormId: dailyForm!.id,
      submittedBy: user?.name ?? 'Unknown',
      submittedAt: now,
      fieldValues,
      signatureText: signatureText.trim(),
      ...(sendToLabourers && selectedLabourerIds.length > 0
        ? { workflowType: 'site_meeting' as const, siteSignerIds: selectedLabourerIds, siteSignatures: [] }
        : {}),
    }
    try {
      const created = await createSignableSubmission(payload)
      addSubmission({
        id: created.id,
        signableFormId: created.signableFormId,
        templateName: created.templateName ?? template!.name,
        dailyFormId: created.dailyFormId ?? dailyForm!.id,
        submittedBy: created.submittedBy ?? user?.name ?? 'Unknown',
        submittedAt: created.submittedAt ?? now,
        fieldValues: created.fieldValues ?? fieldValues,
        signatureText: created.signatureText ?? signatureText.trim(),
        workflowType: created.workflowType,
        siteSignerIds: created.siteSignerIds,
        siteSignatures: created.siteSignatures ?? [],
      })
      await refetchDailyForms()
      setSubmitted(true)
    } catch {
      setLoading(false)
    } finally {
      setLoading(false)
    }
  }

  if (!dailyForm || !template) {
    return (
      <div className="space-y-4 animate-fade-in">
        <p className="text-neutral-500 dark:text-neutral-400">Form not found.</p>
        <Link to="/daily-forms" className="text-brand-600 dark:text-brand-400 hover:underline">Back to daily forms</Link>
      </div>
    )
  }

  if (fields.length === 0) {
    return (
      <div className="space-y-4 animate-fade-in">
        <p className="text-neutral-500 dark:text-neutral-400">This form has no fillable fields. Use Custom forms to add fields.</p>
        <Link to="/daily-forms" className="text-brand-600 dark:text-brand-400 hover:underline">Back to daily forms</Link>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto space-y-6 animate-fade-in">
        <Card padding="lg" className="text-center">
          <div className="text-5xl text-emerald-500 mb-4">✓</div>
          <CardHeader>Form Submitted</CardHeader>
          <CardDescription>Your responses and signature have been saved.</CardDescription>
          <Button className="mt-4" onClick={() => navigate('/daily-forms')}>Back to daily forms</Button>
        </Card>
      </div>
    )
  }

  if (sendSuccess) {
    return (
      <div className="max-w-xl mx-auto space-y-6 animate-fade-in">
        <Card padding="lg" className="text-center">
          <div className="text-5xl text-emerald-500 mb-4">✓</div>
          <CardHeader>Form Sent for Signatures</CardHeader>
          <CardDescription>
            Your team will sign first, then the form will return to you to sign. After you sign, it is sent to HR.
          </CardDescription>
          <Button className="mt-4" onClick={() => navigate('/daily-forms')}>Back to daily forms</Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Link to="/daily-forms" className="touch-target p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </Link>
        <div>
          <h1 className="font-display font-bold text-xl text-neutral-900 dark:text-white">{template.name}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Due {new Date(dailyForm.dueDate).toLocaleDateString()}</p>
        </div>
      </div>

      {/* Supervisor: choose to fill yourself or assign to team to fill and sign */}
      {isSupervisor && (
        <Card padding="lg">
          <CardHeader className="text-base">How Do You Want to Complete This Form?</CardHeader>
          <CardDescription>Fill it yourself and sign, or send one form to your team: they sign first, then it returns to you to sign, then to HR.</CardDescription>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setFillMyself(true)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${fillMyself ? 'bg-brand-600 text-white' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-600'}`}
            >
              I’ll fill and sign myself
            </button>
            <button
              type="button"
              onClick={() => setFillMyself(false)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${!fillMyself ? 'bg-brand-600 text-white' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-600'}`}
            >
              Send to team for signatures (they sign → you sign → HR)
            </button>
          </div>
          {!fillMyself && (
            <div className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Who must sign (in order: they sign first, then you)</label>
                <div className="border border-neutral-300 dark:border-neutral-600 rounded-xl p-3 bg-neutral-50 dark:bg-neutral-800/50 max-h-40 overflow-y-auto space-y-2">
                  {teamMembers.length === 0 ? (
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading your team…</p>
                  ) : (
                    teamMembers.map((m) => (
                      <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedTeamIds.includes(m.id)}
                          onChange={() => setSelectedTeamIds((ids) => (ids.includes(m.id) ? ids.filter((x) => x !== m.id) : [...ids, m.id]))}
                          className="rounded border-neutral-400"
                        />
                        <span className="text-neutral-900 dark:text-white">{m.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">You can fill fields above before sending; your signature will be added when the form comes back to you.</p>
              {sendError && <p className="text-sm text-red-600 dark:text-red-400">{sendError}</p>}
              <Button onClick={handleSendToTeamForSignatures} disabled={sending || selectedTeamIds.length === 0} className="w-full">
                {sending ? 'Sending…' : 'Send to team for signatures'}
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Form fields and submit — only when filling yourself */}
      {fillMyself && (
        <>
          {isKissMode && (
            <KissFormShell
              title={template.name}
              description="Complete required items first, then submit."
              currentStep={0}
              totalSteps={1}
              onSubmit={submit}
              submitDisabled={loading}
            >
              <KissValidationSummary missingLabels={missingLabels} />
              <div className="space-y-3">
                {[...fields].sort((a, b) => Number(Boolean(b.required)) - Number(Boolean(a.required))).map((f) => (
                  <div key={f.id}>
                    {f.type === 'signature' ? (
                      <KissField
                        id={f.id}
                        label={`Signature: ${f.label}`}
                        required={f.required}
                        value={signatureText}
                        onChange={(val) => setSignatureText(String(val))}
                        placeholder="Type your full name"
                      />
                    ) : f.type === 'date' ? (
                      <KissField
                        id={f.id}
                        type="date"
                        label={f.label}
                        required={f.required}
                        value={values[f.id] ?? ''}
                        onChange={(val) => setValues((v) => ({ ...v, [f.id]: String(val) }))}
                      />
                    ) : (
                      <KissField
                        id={f.id}
                        label={f.label}
                        required={f.required}
                        value={values[f.id] ?? ''}
                        onChange={(val) => setValues((v) => ({ ...v, [f.id]: String(val) }))}
                        placeholder={f.label}
                      />
                    )}
                  </div>
                ))}
              </div>
            </KissFormShell>
          )}

          {!isKissMode && fieldsOnPdf.length > 0 && (
            <>
              {/* Desktop/Tablet View: Interactive PDF Overlay */}
              <div className="hidden md:block">
                <Card padding="lg">
                  <CardHeader>Fill in the Form</CardHeader>
                  <CardDescription>Complete each field on the document below.</CardDescription>
                  <div className="mt-4 overflow-x-auto -mx-4 px-4 pb-4">
                    <div
                      className="relative mx-auto bg-white dark:bg-neutral-100 shadow-lg border border-neutral-300 dark:border-neutral-600 rounded-sm overflow-visible"
                      style={{ aspectRatio: '210/297', width: '100%', minWidth: '800px' }}
                    >
                      {/* Document background */}
                      <div className="absolute inset-0 p-6 text-neutral-400 dark:text-neutral-500 text-sm pointer-events-none select-none">
                        <div className="border-b border-neutral-200 dark:border-neutral-400 pb-2 mb-4 font-medium">{template.name}</div>
                        <div className="space-y-2 opacity-60">
                          <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                          <p>Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
                          <p>Ut enim ad minim veniam, quis nostrud exercitation.</p>
                        </div>
                      </div>
                      {/* Input overlays at saved positions */}
                      {fieldsOnPdf.map((f) => (
                        <div
                          key={f.id}
                          className="absolute z-10 flex flex-col"
                          style={{
                            left: `${f.x ?? 0}%`,
                            top: `${f.y ?? 0}%`,
                            width: `${f.width ?? 28}%`,
                            height: `${f.height ?? 6}%`,
                          }}
                        >
                          {f.type === 'signature' ? (
                            <>
                              <label className="text-[10px] font-medium text-neutral-600 dark:text-neutral-400 truncate">{f.label}{f.required && <span className="text-red-500 dark:text-red-400"> *</span>}</label>
                              <input
                                type="text"
                                value={signatureText}
                                onChange={(e) => setSignatureText(e.target.value)}
                                placeholder="Type your name"
                                className="flex-1 min-h-0 w-full px-1 py-0.5 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                              />
                            </>
                          ) : f.type === 'date' ? (
                            <>
                              <label className="text-[10px] font-medium text-neutral-600 dark:text-neutral-400 truncate">{f.label}{f.required && <span className="text-red-500 dark:text-red-400"> *</span>}</label>
                              <input
                                type="date"
                                value={values[f.id] ?? ''}
                                onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                                className="flex-1 min-h-0 w-full px-1 py-0.5 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white disabled:opacity-70"
                                aria-label={f.label}
                                disabled={!!dailyForm?.formDataSnapshot?.[f.id]}
                              />
                            </>
                          ) : (
                            <>
                              <label className="text-[10px] font-medium text-neutral-600 dark:text-neutral-400 truncate">{f.label}{f.required && <span className="text-red-500 dark:text-red-400"> *</span>}</label>
                              <input
                                type="text"
                                value={values[f.id] ?? ''}
                                onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                                placeholder={f.label}
                                className="flex-1 min-h-0 w-full px-1 py-0.5 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white disabled:opacity-70"
                                disabled={!!dailyForm?.formDataSnapshot?.[f.id]}
                              />
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              </div>

              {/* Mobile View: Vertical Form Stack */}
              <div className="block md:hidden">
                <Card padding="lg">
                  <CardHeader>Fill in the Form</CardHeader>
                  <CardDescription>Complete each field below.</CardDescription>
                  <div className="mt-4 space-y-4">
                    {fieldsOnPdf.map((f) => (
                      <div key={f.id}>
                        {f.type === 'signature' ? (
                          <Input label={`Signature: ${f.label}`} value={signatureText} onChange={(e) => setSignatureText(e.target.value)} placeholder="Type your name" required={f.required} />
                        ) : f.type === 'date' ? (
                          <Input label={f.label} type="date" value={values[f.id] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))} required={f.required && !dailyForm?.formDataSnapshot?.[f.id]} disabled={!!dailyForm?.formDataSnapshot?.[f.id]} />
                        ) : (
                          <Input label={f.label} value={values[f.id] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))} placeholder={f.label} required={f.required && !dailyForm?.formDataSnapshot?.[f.id]} disabled={!!dailyForm?.formDataSnapshot?.[f.id]} />
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </>
          )}

          {/* Fallback: list of fields without position (or all if none have position) */}
          {!isKissMode && fieldsListOnly.length > 0 && (
            <Card padding="lg">
              <CardHeader>{fieldsOnPdf.length > 0 ? 'Additional fields' : 'Fill out the form'}</CardHeader>
              <CardDescription>Complete all required fields and sign.</CardDescription>
              <div className="mt-4 space-y-4">
                {fieldsListOnly.filter((f) => f.type !== 'signature').map((f) => (
                  <div key={f.id}>
                    {f.type === 'date' ? (
                      <Input label={f.label} type="date" value={values[f.id] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))} required={f.required && !dailyForm?.formDataSnapshot?.[f.id]} disabled={!!dailyForm?.formDataSnapshot?.[f.id]} />
                    ) : (
                      <Input label={f.label} value={values[f.id] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))} required={f.required && !dailyForm?.formDataSnapshot?.[f.id]} disabled={!!dailyForm?.formDataSnapshot?.[f.id]} />
                    )}
                  </div>
                ))}
                {fieldsListOnly.some((f) => f.type === 'signature') && (
                  <div>
                    <Input label="Signature (type your full name)" value={signatureText} onChange={(e) => setSignatureText(e.target.value)} placeholder="Full name" required />
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* If all fields are on PDF, we still need a signature if it's in fieldsOnPdf (already rendered above). Show submit and note. */}
          {!isKissMode && fieldsOnPdf.length > 0 && !fieldsListOnly.some((f) => f.type === 'signature') && fields.some((f) => f.type === 'signature') && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Sign in the signature field on the document above.</p>
          )}

          {isSupervisor && (
            <Card padding="md">
              <CardHeader className="text-base">Send to Labourers to Sign</CardHeader>
              <CardDescription>After you sign, your labourers can add their signature. They will see this form under Forms & Documents → Signing or Daily Forms → Waiting for your signature.</CardDescription>
              {hasLabourers ? (
                <>
                  <label className="mt-3 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendToLabourers}
                      onChange={(e) => { setSendToLabourers(e.target.checked); if (!e.target.checked) setSelectedLabourerIds([]) }}
                      className="rounded border-neutral-300 text-brand-600"
                    />
                    <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Also send to my labourers to sign</span>
                  </label>
                  {sendToLabourers && (
                    <div className="mt-3 pl-6 space-y-2">
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">Select who must sign:</p>
                      {myLabourers.map((lab) => (
                        <label key={lab.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedLabourerIds.includes(lab.id)}
                            onChange={(e) => setSelectedLabourerIds((ids) => e.target.checked ? [...ids, lab.id] : ids.filter((i) => i !== lab.id))}
                            className="rounded border-neutral-300 text-brand-600"
                          />
                          <span className="text-sm text-neutral-800 dark:text-neutral-200">{lab.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">You have no labourers assigned to your jobs. Assign labourers in <Link to="/jobs" className="text-brand-600 dark:text-brand-400 hover:underline">Job Management</Link> (or as supervisor on a job in My Jobs) to send forms for their signature.</p>
              )}
            </Card>
          )}

          {!isKissMode && <Button className="w-full" onClick={submit} disabled={loading}>{loading ? 'Submitting…' : 'Submit'}</Button>}
        </>
      )}
    </div>
  )
}
