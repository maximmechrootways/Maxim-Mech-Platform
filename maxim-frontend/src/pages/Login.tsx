import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { api } from '@/api'
import { BeamsBackground } from '@/components/ui/beams-background'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [useInviteCode, setUseInviteCode] = useState(false)
  const { authenticate, setSessionFromLoginResponse, authSteps, isAuthenticating } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  const [errorObj, setErrorObj] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorObj(null)

    if (useInviteCode) {
      try {
        const res = await api.post('/auth/login-invite', { email, inviteCode })
        const { accessToken, refreshToken, user } = res.data
        if (!user) throw new Error('No user in response')
        setSessionFromLoginResponse({ accessToken, refreshToken, user })
        if (!user.hasCompletedSetup) {
          window.location.href = '/setup-profile'
        } else {
          navigate('/')
        }
      } catch (err: any) {
        setErrorObj(err.response?.data?.message || err.response?.data?.error || 'Invalid invite code or email')
      }
      return
    }

    const result = await authenticate(email, password)
    if (result.success) {
      const pendingRedirect = localStorage.getItem('postLoginRedirectPath')
      if (pendingRedirect) {
        localStorage.removeItem('postLoginRedirectPath')
        navigate(pendingRedirect)
        return
      }
      if (result.hasCompletedSetup === false) {
        navigate('/setup-profile')
      } else {
        navigate('/')
      }
    } else {
      setErrorObj(result.message)
    }
  }

  return (
    <BeamsBackground intensity="strong">
      <div className="min-h-screen flex flex-col safe-bottom">
        {/* top bar */}
        <div className="flex justify-between items-center p-4 relative">
          <span className="text-[10px] font-mono tracking-widest uppercase text-neutral-400 dark:text-neutral-500">Maxim Mechanical</span>
          <button
            type="button"
            onClick={toggleTheme}
            className="touch-target p-2.5 rounded-xl hover:bg-white/60 dark:hover:bg-neutral-800/60 text-neutral-600 dark:text-neutral-400 transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>

        {/* main card */}
        <div className="flex-1 flex items-center justify-center p-4 relative">
          <Card className="w-full max-w-md animate-slide-up glass-card border-white/50 dark:border-neutral-600/30" padding="lg">
            {/* header */}
            <div className="text-center mb-8">
              <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 dark:from-brand-400 dark:to-brand-700 flex items-center justify-center shadow-glow-brand">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              </div>
              <h1 className="font-display font-bold text-display-lg tracking-tight text-neutral-900 dark:text-white">Maxim Mechanical Group</h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Internal Platform · Authentication</p>
            </div>

            {/* auth steps overlay */}
            {isAuthenticating ? (
              <div className="space-y-3 py-4 animate-fade-in">
                {authSteps.map((step, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    {step.status === 'pending' && (
                      <span className="w-5 h-5 rounded-full border-2 border-neutral-300 dark:border-neutral-600 flex-shrink-0" />
                    )}
                    {step.status === 'running' && (
                      <span className="w-5 h-5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin flex-shrink-0" />
                    )}
                    {step.status === 'done' && (
                      <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      </span>
                    )}
                    <span className={`transition-colors ${step.status === 'done' ? 'text-emerald-600 dark:text-emerald-400' : step.status === 'running' ? 'text-brand-600 dark:text-brand-400 font-medium' : 'text-neutral-400 dark:text-neutral-500'}`}>
                      {step.label}
                    </span>
                  </div>
                ))}
                {authSteps.every(s => s.status === 'done') && (
                  <p className="text-center text-sm text-emerald-600 dark:text-emerald-400 font-medium mt-4 animate-fade-in">
                    ✓ Authenticated — redirecting…
                  </p>
                )}
              </div>
            ) : (
              /* login form */
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  type="email"
                  label="Email"
                  placeholder="you@maximmechanical.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />

                {useInviteCode ? (
                  <Input
                    label="Invite Code"
                    placeholder="Enter your one-time code"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    required
                    autoComplete="off"
                  />
                ) : (
                  <Input
                    type="password"
                    label="Password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                )}

                {errorObj && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-sm text-red-600 dark:text-red-400">
                    {errorObj}
                  </div>
                )}

                <Button type="submit" fullWidth size="lg">
                  {useInviteCode ? 'Login with invite code' : 'Sign in'}
                </Button>

                <div className="flex justify-between items-center text-sm">
                  <button
                    type="button"
                    onClick={() => { setUseInviteCode(!useInviteCode); setErrorObj(null) }}
                    className="text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    {useInviteCode ? 'Use password instead' : 'First time? Use invite code'}
                  </button>
                  {!useInviteCode && (
                    <Link to="/forgot-password" className="text-brand-600 dark:text-brand-400 hover:underline">
                      Forgot password?
                    </Link>
                  )}
                </div>
              </form>
            )}
          </Card>
        </div>

        {/* footer */}
        <div className="text-center pb-4 relative">
          <p className="text-[11px] font-mono text-neutral-400 dark:text-neutral-600 tracking-wide">
            Maxim Mechanical Group · Internal Platform
          </p>
        </div>
      </div>
    </BeamsBackground>
  )
}
