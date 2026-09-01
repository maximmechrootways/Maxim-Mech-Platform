import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { api } from '@/api'

export function SetupProfile() {
    const { session } = useAuth()
    const navigate = useNavigate()
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    const passwordValid = password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password)
    const passwordsMatch = password === confirmPassword
    const canSubmit = passwordValid && passwordsMatch && !saving

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!canSubmit) return
        setError(null)
        setSaving(true)

        try {
            await api.post('/auth/setup-profile', {
                password,
                displayName: displayName.trim() || undefined,
            })
            navigate('/')
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to set up profile')
        } finally {
            setSaving(false)
        }
    }

    if (!session) {
        navigate('/login')
        return null
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-app bg-app-light safe-bottom relative overflow-hidden p-4">
            <div className="absolute top-0 left-0 right-0 h-72 bg-gradient-to-b from-brand-400/20 via-brand-500/8 to-transparent dark:from-brand-500/25 dark:via-brand-400/12 dark:to-transparent pointer-events-none" aria-hidden />

            <Card padding="lg" className="w-full max-w-md relative z-10">
                <div className="text-center mb-6">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-lg">
                        <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                    </div>
                    <CardHeader>Set Up Your Profile</CardHeader>
                    <CardDescription>Welcome! Please set a password to secure your account.</CardDescription>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Display name (optional)"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="e.g. John Smith"
                    />

                    <div>
                        <Input
                            label="Password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Min 8 chars, 1 uppercase, 1 number"
                            required
                        />
                        {password && !passwordValid && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                Must be 8+ chars with uppercase letter and number
                            </p>
                        )}
                    </div>

                    <div>
                        <Input
                            label="Confirm password"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Re-enter password"
                            required
                        />
                        {confirmPassword && !passwordsMatch && (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-1">Passwords do not match</p>
                        )}
                    </div>

                    {error && (
                        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-sm text-red-600 dark:text-red-400">
                            {error}
                        </div>
                    )}

                    <Button type="submit" disabled={!canSubmit} className="w-full">
                        {saving ? 'Setting up…' : 'Complete Setup'}
                    </Button>
                </form>
            </Card>
        </div>
    )
}
