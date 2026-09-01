import { Router } from 'express'
import { loginUser, loginWithInviteCode, refreshUserToken, logoutUser, getMe, setupProfile } from '../services/authService'
import { loginSchema, inviteLoginSchema, setupProfileSchema, forgotPasswordSchema, resetPasswordSchema, refreshSchema } from '../schemas/authSchemas'
import { validateRequest } from '../utils/validate'
import { authenticate } from '../middleware/authenticate'
// Rate limiter disabled — mobile users on CGNAT share IPs and hit 429s.
// import { loginLimiter } from '../middleware/rateLimiter'
import { requireJson } from '../middleware/requireJson'
import { sendPasswordResetEmail, resetPasswordWithToken } from '../services/emailService'

const router = Router()

router.use(requireJson)

router.post('/login', validateRequest(loginSchema), async (req, res, next) => {
    try {
        const ip = req.ip || (req as any).connection?.remoteAddress || 'unknown'
        const data = await loginUser(req.body, ip)
        res.status(200).json({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user })
    } catch (e) {
        next(e)
    }
})

router.post('/login-invite', validateRequest(inviteLoginSchema), async (req, res, next) => {
    try {
        const ip = req.ip || (req as any).connection?.remoteAddress || 'unknown'
        const data = await loginWithInviteCode(req.body.email, req.body.inviteCode, ip)
        res.status(200).json({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user })
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
        res.status(200).json({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user })
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

export default router
