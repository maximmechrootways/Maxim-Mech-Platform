import { randomUUID } from 'crypto'
import { env, getPublicAppUrl } from '../config/env'
import { enqueueSystemEmailJob } from './notificationEmailQueue'
import { buildNotificationEmail } from './notificationEmailTemplate'
import { createNotification } from './notificationService'

export type InviteCodeEmailReason = 'forgot_password' | 'hr_regenerate'

function buildInviteCodeNotificationContent(input: {
    inviteCode: string
    expiresAt: Date
    firstName?: string | null
    reason: InviteCodeEmailReason
}) {
    const loginUrl = `${getPublicAppUrl()}/login`
    const expiresText = input.expiresAt.toLocaleDateString('en-US', { dateStyle: 'long' })
    const greeting = input.firstName?.trim() ? `${input.firstName.trim()}, ` : ''

    const title =
        input.reason === 'hr_regenerate'
            ? 'Login code from HR'
            : 'Password reset login code'

    const message = [
        `${greeting}your one-time login code is ${input.inviteCode}.`,
        `On the login page, choose "First time? Use invite code", enter your email and this code, then set a new password.`,
        `Sign in at ${loginUrl}.`,
        `This code expires on ${expiresText}.`,
    ].join(' ')

    return {
        title,
        message,
        loginUrl,
        email: buildNotificationEmail({
            title,
            message,
            ctaUrl: loginUrl,
        }),
    }
}

/**
 * Queue a login-code email through the same Composio delivery worker and template as form notifications.
 */
export async function enqueueInviteCodeEmail(input: {
    userId: string
    toEmail: string
    inviteCode: string
    expiresAt: Date
    firstName?: string | null
    reason: InviteCodeEmailReason
}) {
    const content = buildInviteCodeNotificationContent({
        inviteCode: input.inviteCode,
        expiresAt: input.expiresAt,
        firstName: input.firstName,
        reason: input.reason,
    })

    const sendId = randomUUID()
    const notificationId = `invite:${input.reason}:${input.userId}:${sendId}`
    const idempotencyKey = `invite:${input.reason}:${input.userId}:${sendId}`

    await createNotification({
        userId: input.userId,
        title: content.title,
        body: content.message,
        type: 'info',
        linkTo: '/login',
        skipEmail: true,
    }).catch(() => {})

    await enqueueSystemEmailJob({
        notificationId,
        userId: input.userId,
        toEmail: input.toEmail,
        subject: content.email.subject,
        bodyText: content.email.text,
        bodyHtml: content.email.html,
        idempotencyKey,
    })

    if (!env.COMPOSIO_API_KEY) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log('📧 LOGIN CODE queued (COMPOSIO_API_KEY not set — worker may fail to send)')
        console.log(`   To:       ${input.toEmail}`)
        console.log(`   Subject:  ${content.email.subject}`)
        console.log(`   Code:     ${input.inviteCode}`)
        console.log(`   Delivery: ${notificationId}`)
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    } else {
        console.info(JSON.stringify({
            event: 'invite_login_code_enqueued',
            notificationId,
            userId: input.userId,
            toEmail: input.toEmail,
            reason: input.reason,
        }))
    }

    return { enqueued: true as const }
}
