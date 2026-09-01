import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import type { AuthRole, Session, UiPreferences } from '@/types'
import { api, setAuthToken, apiPath, API_PUBLIC_ORIGIN } from '@/api'

function uid(): string {
    return 'sess_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

const SESSION_TTL_SECONDS = 15 * 60

/** Live remaining seconds from session.expiresAt (prefer over stale session.ttl). */
export function sessionRemainingTtl(session: { expiresAt: string; ttl?: number; status?: string } | null | undefined): number {
    if (!session) return 0
    if (session.status && session.status !== 'active') return 0
    const remaining = Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000)
    if (Number.isFinite(remaining)) return Math.max(0, remaining)
    return Math.max(0, session.ttl ?? 0)
}

function normalizeUiPreferences(raw?: any): UiPreferences {
    return {
        kissModeEnabled: Boolean(raw?.kissModeEnabled),
        kissPresetName: typeof raw?.kissPresetName === 'string' ? raw.kissPresetName : null,
        kissOptions: {
            largeTouchTargets: Boolean(raw?.kissOptions?.largeTouchTargets ?? true),
            guidedStepMode: Boolean(raw?.kissOptions?.guidedStepMode ?? true),
            simplifiedNav: Boolean(raw?.kissOptions?.simplifiedNav ?? true),
            showOnlyRequiredFirst: Boolean(raw?.kissOptions?.showOnlyRequiredFirst ?? true),
        },
        notificationPreferences: {
            forms_pending: Boolean(raw?.notificationPreferences?.forms_pending ?? true),
            incidents: Boolean(raw?.notificationPreferences?.incidents ?? true),
            digest: Boolean(raw?.notificationPreferences?.digest ?? false),
            digest_hr_owner_8am: Boolean(raw?.notificationPreferences?.digest_hr_owner_8am ?? false),
            signatures: Boolean(raw?.notificationPreferences?.signatures ?? true),
            incidents_site: Boolean(raw?.notificationPreferences?.incidents_site ?? true),
            signature_required: Boolean(raw?.notificationPreferences?.signature_required ?? true),
            announcements: Boolean(raw?.notificationPreferences?.announcements ?? true),
        },
    }
}

interface AuthStep {
    label: string
    status: 'pending' | 'running' | 'done'
}

