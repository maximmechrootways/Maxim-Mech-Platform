import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useSignableSubmissions } from '@/contexts/SignableSubmissionsContext'
import { useSignableTemplates } from '@/contexts/SignableTemplatesContext'
import { useUser } from '@/contexts/UserContext'
import { updateSignableSubmission } from '@/api/library'

export function SignSignableForm() {
  const { submissionId } = useParams()
  const navigate = useNavigate()
  const { user } = useUser()
  const { getSubmission, fetchSubmission, updateSubmission, refetch } = useSignableSubmissions()
  const { templates } = useSignableTemplates()
  const submission = submissionId ? getSubmission(submissionId) : undefined
  const template = submission ? templates.find((t) => t.id === submission.signableFormId) : undefined
  const [loadingSubmission, setLoadingSubmission] = useState(!!submissionId)

  useEffect(() => {
    if (!submissionId) return
    setLoadingSubmission(true)
    fetchSubmission(submissionId)
      .catch(() => {})
      .finally(() => setLoadingSubmission(false))
  }, [submissionId, fetchSubmission])

  const [signatureText, setSignatureText] = useState(user?.name ?? '')
  const [loading, setLoading] = useState(false)
  const [signed, setSigned] = useState(false)
  const [inPersonSignerId, setInPersonSignerId] = useState('')
  const [inPersonSignatureText, setInPersonSignatureText] = useState('')
  const [addingInPerson, setAddingInPerson] = useState(false)

  const siteSignerIds = submission?.siteSignerIds ?? []
  const siteSignatures = submission?.siteSignatures ?? []
  const signedIds = new Set(siteSignatures.map((s) => s.userId))
  const pendingSignerIds = siteSignerIds.filter((id) => !signedIds.has(id))
  const isSubmissionOwner = user?.id && submission?.submittedById === user.id
  const isSiteSigner = user?.id && siteSignerIds.includes(user.id)
  const hasSigned = user?.id && signedIds.has(user.id)
  const onlySupervisorPending = pendingSignerIds.length === 1 && pendingSignerIds[0] === user?.id
  const canCollectInPerson = isSubmissionOwner && pendingSignerIds.length > 0 && !onlySupervisorPending

  const getName = (userId: string) => submission?.siteSignerNames?.[userId] ?? userId

  const sign = async () => {
    if (!submission?.id || !user?.id || !signatureText.trim()) return
    setLoading(true)
    const newSignatures = [...siteSignatures, { userId: user.id, signedAt: new Date().toISOString(), signatureText: signatureText.trim() }]
    try {
      await updateSignableSubmission(submission.id, { siteSignatures: newSignatures })
      updateSubmission(submission.id, { siteSignatures: newSignatures })
      await refetch()
      const updated = await fetchSubmission(submission.id)
      if (updated) updateSubmission(submission.id, updated)
      setSigned(true)
    } finally {
      setLoading(false)
    }
  }

  const addInPersonSignature = async () => {
    if (!submission?.id || !inPersonSignerId || !inPersonSignatureText.trim()) return
    setAddingInPerson(true)
    const newSignatures = [...siteSignatures, { userId: inPersonSignerId, signedAt: new Date().toISOString(), signatureText: inPersonSignatureText.trim() }]
    try {
      await updateSignableSubmission(submission.id, { siteSignatures: newSignatures })
      updateSubmission(submission.id, { siteSignatures: newSignatures })
      await refetch()
      const updated = await fetchSubmission(submission.id)
      if (updated) updateSubmission(submission.id, updated)
      setInPersonSignerId('')
      setInPersonSignatureText('')
    } finally {
      setAddingInPerson(false)
    }
  }

  if (loadingSubmission) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center text-neutral-500 dark:text-neutral-400">
        Loading…
      </div>
    )
  }

  if (!submission) {
    return (
      <div className="max-w-xl mx-auto space-y-4 animate-fade-in">
        <p className="text-neutral-500 dark:text-neutral-400">Form not found.</p>
        <Link to="/library?view=signing" className="text-brand-600 dark:text-brand-400 hover:underline">Back to Signing</Link>
      </div>
    )
  }

  if (!isSiteSigner && !isSubmissionOwner) {
    return (
      <div className="max-w-xl mx-auto space-y-4 animate-fade-in">
        <p className="text-neutral-500 dark:text-neutral-400">You are not required to sign this form.</p>
        <Link to="/daily-forms" className="text-brand-600 dark:text-brand-400 hover:underline">Back to Daily forms</Link>
      </div>
    )
  }

  if (hasSigned || signed) {
    return (
      <div className="max-w-xl mx-auto space-y-6 animate-fade-in">
        <Card padding="lg" className="text-center">
          <div className="text-5xl text-emerald-500 mb-4">✓</div>
          <CardHeader>You Have Signed</CardHeader>
          <CardDescription>Your signature has been recorded on this form.</CardDescription>
          <Button className="mt-4" onClick={() => navigate('/daily-forms')}>Back to Daily forms</Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Link to="/daily-forms" className="touch-target p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </Link>
        <div>
          <h1 className="font-display font-bold text-xl text-neutral-900 dark:text-white">Sign: {submission.templateName}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {isSubmissionOwner ? 'You sent this form. Collect signatures in person or sign when it’s your turn.' : `Started by ${submission.submittedBy}; your signature is required.`}
          </p>
        </div>
      </div>

      <Card padding="lg">
        <CardHeader>Form Summary</CardHeader>
        <CardDescription>Review the details below, then add signatures.</CardDescription>
        <div className="mt-4 space-y-2 text-sm">
          {template?.placedFields?.filter((f) => f.type !== 'signature').map((f) => (
            <div key={f.id} className="flex justify-between gap-4 py-1 border-b border-neutral-100 dark:border-neutral-700">
              <span className="text-neutral-500 dark:text-neutral-400">{f.label}</span>
              <span className="text-neutral-900 dark:text-white font-medium">{submission.fieldValues[f.id] ?? '—'}</span>
            </div>
          ))}
          <div className="flex justify-between gap-4 py-1 border-b border-neutral-100 dark:border-neutral-700">
            <span className="text-neutral-500 dark:text-neutral-400">Supervisor signature</span>
            <span className="text-neutral-900 dark:text-white font-medium">{submission.signatureText || '—'}</span>
          </div>
        </div>
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          Signatures: {siteSignatures.length} of {siteSignerIds.length} — {siteSignerIds.map(getName).join(', ')}
        </p>
      </Card>

      {canCollectInPerson && (
        <Card padding="lg">
          <CardHeader className="text-base">Collect Signatures in Person</CardHeader>
          <CardDescription>Pass the device to each person; select their name and they type their name to sign. Anyone not present will get the form to sign on their own device.</CardDescription>
          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Who is signing?</label>
              <select
                value={inPersonSignerId}
                onChange={(e) => setInPersonSignerId(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                aria-label="Who is signing"
              >
                <option value="">Select person</option>
                {pendingSignerIds.map((id) => (
                  <option key={id} value={id}>{getName(id)}</option>
                ))}
              </select>
            </div>
            <Input
              label="Their signature (type their full name)"
              value={inPersonSignatureText}
              onChange={(e) => setInPersonSignatureText(e.target.value)}
              placeholder="Full name"
            />
            <Button onClick={addInPersonSignature} disabled={addingInPerson || !inPersonSignerId || !inPersonSignatureText.trim()} className="w-full">
              {addingInPerson ? 'Adding…' : 'Add signature'}
            </Button>
          </div>
        </Card>
      )}

      {(onlySupervisorPending || (isSiteSigner && !hasSigned && !canCollectInPerson)) && (
        <Card padding="lg">
          <CardHeader className="text-base">Your Signature</CardHeader>
          <CardDescription>Type your full name to sign. After you sign, the form will be sent to HR.</CardDescription>
          <div className="mt-4">
            <Input
              label="Your signature (type your full name)"
              value={signatureText}
              onChange={(e) => setSignatureText(e.target.value)}
              placeholder="Full name"
              required
            />
            <Button className="w-full mt-4" onClick={sign} disabled={loading || !signatureText.trim()}>
              {loading ? 'Saving…' : 'Sign'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
