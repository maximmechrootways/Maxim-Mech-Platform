import { z } from 'zod'

// Reject control chars and anything that could be script/code in login inputs
const noControlOrCode = (s: string) => !/[\x00-\x1f\x7f]|<|>|javascript:|data:|vbscript:|on\w+=/i.test(s)
const EMAIL_MAX = 254
const PASSWORD_MAX = 128
const INVITE_CODE_MAX = 32
const INVITE_CODE_REGEX = /^[A-Za-z0-9_-]+$/

export const loginSchema = z.object({
    email: z
        .string()
        .min(1, 'Email is required')
        .max(EMAIL_MAX, 'Email is too long')
        .transform((s) => s.trim().toLowerCase())
        .refine(noControlOrCode, 'Invalid characters in email')
        .pipe(z.string().email('Invalid email address')),
    password: z
        .string()
        .min(1, 'Password is required')
        .max(PASSWORD_MAX, 'Password is too long')
        .refine(noControlOrCode, 'Invalid characters in password'),
})

export const inviteLoginSchema = z.object({
    email: z
        .string()
        .min(1, 'Email is required')
        .max(EMAIL_MAX, 'Email is too long')
        .transform((s) => s.trim().toLowerCase())
        .refine(noControlOrCode, 'Invalid characters in email')
        .pipe(z.string().email('Invalid email address')),
    inviteCode: z
        .string()
        .min(1, 'Invite code is required')
        .max(INVITE_CODE_MAX, 'Invite code is too long')
        .transform((s) => s.trim())
        .refine((s) => INVITE_CODE_REGEX.test(s), 'Invite code can only contain letters, numbers, hyphens and underscores'),
})

export const setupProfileSchema = z.object({
    password: z
        .string()
        .min(8, 'Password must be at least 8 characters long')
        .max(PASSWORD_MAX, 'Password is too long')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .refine(noControlOrCode, 'Invalid characters in password'),
    displayName: z.string().max(100).optional(),
})

export const forgotPasswordSchema = z.object({
    email: z
        .string()
        .min(1, 'Email is required')
        .max(EMAIL_MAX, 'Email is too long')
        .transform((s) => s.trim().toLowerCase())
        .refine(noControlOrCode, 'Invalid characters in email')
        .pipe(z.string().email('Invalid email address')),
})

const RESET_TOKEN_MAX = 512
export const resetPasswordSchema = z.object({
    token: z.string().min(1, 'Reset token is required').max(RESET_TOKEN_MAX, 'Invalid reset token'),
    password: z
        .string()
        .min(8, 'Password must be at least 8 characters long')
        .max(PASSWORD_MAX, 'Password is too long')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .refine(noControlOrCode, 'Invalid characters in password'),
})

const REFRESH_TOKEN_MAX = 512
export const refreshSchema = z.object({
    refreshToken: z
        .string()
        .min(1, 'Refresh token is required')
        .max(REFRESH_TOKEN_MAX, 'Invalid refresh token'),
})
