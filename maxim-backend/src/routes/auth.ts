import { Router } from 'express'
import {
    loginUser,
    loginWithInviteCode,
    refreshUserToken,
    logoutUser,
    getMe,
    setupProfile,
} from '../services/authService'
import {
    loginSchema,
    inviteLoginSchema,
    setupProfileSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    refreshSchema,
    twoFactorSetupConfirmSchema,
    twoFactorVerifySchema,
    twoFactorSetupStartSchema,
} from '../schemas/authSchemas'
import { validateRequest } from '../utils/validate'
import { authenticate } from '../middleware/authenticate'
import { resolveTwoFactorActor } from '../middleware/resolveTwoFactorActor'
import { twoFactorVerifyLimiter } from '../middleware/rateLimiter'
import { requireJson } from '../middleware/requireJson'
import { sendPasswordResetEmail, resetPasswordWithToken } from '../services/emailService'
import {
    TRUSTED_DEVICE_COOKIE,
} from '../config/twoFactor'
import {
    startTwoFactorSetup,
    confirmTwoFactorSetup,
    verifyTwoFactorLogin,
    regenerateRecoveryCodes,
} from '../services/twoFactorService'

const router = Router()

router.use(requireJson)

function setTrustedDeviceCookie(
    res: import('express').Response,
    token: string,
    maxAgeSec: number,
) {
    const secure = process.env.NODE_ENV === 'production'
    res.cookie(TRUSTED_DEVICE_COOKIE, token, {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        maxAge: maxAgeSec * 1000,
        path: '/',
    })
}

function sendAuthSession(
    res: import('express').Response,
    data: {
        accessToken?: string
        refreshToken?: string
        user?: unknown
        requiresTwoFactor?: boolean
        requiresTwoFactorSetup?: boolean
        pendingToken?: string
        recoveryCodes?: string[]
        trustedDeviceToken?: string
        trustedDeviceMaxAgeSec?: number
        [key: string]: unknown
    },
) {
    if (data.trustedDeviceToken && data.trustedDeviceMaxAgeSec) {
        setTrustedDeviceCookie(res, data.trustedDeviceToken, data.trustedDeviceMaxAgeSec)
    }

    const {
        trustedDeviceToken: _t,
        trustedDeviceMaxAgeSec: _m,
        ...payload
    } = data

    res.status(200).json(payload)
}

router.post('/login', validateRequest(loginSchema), async (req, res, next) => {
    try {
        const ip = req.ip || (req as any).connection?.remoteAddress || 'unknown'
        const trusted = req.cookies?.[TRUSTED_DEVICE_COOKIE] as string | undefined
        const data = await loginUser(req.body, ip, trusted)
        sendAuthSession(res, data)
    } catch (e) {
        next(e)
    }
})

router.post('/login-invite', validateRequest(inviteLoginSchema), async (req, res, next) => {
    try {
        const ip = req.ip || (req as any).connection?.remoteAddress || 'unknown'
        const data = await loginWithInviteCode(req.body.email, req.body.inviteCode, ip)
        sendAuthSession(res, data)
    } catch (e) {
        next(e)
    }
})

router.post('/setup-profile', authenticate, validateRequest(setupProfileSchema), async (req, res, next) => {
    try {
        const result = await setupProfile(req.user!.id, req.body.password, req.body.displayName)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

router.post('/forgot-password', validateRequest(forgotPasswordSchema), async (req, res, next) => {
    try {
        const result = await sendPasswordResetEmail(req.body.email)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

router.post('/reset-password', validateRequest(resetPasswordSchema), async (req, res, next) => {
    try {
        const result = await resetPasswordWithToken(req.body.token, req.body.password)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

router.post('/refresh', validateRequest(refreshSchema), async (req, res, next) => {
    try {
        const data = await refreshUserToken(req.body.refreshToken)
        res.status(200).json({
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            user: data.user,
        })
    } catch (e) {
        next(e)
    }
})

router.post('/logout', authenticate, async (req, res, next) => {
    try {
        const refreshToken = req.body?.refreshToken
        if (refreshToken) await logoutUser(refreshToken)
        res.status(200).json({ message: 'Logged out successfully' })
    } catch (e) {
        next(e)
    }
})

router.get('/me', authenticate, async (req, res, next) => {
    try {
        const user = await getMe(req.user!.id)
        res.status(200).json(user)
    } catch (e) {
        next(e)
    }
})

router.post(
    '/2fa/setup/start',
    twoFactorVerifyLimiter,
    validateRequest(twoFactorSetupStartSchema),
    resolveTwoFactorActor(['2fa_setup']),
    async (req, res, next) => {
        try {
            const result = await startTwoFactorSetup(req.twoFactorActorId!)
            res.status(200).json(result)
        } catch (e) {
            next(e)
        }
    },
)

router.post(
    '/2fa/setup/confirm',
    twoFactorVerifyLimiter,
    validateRequest(twoFactorSetupConfirmSchema),
    resolveTwoFactorActor(['2fa_setup']),
    async (req, res, next) => {
        try {
            const data = await confirmTwoFactorSetup(req.twoFactorActorId!, req.body.code)
            sendAuthSession(res, data)
        } catch (e) {
            next(e)
        }
    },
)

router.post(
    '/2fa/verify',
    twoFactorVerifyLimiter,
    validateRequest(twoFactorVerifySchema),
    resolveTwoFactorActor(['2fa_pending']),
    async (req, res, next) => {
        try {
            const data = await verifyTwoFactorLogin(req.twoFactorActorId!, {
                code: req.body.code,
                recoveryCode: req.body.recoveryCode,
                rememberDevice: !!req.body.rememberDevice,
                userAgent: req.get('user-agent'),
            })
            sendAuthSession(res, data)
        } catch (e) {
            next(e)
        }
    },
)

router.post('/2fa/recovery-codes/regenerate', authenticate, async (req, res, next) => {
    try {
        const result = await regenerateRecoveryCodes(req.user!.id)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

export default router
