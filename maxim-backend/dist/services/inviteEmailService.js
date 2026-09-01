"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueInviteCodeEmail = enqueueInviteCodeEmail;
const crypto_1 = require("crypto");
const env_1 = require("../config/env");
const notificationEmailQueue_1 = require("./notificationEmailQueue");
const notificationEmailTemplate_1 = require("./notificationEmailTemplate");
const notificationService_1 = require("./notificationService");
function buildInviteCodeNotificationContent(input) {
    const loginUrl = `${(0, env_1.getPublicAppUrl)()}/login`;
    const expiresText = input.expiresAt.toLocaleDateString('en-US', { dateStyle: 'long' });
    const greeting = input.firstName?.trim() ? `${input.firstName.trim()}, ` : '';
    const title = input.reason === 'hr_regenerate'
        ? 'Login code from HR'
        : 'Password reset login code';
    const message = [
        `${greeting}your one-time login code is ${input.inviteCode}.`,
        `On the login page, choose "First time? Use invite code", enter your email and this code, then set a new password.`,
        `Sign in at ${loginUrl}.`,
        `This code expires on ${expiresText}.`,
    ].join(' ');
    return {
        title,
        message,
        loginUrl,
        email: (0, notificationEmailTemplate_1.buildNotificationEmail)({
            title,
            message,
            ctaUrl: loginUrl,
        }),
    };
}
/**
 * Queue a login-code email through the same Composio delivery worker and template as form notifications.
 */
async function enqueueInviteCodeEmail(input) {
    const content = buildInviteCodeNotificationContent({
        inviteCode: input.inviteCode,
        expiresAt: input.expiresAt,
        firstName: input.firstName,
        reason: input.reason,
    });
    const sendId = (0, crypto_1.randomUUID)();
    const notificationId = `invite:${input.reason}:${input.userId}:${sendId}`;
    const idempotencyKey = `invite:${input.reason}:${input.userId}:${sendId}`;
    await (0, notificationService_1.createNotification)({
        userId: input.userId,
        title: content.title,
        body: content.message,
        type: 'info',
        linkTo: '/login',
        skipEmail: true,
    }).catch(() => { });
    await (0, notificationEmailQueue_1.enqueueSystemEmailJob)({
        notificationId,
        userId: input.userId,
        toEmail: input.toEmail,
        subject: content.email.subject,
        bodyText: content.email.text,
        bodyHtml: content.email.html,
        idempotencyKey,
    });
    if (!env_1.env.COMPOSIO_API_KEY) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📧 LOGIN CODE queued (COMPOSIO_API_KEY not set — worker may fail to send)');
        console.log(`   To:       ${input.toEmail}`);
        console.log(`   Subject:  ${content.email.subject}`);
        console.log(`   Code:     ${input.inviteCode}`);
        console.log(`   Delivery: ${notificationId}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
    else {
        console.info(JSON.stringify({
            event: 'invite_login_code_enqueued',
            notificationId,
            userId: input.userId,
            toEmail: input.toEmail,
            reason: input.reason,
        }));
    }
    return { enqueued: true };
}
