import axios, { isAxiosError, type AxiosError } from 'axios'

const PRODUCTION_API = import.meta.env.VITE_API_URL || 'http://localhost:3000'

if (typeof window !== 'undefined' && !import.meta.env.DEV) {
    const u = import.meta.env.VITE_API_URL
    if (!u || /localhost|127\.0\.0\.1/i.test(String(u))) {
        console.warn(
            '[Maxim] VITE_API_URL is missing or points at localhost in this production build. API calls will fail in the browser. Set VITE_API_URL before `vite build` (e.g. https://your-app.vercel.app/api when using Vercel /api rewrites, or your Azure API origin).'
        )
    }
}

/**
 * In dev, `undefined` so axios uses same-origin URLs; Vite proxies those paths to the API (see vite.config.ts).
 * In production builds, the deployed API origin.
 */
export const BASE_URL = import.meta.env.DEV ? undefined : PRODUCTION_API

/** Real API origin for user-facing errors (dev: direct Node server behind the Vite proxy). */
export const API_PUBLIC_ORIGIN = import.meta.env.DEV ? 'http://127.0.0.1:3000' : PRODUCTION_API

/** Path or absolute URL for `fetch` / manual requests (dev: same-origin path → Vite proxy). */
export function apiPath(path: string): string {
    const p = path.startsWith('/') ? path : `/${path}`
    if (BASE_URL) return `${String(BASE_URL).replace(/\/$/, '')}${p}`
    return p
}

let currentToken: string | null = null

export function setAuthToken(token: string | null) {
    currentToken = token
}

export function getAuthToken(): string | null {
    return currentToken
}

/** User-facing message from failed API calls (uploads, etc.). */
export function formatAxiosError(e: unknown): string {
    if (isAxiosError(e)) {
        const ax = e as AxiosError<{ error?: string; message?: string }>
        if (ax.code === 'ECONNABORTED' || /timeout/i.test(ax.message || '')) {
            return 'The request timed out. Try a smaller file or check your connection.'
        }
        if (!ax.response) {
            return 'Could not reach the server. Check your connection, or sign out and back in if the problem continues.'
        }
        const st = ax.response.status
        const data = ax.response.data as unknown
        if (typeof data === 'string') {
            const t = data.trim()
            if (t.startsWith('{') || t.startsWith('[')) {
                try {
                    const parsed = JSON.parse(t) as { error?: string; message?: string }
                    const msg = parsed.error ?? parsed.message
                    if (typeof msg === 'string' && msg.trim()) return msg.trim()
                } catch {
                    /* not JSON */
                }
            }
            if (t.startsWith('<')) {
                if (st === 413) return 'This file is too large for the server. Try a smaller file or ask an admin to raise upload limits.'
                return `Server returned an error (${st}). Please try again or contact support.`
            }
            if (t) return t.length > 600 ? `${t.slice(0, 600)}…` : t
        }
        if (data && typeof data === 'object') {
            const o = data as Record<string, unknown>
            const msg = o.error ?? o.message
            if (typeof msg === 'string' && msg.trim()) return msg.trim()
        }
        if (st === 413) return 'This file is too large for the server.'
        if (st === 401) return 'Your session expired. Please sign in again.'
        if (st === 403) return 'You are not allowed to perform this action.'
        if (st === 502 || st === 504) {
            return 'The server took too long or dropped the upload. For large SDS books, wait a moment and try again.'
        }
        if (st === 503) {
            return 'This service is temporarily unavailable. For Local Archive, check that the GX10 on-prem store is configured and online.'
        }
        if (st >= 500) return 'Server error while uploading. Please try again — if it keeps failing, try a smaller file or contact support.'
        return ax.message || `Request failed (${st}).`
    }
    if (e instanceof Error && e.message) return e.message
    return 'Something went wrong. Please try again.'
}

export const api = axios.create({
    baseURL: BASE_URL,
    timeout: 25_000,
    headers: {
        'Content-Type': 'application/json',
    },
})

api.interceptors.request.use((config) => {
    if (currentToken) {
        config.headers.Authorization = `Bearer ${currentToken}`
    }
    // Default instance uses application/json; FormData needs the browser to set multipart boundary.
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
        delete (config.headers as Record<string, unknown>)['Content-Type']
        const cap = typeof config.timeout === 'number' ? config.timeout : 25_000
        config.timeout = Math.max(cap, 120_000)
    }
    return config
})

let isRefreshing = false
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: any) => void }> = []

const processQueue = (error: any, token: string | null = null) => {
    failedQueue.forEach((prom) => {
        if (error) {
            prom.reject(error)
        } else {
            prom.resolve(token!)
        }
    })
    failedQueue = []
}

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config
        if (error.response?.status === 401 && !originalRequest._retry) {
            if (isRefreshing) {
                return new Promise(function (resolve, reject) {
                    failedQueue.push({ resolve, reject })
                })
                    .then((token) => {
                        originalRequest.headers.Authorization = `Bearer ${token}`
                        return api(originalRequest)
                    })
                    .catch((err) => Promise.reject(err))
            }

            originalRequest._retry = true
            isRefreshing = true

            const storedRefresh = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null
            if (storedRefresh) {
                try {
                    const refreshRes = await axios.post(
                        apiPath('/auth/refresh'),
                        { refreshToken: storedRefresh },
                        { headers: { 'Content-Type': 'application/json' } }
                    )
                    const { accessToken, refreshToken } = refreshRes.data
                    setAuthToken(accessToken)
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('refreshToken', refreshToken)
                    }
                    processQueue(null, accessToken)
                    isRefreshing = false

                    originalRequest.headers.Authorization = `Bearer ${accessToken}`
                    return api(originalRequest)
                } catch (refreshErr) {
                    processQueue(refreshErr, null)
                    isRefreshing = false
                    setAuthToken(null)
                    if (typeof window !== 'undefined') {
                        localStorage.removeItem('refreshToken')
                        if (window.location.pathname !== '/login') {
                            window.location.href = '/login'
                        }
                    }
                    return Promise.reject(refreshErr)
                }
            } else {
                isRefreshing = false
                if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
                    window.location.href = '/login'
                }
            }
        }
        return Promise.reject(error)
    }
)
