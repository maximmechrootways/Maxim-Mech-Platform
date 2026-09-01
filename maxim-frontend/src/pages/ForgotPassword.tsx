import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { api } from '@/api'

export function ForgotPassword() {
    const [email, setEmail] = useState('')
    const [sent, setSent] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email.trim()) return
        setError(null)
        setLoading(true)

        try {
            await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() })
            setSent(true)
        } catch (err: any) {
            setError(err.response?.data?.error || err.response?.data?.message || 'Something went wrong')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-app bg-app-light safe-bottom relative overflow-hidden p-4">
            <div className="absolute top-0 left-0 right-0 h-72 bg-gradient-to-b from-brand-400/20 via-brand-500/8 to-transparent dark:from-brand-500/25 dark:via-brand-400/12 dark:to-transparent pointer-events-none" aria-hidden />

            <Card padding="lg" className="w-full max-w-md relative z-10">
                <div className="text-center mb-6">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg">
                        <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <CardHeader>Forgot Password</CardHeader>
                    <CardDescription>
                        {sent
                            ? 'A new login code has been sent to your email.'
                            : 'Enter your email and we\'ll send you a new one-time login code.'}
                    </CardDescription>
                </div>

                {!sent ? (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <Input
                            label="Email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                        />

                        {error && (
                            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-sm text-red-600 dark:text-red-400">
                                {error}
                            </div>
                        )}

                        <Button type="submit" disabled={loading || !email.trim()} className="w-full">
                            {loading ? 'Sending…' : 'Send Login Code'}
                        </Button>
                    </form>
                ) : (
                    <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 text-sm text-green-700 dark:text-green-400 text-center space-y-2">
                        <p>Check your inbox for your login code.</p>
                        <p>
                            On the{' '}
                            <Link to="/login" className="text-brand-600 dark:text-brand-400 hover:underline font-medium">
                                login page
                            </Link>
                            , choose <strong>First time? Use invite code</strong>, then enter your email and the code to set a new password.
                        </p>
                    </div>
                )}

                <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center mt-4">
                    <Link to="/login" className="text-brand-600 dark:text-brand-400 hover:underline font-medium">Back to login</Link>
                </p>
            </Card>
        </div>
    )
}
