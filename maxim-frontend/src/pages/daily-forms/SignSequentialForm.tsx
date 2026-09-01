import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useUser } from '@/contexts/UserContext'
import { fetchAssignmentDetails, submitSequentialSignature } from '@/api/library'
import { SigningChain } from '@/components/SigningChain'

export function SignSequentialForm() {
  const { assignmentId } = useParams()
  const navigate = useNavigate()
  const { user } = useUser()
  const [assignment, setAssignment] = useState<any>(null)
  const [loadingAssignment, setLoadingAssignment] = useState(true)

  useEffect(() => {
    if (!assignmentId) return
    setLoadingAssignment(true)
    fetchAssignmentDetails(assignmentId)
      .then(setAssignment)
      .catch(() => {})
      .finally(() => setLoadingAssignment(false))
  }, [assignmentId])

  const [signatureText, setSignatureText] = useState(user?.name ?? '')
  const [loading, setLoading] = useState(false)
  const [signed, setSigned] = useState(false)

  if (loadingAssignment) {
    return <div className="max-w-xl mx-auto py-12 text-center text-neutral-500">Loading…</div>
  }

  if (!assignment) {
    return (
      <div className="max-w-xl mx-auto space-y-4 animate-fade-in">
        <p className="text-neutral-500">Form not found.</p>
        <Link to="/daily-forms" className="text-brand-600 hover:underline">Back to Daily forms</Link>
      </div>
    )
  }

  const mySignatory = assignment.signatories.find((s: any) => s.userId === user?.id)
  
  if (!mySignatory || mySignatory.status !== 'notified') {
    return (
      <div className="max-w-xl mx-auto space-y-4 animate-fade-in">
        <p className="text-neutral-500">It is not your turn to sign this form yet.</p>
        <Link to="/daily-forms" className="text-brand-600 hover:underline">Back to Daily forms</Link>
      </div>
    )
  }

  const sign = async () => {
    if (!assignmentId || !user?.id || !signatureText.trim()) return
    setLoading(true)
    try {
      await submitSequentialSignature(assignmentId, {
        signatureUrl: signatureText.trim(), // Normally would be a real URL, here we map text for demo
        fieldValues: {} // Assuming fields are filled on form
      })
      setSigned(true)
    } finally {
      setLoading(false)
    }
  }

  if (signed) {
    return (
      <div className="max-w-xl mx-auto space-y-6 animate-fade-in">
        <Card padding="lg" className="text-center">
          <div className="text-5xl text-emerald-500 mb-4">✓</div>
          <CardHeader>You Have Signed</CardHeader>
          <CardDescription>Your signature has been recorded. The form will be passed to the next person.</CardDescription>
          <Button className="mt-4" onClick={() => navigate('/daily-forms')}>Back to Daily forms</Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Link to="/daily-forms" className="touch-target p-2 rounded-lg hover:bg-neutral-100 text-neutral-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </Link>
        <div>
          <h1 className="font-display font-bold text-xl text-neutral-900 dark:text-white">Sign: {assignment.signableFormTemplate?.name}</h1>
          <p className="text-sm text-neutral-500">Your signature is required.</p>
        </div>
      </div>

      <Card padding="lg">
        <CardHeader>Signing Chain</CardHeader>
        <CardDescription>See who has already signed this form.</CardDescription>
        <SigningChain signatories={assignment.signatories} />
      </Card>

      <Card padding="lg">
        <CardHeader className="text-base">Your Signature</CardHeader>
        <CardDescription>Type your full name to sign.</CardDescription>
        <div className="mt-4">
          <Input
            label="Your signature (type your full name)"
            value={signatureText}
            onChange={(e) => setSignatureText(e.target.value)}
            placeholder="Full name"
            required
          />
          <Button className="w-full mt-4" onClick={sign} disabled={loading || !signatureText.trim()}>
            {loading ? 'Saving…' : 'Sign & Submit'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
