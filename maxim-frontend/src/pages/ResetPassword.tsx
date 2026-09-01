import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { api } from '@/api'

export function ResetPassword() {
    const [params] = useSearchParams()
    const token = params.get('token') || ''
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [loading, setLoading] = useState(false)

    const passwordValid = password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password)
    const passwordsMatch = password === confirmPassword
    const canSubmit = passwordValid && passwordsMatch && token && !loading

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!canSubmit) return
        setError(null)
        setLoading(true)

        try {
            await api.post('/auth/reset-password', { token, password })
            setSuccess(true)
        } catch (err: any) {
            setError(err.response?.data?.error || err.response?.data?.message || 'Failed to reset password')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-app bg-app-light safe-bottom relative overflow-hidden p-4">
            <div className="absolute top-0 left-0 right-0 h-72 bg-gradient-to-b from-brand-400/20 via-brand-500/8 to-transparent dark:from-brand-500/25 dark:via-brand-400/12 dark:to-transparent pointer-events-none" aria-hidden />

            <Card padding="lg" className="w-full max-w-md relative z-10">
                <div className="text-center mb-6">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-lg">
                        <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                    </div>
                    <CardHeader>Reset Password</CardHeader>
                    <CardDescription>
                        {success ? 'Your password has been reset successfully.' : 'Enter your new password.'}
                    </CardDescription>
                </div>

                {!token && (
                    <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-sm text-red-600 dark:text-red-400 text-center">
                        Invalid reset link. Please request a new one.
                    </div>
                )}

                {token && !success && (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <Input
                                label="New password"
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
                            {loading ? 'Resetting…' : 'Reset Password'}
                        </Button>
                    </form>
                )}

                {success && (
                    <div className="space-y-4">
                        <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 text-sm text-green-700 dark:text-green-400 text-center">
                            Password reset successful! You can now log in.
                        </div>
                        <Link to="/login" className="block">
                            <Button className="w-full">Go to Login</Button>
                        </Link>
                    </div>
                )}

                {!success && (
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center mt-4">
                        <Link to="/login" className="text-brand-600 dark:text-brand-400 hover:underline font-medium">Back to login</Link>
                    </p>
                )}
            </Card>
        </div>
    )
}