interface AuthContextValue {
    session: Session | null
    allSessions: Session[]
    authSteps: AuthStep[]
    isAuthenticating: boolean
    heartbeatActive: boolean
    loading: boolean
    /** True once initial refresh finished and an access token is available (if logged in). */
    authReady: boolean
    authenticate: (email: string, password: string) => Promise<{ success: true; hasCompletedSetup: boolean } | { success: false; message: string }>
    setSessionFromLoginResponse: (data: { accessToken: string; refreshToken: string; user: any }) => void
    endSession: () => void
    refreshToken: () => void
    revokeSession: (sessionId: string) => void
    switchAuthRole: (role: AuthRole) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function sessionFromUser(user: {
    id: string
    email: string
    firstName?: string | null
    lastName?: string | null
    role: string
    hasCompletedSetup?: boolean
    uiPreferences?: UiPreferences
}): Session {
    const now = Math.floor(Date.now() / 1000)
    const exp = now + SESSION_TTL_SECONDS
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
    const role = (user.role || 'viewer') as AuthRole
    return {
        id: uid(),
        userId: user.id,
        userName: displayName,
        userEmail: user.email,
        role,
        actualRole: role,
        issuedAt: new Date(now * 1000).toISOString(),
        expiresAt: new Date(exp * 1000).toISOString(),
        ttl: SESSION_TTL_SECONDS,
        heartbeatLastPing: new Date().toISOString(),
        heartbeatStatus: 'connected',
        status: 'active',
        hasCompletedSetup: user.hasCompletedSetup ?? true,
        uiPreferences: normalizeUiPreferences(user.uiPreferences),
    }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [accessToken, setAccessTokenState] = useState<string | null>(null)
    const [session, setSession] = useState<Session | null>(null)
    const [allSessions, setAllSessions] = useState<Session[]>([])
    const [authSteps, setAuthSteps] = useState<AuthStep[]>([])
    const [isAuthenticating, setIsAuthenticating] = useState(false)
    const [heartbeatActive, setHeartbeatActive] = useState(false)
    const [loading, setLoading] = useState(true)

    const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const ttlRef = useRef<ReturnType<typeof setInterval> | null>(null)

    useEffect(() => {
        setAuthToken(accessToken)
    }, [accessToken])

    useEffect(() => {
        const storedRefresh = localStorage.getItem('refreshToken')
        if (!storedRefresh) {
            setLoading(false)
            return
        }
        fetch(apiPath('/auth/refresh'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: storedRefresh }),
        })
            .then((r) => (r.ok ? r.json() : Promise.reject()))
            .then(({ accessToken: at, refreshToken: rt, user }) => {
                setAuthToken(at)
                setAccessTokenState(at)
                setSession(sessionFromUser(user))
                setAllSessions([sessionFromUser(user)])
                setHeartbeatActive(true)
                localStorage.setItem('refreshToken', rt)
            })
            .catch(() => {
                localStorage.removeItem('refreshToken')
                setSession(null)
                setAllSessions([])
            })
            .finally(() => setLoading(false))
    }, [])

    useEffect(() => {
        if (!session || session.status !== 'active') return
        // Expire when expiresAt is reached. Do not rewrite `session` every second —
        // UI clocks derive remaining seconds from expiresAt (see sessionRemainingTtl).
        ttlRef.current = setInterval(() => {
            setSession((prev) => {
                if (!prev || prev.status !== 'active') return prev
                const remaining = Math.max(0, Math.floor((new Date(prev.expiresAt).getTime() - Date.now()) / 1000))
                if (remaining > 0) return prev
                return { ...prev, ttl: 0, status: 'expired', heartbeatStatus: 'disconnected' }
            })
            setAllSessions((prev) =>
                prev.map((s) => {
                    if (s.status !== 'active') return s
                    const remaining = Math.max(0, Math.floor((new Date(s.expiresAt).getTime() - Date.now()) / 1000))
                    if (remaining > 0) return s
                    return { ...s, ttl: 0, status: 'expired', heartbeatStatus: 'disconnected' }
                })
            )
        }, 1000)
        return () => {
            if (ttlRef.current) clearInterval(ttlRef.current)
        }
    }, [session?.status])

    useEffect(() => {
        if (!heartbeatActive || !session) return
        // Refresh heartbeat UI at most once a minute (was every 10s and churned all Auth consumers).
        heartbeatRef.current = setInterval(() => {
            setSession((prev) =>
                prev ? { ...prev, heartbeatLastPing: new Date().toISOString(), heartbeatStatus: 'connected' } : prev
            )
        }, 60_000)
        return () => {
            if (heartbeatRef.current) clearInterval(heartbeatRef.current)
        }
    }, [heartbeatActive, session?.id])

    const authenticate = useCallback(
        async (_email: string, _password: string): Promise<{ success: true; hasCompletedSetup: boolean } | { success: false; message: string }> => {
            setIsAuthenticating(true)
            setAuthSteps([
                { label: 'Validating credentials…', status: 'running' },
                { label: 'Creating session…', status: 'pending' },
            ])
            try {
                const res = await api.post('/auth/login', { email: _email, password: _password })
                const { accessToken: at, refreshToken: rt, user } = res.data
                if (!user) throw new Error('No user in response')
                setAuthToken(at)
                setAccessTokenState(at)
                localStorage.setItem('refreshToken', rt)
                setAuthSteps([{ label: 'Validating credentials…', status: 'done' }, { label: 'Creating session…', status: 'done' }])
                const newSession = sessionFromUser(user)
                setSession(newSession)
                setAllSessions([newSession])
                setHeartbeatActive(true)
                setIsAuthenticating(false)
                return { success: true, hasCompletedSetup: newSession.hasCompletedSetup }
            } catch (err: unknown) {
                setIsAuthenticating(false)
                setAuthSteps([])
                if (axios.isAxiosError(err)) {
                    if (!err.response) {
                        const hint =
                            err.code === 'ECONNABORTED'
                                ? 'The server took too long to respond (often the API is waiting on PostgreSQL).'
                                : 'Could not connect (is the API running?).'
                        const apiHint =
                            err.code === 'ECONNABORTED'
                                ? ` If the backend is already running at ${API_PUBLIC_ORIGIN}, check maxim-backend/.env DATABASE_URL, that Postgres is up, and consider ?connect_timeout=8 on the URL.`
                                : ` Start the API: \`npm run dev\` in maxim-backend (listening on ${API_PUBLIC_ORIGIN}). The Vite dev server proxies browser requests to that address.`
                        return {
                            success: false,
                            message: `${hint}${apiHint}`,
                        }
                    }
                    const message =
                        (err.response.data as { error?: string } | undefined)?.error ??
                        (err.response.status === 429 ? 'Too many login attempts. Please try again later.' : 'Invalid email or password.')
                    return { success: false, message }
                }
                return { success: false, message: 'Something went wrong. Please try again.' }
            }
        },
        []
    )

    const setSessionFromLoginResponse = useCallback((data: { accessToken: string; refreshToken: string; user: any }) => {
        const { accessToken: at, refreshToken: rt, user } = data
        setAuthToken(at)
        setAccessTokenState(at)
        localStorage.setItem('refreshToken', rt)
        const newSession = sessionFromUser(user)
        setSession(newSession)
        setAllSessions([newSession])
        setHeartbeatActive(true)
    }, [])

    const endSession = useCallback(async () => {
        const storedRefresh = localStorage.getItem('refreshToken')
        try {
            await api.post('/auth/logout', { refreshToken: storedRefresh }, {
                headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
            })
        } catch (e) {
            console.error('Logout failed', e)
        }
        setAuthToken(null)
        setAccessTokenState(null)
        setSession(null)
        setAllSessions([])
        setHeartbeatActive(false)
        setAuthSteps([])
        localStorage.removeItem('refreshToken')
    }, [accessToken])

    const refreshToken = useCallback(async () => {
        if (!session) return
        const storedRefresh = localStorage.getItem('refreshToken')
        if (!storedRefresh) return endSession()
        try {
            const res = await api.post('/auth/refresh', { refreshToken: storedRefresh })
            const { accessToken: at, refreshToken: rt, user } = res.data
            if (at) {
                setAuthToken(at)
                setAccessTokenState(at)
            }
            if (rt) localStorage.setItem('refreshToken', rt)
            if (user) {
                const newSession = sessionFromUser(user)
                setSession(newSession)
                setAllSessions((prev) => prev.map((s) => (s.id === session.id ? newSession : s)))
            }
        } catch (e) {
            console.error('Token refresh failed', e)
            endSession()
        }
    }, [session, endSession])

    const revokeSession = useCallback((sessionId: string) => {
        setAllSessions((prev) =>
            prev.map((s) =>
                s.id === sessionId ? { ...s, status: 'revoked' as const, ttl: 0, heartbeatStatus: 'disconnected' } : s
            )
        )
    }, [])

    const switchAuthRole = useCallback((role: AuthRole) => {
        if (!session) return
        const actual = session.actualRole ?? session.role
        // Owner can switch to any app role; HR can switch between HR/Supervisor/Labourer views.
        const allowedRolesByActual: Record<string, string[]> = {
            owner: ['owner', 'hr', 'supervisor', 'labourer'],
            hr: ['owner', 'hr', 'supervisor', 'labourer'],
        }
        const allowed = allowedRolesByActual[actual] || [actual]
        if (!allowed.includes(role)) return
        setSession((prev) => (prev ? { ...prev, role } : prev))
    }, [session])

    const hasRefreshToken = typeof window !== 'undefined' && !!localStorage.getItem('refreshToken')
    const authReady = !loading && (!hasRefreshToken || accessToken != null)

    return (
        <AuthContext.Provider
            value={{
                session,
                allSessions,
                authSteps,
                isAuthenticating,
                heartbeatActive,
                loading,
                authReady,
                authenticate,
                setSessionFromLoginResponse,
                endSession,
                refreshToken,
                revokeSession,
                switchAuthRole,
            }}
        >
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within AuthProvider')
    return ctx
}
