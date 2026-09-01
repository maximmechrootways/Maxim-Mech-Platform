import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@/contexts/UserContext'
import { useTheme } from '@/contexts/ThemeContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [forgotMode, setForgotMode] = useState(false)
  const { login } = useUser()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  const [resetLinkMessage, setResetLinkMessage] = useState<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (forgotMode) {
      setResetLinkMessage(`If ${email} is registered, a reset link will be sent.`)
      return
    }
    setAuthError(null)
    setResetLinkMessage(null)
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch {
      setAuthError('Invalid email or password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-app bg-app-light safe-bottom">
      <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-brand-400/15 via-brand-500/5 to-transparent dark:from-brand-500/20 dark:via-brand-400/10 dark:to-transparent pointer-events-none" aria-hidden />
      <div className="flex justify-end p-4 relative z-10">
        <button
          type="button"
          onClick={toggleTheme}
          className="touch-target p-2.5 rounded-xl hover:bg-white/60 dark:hover:bg-neutral-800/60 text-neutral-600 dark:text-neutral-400 transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        <Card className="w-full max-w-md animate-slide-up glass-card border-white/50 dark:border-neutral-600/30" padding="lg">
          <div className="text-center mb-8">
            <h1 className="font-display font-bold text-display-lg tracking-tight text-neutral-900 dark:text-white">Maxim Mechanical Group</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">Sign in to your account</p>
          </div>
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
            {!forgotMode && (
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
            {authError && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg" role="alert">{authError}</p>
            )}
            {resetLinkMessage && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-3 py-2 rounded-lg" role="status">{resetLinkMessage}</p>
            )}
            {forgotMode ? (
              <div className="flex flex-col gap-3">
                <Button type="submit" fullWidth>Send reset link</Button>
                <button type="button" onClick={() => { setForgotMode(false); setResetLinkMessage(null) }} className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
                  Back to sign in
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setForgotMode(true)}
                  className="text-sm text-brand-600 dark:text-brand-400 hover:underline"
                >
                  Forgot password?
                </button>
                <Button type="submit" fullWidth size="lg" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</Button>
              </>
            )}
          </form>
          </Card>
      </div>
    </div>
  )
}
