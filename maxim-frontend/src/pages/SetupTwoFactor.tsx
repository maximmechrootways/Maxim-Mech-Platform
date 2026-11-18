import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { OtpCodeInput } from '@/components/ui/OtpCodeInput'
import { api } from '@/api'
import {
  downloadRecoveryCodes,
  PENDING_2FA_PURPOSE_KEY,
  PENDING_2FA_TOKEN_KEY,
} from '@/utils/recoveryCodes'

type Phase = 'loading' | 'enroll' | 'codes' | 'error'

export function SetupTwoFactor() {
  const { session, completeTwoFactorSession } = useAuth()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('loading')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [manualKey, setManualKey] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [copied, setCopied] = useState(false)
  const pendingTokenRef = useRef<string | null>(
    typeof window !== 'undefined' ? sessionStorage.getItem(PENDING_2FA_TOKEN_KEY) : null,
  )
  const phaseRef = useRef<Phase>(phase)
  phaseRef.current = phase

  useEffect(() => {
    const pendingToken = pendingTokenRef.current
    if (!session && !pendingToken) {
      navigate('/login')
      return
    }

    // After enroll/codes, session updates must not restart setup (React Strict Mode remount is OK while loading)
    if (phaseRef.current !== 'loading') return

    let active = true
    ;(async () => {
      try {
        const body = pendingToken ? { pendingToken } : {}
        const res = await api.post('/auth/2fa/setup/start', body)
        if (!active || phaseRef.current !== 'loading') return
        setQrDataUrl(res.data.qrDataUrl)
        setManualKey(res.data.manualKey)
        setPhase('enroll')
      } catch (err: any) {
        if (!active || phaseRef.current !== 'loading') return
        const msg =
          err.response?.data?.error ||
          err.response?.data?.message ||
          (err.message ? String(err.message) : 'Failed to start 2FA setup')
        if (/already enabled/i.test(String(msg))) {
          sessionStorage.removeItem(PENDING_2FA_TOKEN_KEY)
          sessionStorage.removeItem(PENDING_2FA_PURPOSE_KEY)
          navigate('/login', { replace: true })
          return
        }
        setError(msg)
        setPhase('error')
      }
    })()

    return () => {
      // Mark inactive so a Strict Mode remount can start a fresh request;
      // do not permanently block the next mount (that caused infinite "Preparing…").
      active = false
    }
  }, [session, navigate])

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleaned = code.replace(/\D/g, '')
    if (cleaned.length !== 6 || saving) return
    setError(null)
    setSaving(true)
    try {
      const pendingToken = pendingTokenRef.current
      const body: Record<string, string> = { code: cleaned }
      if (pendingToken) body.pendingToken = pendingToken
      const res = await api.post('/auth/2fa/setup/confirm', body)
      const { accessToken, refreshToken, user, recoveryCodes: codes } = res.data
      const nextCodes = Array.isArray(codes) ? codes : []
      setRecoveryCodes(nextCodes)
      setPhase('codes')
      sessionStorage.removeItem(PENDING_2FA_TOKEN_KEY)
      sessionStorage.removeItem(PENDING_2FA_PURPOSE_KEY)
      pendingTokenRef.current = null
      if (accessToken && refreshToken && user) {
        completeTwoFactorSession({ accessToken, refreshToken, user })
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Invalid authenticator code')
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  if (!session && !pendingTokenRef.current && phase !== 'codes') return null

  return (
    <div className="min-h-screen flex items-center justify-center bg-app bg-app-light safe-bottom relative overflow-hidden p-4">
      <div className="absolute top-0 left-0 right-0 h-72 bg-gradient-to-b from-brand-400/20 via-brand-500/8 to-transparent dark:from-brand-500/25 dark:via-brand-400/12 dark:to-transparent pointer-events-none" aria-hidden />

      <Card padding="lg" className="w-full max-w-md relative z-10">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-lg">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <CardHeader>
            {phase === 'codes' ? 'Save your recovery codes' : 'Set up two-factor authentication'}
          </CardHeader>
          <CardDescription>
            {phase === 'codes'
              ? 'Store these codes somewhere safe. Each can be used once if you lose your authenticator. They are not emailed.'
              : 'Scan the QR code with Google Authenticator, Authy, or a similar app, then enter the 6-digit code.'}
          </CardDescription>
        </div>

        {phase === 'loading' && (
          <p className="text-center text-sm text-neutral-500 py-8">Preparing authenticator setup…</p>
        )}

        {phase === 'error' && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
            <Button fullWidth onClick={() => navigate('/login')}>Back to login</Button>
          </div>
        )}

        {phase === 'enroll' && (
          <form onSubmit={handleConfirm} className="space-y-4">
            {qrDataUrl && (
              <div className="flex justify-center">
                <img src={qrDataUrl} alt="Authenticator QR code" className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white p-2" width={200} height={200} />
              </div>
            )}
            {manualKey && (
              <div className="text-center">
                <p className="text-xs text-neutral-500 mb-1">Or enter this key manually</p>
                <code className="text-sm font-mono break-all text-neutral-800 dark:text-neutral-200">{manualKey}</code>
              </div>
            )}
            <OtpCodeInput
              value={code}
              onChange={setCode}
              disabled={saving}
              autoFocus
              aria-label="Authenticator code"
            />
            {error && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
            <Button type="submit" fullWidth size="lg" disabled={saving || code.replace(/\D/g, '').length !== 6}>
              {saving ? 'Confirming…' : 'Confirm and continue'}
            </Button>
          </form>
        )}

        {phase === 'codes' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/40 p-4 font-mono text-sm grid grid-cols-2 gap-2">
              {recoveryCodes.map((c) => (
                <span key={c} className="text-neutral-800 dark:text-neutral-200">{c}</span>
              ))}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" fullWidth onClick={handleCopy}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button
                type="button"
                variant="outline"
                fullWidth
                onClick={() => downloadRecoveryCodes(recoveryCodes, session?.userEmail)}
              >
                Download
              </Button>
            </div>
            <Button fullWidth size="lg" onClick={() => navigate('/')}>
              I have saved my codes — continue
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
