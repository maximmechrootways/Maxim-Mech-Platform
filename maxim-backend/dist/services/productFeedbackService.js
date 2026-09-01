"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitProductFeedback = submitProductFeedback;
exports.listProductFeedback = listProductFeedback;
exports.updateProductFeedback = updateProductFeedback;
exports.deleteProductFeedback = deleteProductFeedback;
exports.retryProductFeedbackForward = retryProductFeedbackForward;
exports.addProductFeedbackComment = addProductFeedbackComment;
const prisma_1 = require("../lib/prisma");
const crypto_1 = require("crypto");
const notificationEmailQueue_1 = require("./notificationEmailQueue");
const blobStorageService_1 = require("./blobStorageService");
const client_1 = require("@prisma/client");
const DEFAULT_FEEDBACK_NOTIFY_RECIPIENTS = [
    'gershmanrobin@gmail.com',
    'matthew_bodenstein@hotmail.com',
];
const FEEDBACK_NOTIFY_RECIPIENTS = Array.from(new Set([
    ...(process.env.FEEDBACK_NOTIFY_RECIPIENTS || '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ...DEFAULT_FEEDBACK_NOTIFY_RECIPIENTS,
]));
const FEEDBACK_TABLE_MISSING_MESSAGE = 'Product feedback storage is not ready yet on this environment. Run `npx prisma migrate deploy` and restart the backend.';
const MAX_FEEDBACK_LENGTH = 5000000;
const MAX_COMMENT_LENGTH = 4000;
const SCREENSHOT_TOKEN_REGEX = /\[\[screenshot:data:image\/[a-zA-Z0-9.+-]+;base64,[^\]]+\]\]/g;
const SCREENSHOT_CAPTURE_REGEX = /\[\[screenshot:(data:image\/([a-zA-Z0-9.+-]+);base64,([^\]]+))\]\]/g;
const FEEDBACK_SCREENSHOT_EXPIRY_MINUTES = 60 * 24 * 7; // 7 days
const SCREENSHOT_UPLOAD_MAX_RETRIES = 3;
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
function normalizeImageExtension(subtype) {
    const lower = subtype.toLowerCase();
    if (lower.includes('jpeg') || lower === 'jpg')
        return 'jpg';
    if (lower.includes('png'))
        return 'png';
    if (lower.includes('webp'))
        return 'webp';
    if (lower.includes('gif'))
        return 'gif';
    return 'png';
}
async function uploadFeedbackScreenshots(message) {
    const screenshots = [];
    let cleanMessage = message;
    const matches = Array.from(message.matchAll(SCREENSHOT_CAPTURE_REGEX));
    if (matches.length === 0)
        return { cleanMessage, screenshotUrls: screenshots };
    for (const match of matches) {
        const dataUrl = match[1];
        const mimeSubtype = match[2];
        const base64Body = match[3];
        try {
            const buffer = Buffer.from(base64Body, 'base64');
            const ext = normalizeImageExtension(mimeSubtype);
            const blobName = `documents/feedback-screenshots/${Date.now()}-${(0, crypto_1.randomUUID)()}.${ext}`;
            const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
            let sasUrl = '';
            let lastError = null;
            for (let attempt = 1; attempt <= SCREENSHOT_UPLOAD_MAX_RETRIES; attempt += 1) {
                try {
                    await (0, blobStorageService_1.uploadBufferToBlob)(blobName, buffer, contentType);
                    sasUrl = await (0, blobStorageService_1.getBlobSasUrl)(blobName, FEEDBACK_SCREENSHOT_EXPIRY_MINUTES);
                    break;
                }
                catch (err) {
                    lastError = err;
                    if (attempt < SCREENSHOT_UPLOAD_MAX_RETRIES) {
                        await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
                    }
                }
            }
            if (!sasUrl)
                throw lastError || new Error('Screenshot upload failed');
            screenshots.push(sasUrl);
        }
        catch (err) {
            console.warn('feedback_screenshot_upload_failed', {
                index: screenshots.length + 1,
                error: err instanceof Error ? err.message : String(err),
            });
        }
        cleanMessage = cleanMessage.replace(match[0], '[screenshot attached]');
    }
    return { cleanMessage: cleanMessage.trim(), screenshotUrls: screenshots };
}
function canViewAll(role) {
    return role === 'owner' || role === 'hr';
}
function isMissingProductFeedbackTableError(err) {
    const anyErr = err;
    if (anyErr?.code === 'P2010' && anyErr?.meta?.code === '42P01') {
        const metaMessage = String(anyErr?.meta?.message ?? '');
        return metaMessage.includes('"ProductFeedback"') || metaMessage.includes('"ProductFeedbackComment"');
    }
    const message = String(anyErr?.message ?? '');
    return message.includes('relation "ProductFeedback" does not exist') || message.includes('relation "ProductFeedbackComment" does not exist');
}
async function runFeedbackQuery(queryFn) {
    try {
        return await queryFn();
    }
    catch (err) {
        if (isMissingProductFeedbackTableError(err)) {
            throw { status: 503, message: FEEDBACK_TABLE_MISSING_MESSAGE };
        }
        throw err;
    }
}
function mapFeedback(row) {
    return {
        id: row.id,
        userId: row.userId,
        userName: row.userName,
        userEmail: row.userEmail,
        userRole: row.userRole,
        message: row.message,
        pageUrl: row.pageUrl ?? null,
        completed: Boolean(row.completed),
        completedAt: row.completedAt?.toISOString?.() ?? (row.completedAt ? new Date(row.completedAt).toISOString() : null),
        createdAt: row.createdAt?.toISOString?.() ?? new Date().toISOString(),
        forwardedAt: row.forwardedAt?.toISOString?.() ?? null,
        forwardError: row.forwardError ?? null,
        comments: Array.isArray(row.comments) ? row.comments : [],
    };
}
function mapFeedbackComment(row) {
    return {
        id: row.id,
        feedbackId: row.feedbackId,
        authorId: row.authorId,
        authorName: row.authorName,
        body: row.body,
        createdAt: row.createdAt?.toISOString?.() ?? new Date().toISOString(),
    };
}
function extractForwardErrorMessage(err) {
    const anyErr = err;
    return (anyErr?.response?.data?.error ||
        anyErr?.response?.data?.message ||
        anyErr?.message ||
        anyErr?.cause?.message ||
        String(err));
}
async function buildFeedbackEmailContent(input) {
    const screenshotCount = (input.message.match(SCREENSHOT_TOKEN_REGEX) || []).length;
    const uploaded = await uploadFeedbackScreenshots(input.message);
    const normalizedMessage = uploaded.cleanMessage;
    const safeMessage = normalizedMessage.length > 8000
        ? `${normalizedMessage.slice(0, 8000)}\n\n[message truncated]`
        : normalizedMessage;
    const pageLine = input.pageUrl ? `Page: ${input.pageUrl}` : 'Page: (not provided)';
    const subject = `Maxim feedback from ${input.userName} (${input.userRole})`;
    const bodyText = [
        'New product feedback was submitted in Maxim.',
        '',
        `Reported by: ${input.userName} <${input.userEmail}>`,
        `Role: ${input.userRole}`,
        pageLine,
        `Submitted at: ${input.createdAtIso}`,
        screenshotCount > 0 ? `Screenshots attached: ${screenshotCount}` : 'Screenshots attached: 0',
        '',
        'Message:',
        safeMessage,
    ].join('\n');
    const htmlMessage = escapeHtml(safeMessage).replace(/\n/g, '<br/>');
    const htmlImages = uploaded.screenshotUrls.length > 0
        ? `<div style="margin-top:16px"><p style="font-weight:600;margin:0 0 8px 0">Screenshots</p>${uploaded.screenshotUrls
            .map((url, idx) => `<div style="margin-bottom:12px"><img src="${url}" alt="Feedback screenshot ${idx + 1}" style="max-width:100%;height:auto;border:1px solid #ddd;border-radius:6px" /></div>`)
            .join('')}</div>`
        : '';
    const bodyHtml = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
      <p>New product feedback was submitted in Maxim.</p>
      <p>
        <strong>Reported by:</strong> ${escapeHtml(input.userName)} &lt;${escapeHtml(input.userEmail)}&gt;<br/>
        <strong>Role:</strong> ${escapeHtml(input.userRole)}<br/>
        <strong>Page:</strong> ${escapeHtml(input.pageUrl || '(not provided)')}<br/>
        <strong>Submitted at:</strong> ${escapeHtml(input.createdAtIso)}<br/>
        <strong>Screenshots attached:</strong> ${uploaded.screenshotUrls.length}
      </p>
      <p><strong>Message:</strong><br/>${htmlMessage || '(no text provided)'}</p>
      ${htmlImages}
    </div>
  `.trim();
    return { subject, bodyText, bodyHtml };
}
async function queueFeedbackEmailForward(row, mode) {
    const { subject, bodyText, bodyHtml } = await buildFeedbackEmailContent({
        userName: row.userName,
        userEmail: row.userEmail,
        userRole: row.userRole,
        message: row.message,
        pageUrl: row.pageUrl,
        createdAtIso: new Date(row.createdAt).toISOString(),
    });
    const failures = [];
    for (const recipient of FEEDBACK_NOTIFY_RECIPIENTS) {
        const idempotencyKey = mode === 'submit'
            ? `feedback:${row.id}:email:${recipient}`
            : `feedback:${row.id}:retry:${Date.now()}:${recipient}:${(0, crypto_1.randomUUID)()}`;
        try {
            await (0, notificationEmailQueue_1.enqueueSystemEmailJob)({
                notificationId: `feedback:${row.id}`,
                userId: row.userId,
                toEmail: recipient,
                subject,
                bodyText,
                bodyHtml,
                idempotencyKey,
            });
        }
        catch (err) {
            failures.push(`${recipient}: ${extractForwardErrorMessage(err)}`);
        }
    }
    if (failures.length > 0) {
        throw new Error(`Could not enqueue feedback email delivery for ${failures.join(' | ')}`);
    }
}
async function submitProductFeedback(input) {
    const message = String(input.message || '').trim();
    if (!message)
        throw { status: 400, message: 'Feedback message is required' };
    if (message.length > MAX_FEEDBACK_LENGTH)
        throw { status: 400, message: `Feedback is too long (max ${MAX_FEEDBACK_LENGTH} characters)` };
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: input.userId },
        select: { firstName: true, lastName: true, email: true, role: true },
    });
    if (!user)
        throw { status: 404, message: 'User not found' };
    const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
    const createdRows = await runFeedbackQuery(() => prisma_1.prisma.$queryRaw `
      INSERT INTO "ProductFeedback"
        ("id", "userId", "userName", "userEmail", "userRole", "message", "pageUrl", "completed", "createdAt")
      VALUES
        (${(0, crypto_1.randomUUID)()}, ${input.userId}, ${userName}, ${user.email}, ${user.role || input.userRole}, ${message}, ${input.pageUrl?.trim() || null}, false, NOW())
      RETURNING "id", "userId", "userName", "userEmail", "userRole", "message", "pageUrl", "completed", "completedAt", "forwardedAt", "forwardError", "createdAt"
    `);
    const row = createdRows[0];
    if (!row)
        throw new Error('Could not create feedback');
    try {
        await queueFeedbackEmailForward(row, 'submit');
        const updatedRows = await runFeedbackQuery(() => prisma_1.prisma.$queryRaw `
        UPDATE "ProductFeedback"
        SET "forwardedAt" = NOW(), "forwardError" = NULL
        WHERE "id" = ${row.id}
        RETURNING "id", "userId", "userName", "userEmail", "userRole", "message", "pageUrl", "completed", "completedAt", "forwardedAt", "forwardError", "createdAt"
      `);
        const updated = updatedRows[0] ?? row;
        return mapFeedback(updated);
    }
    catch (err) {
        const msg = extractForwardErrorMessage(err);
        const updatedRows = await runFeedbackQuery(() => prisma_1.prisma.$queryRaw `
        UPDATE "ProductFeedback"
        SET "forwardError" = ${msg.slice(0, 1000)}
        WHERE "id" = ${row.id}
        RETURNING "id", "userId", "userName", "userEmail", "userRole", "message", "pageUrl", "completed", "completedAt", "forwardedAt", "forwardError", "createdAt"
      `);
        const updated = updatedRows[0] ?? row;
        return mapFeedback(updated);
    }
}
async function listProductFeedback(viewerRole) {
    if (!canViewAll(viewerRole))
        throw { status: 403, message: 'Only Owner or HR can view all feedback' };
    const rows = await runFeedbackQuery(() => prisma_1.prisma.$queryRaw `
      SELECT "id", "userId", "userName", "userEmail", "userRole", "message", "pageUrl", "completed", "completedAt", "forwardedAt", "forwardError", "createdAt"
      FROM "ProductFeedback"
      ORDER BY "createdAt" DESC
    `);
    if (rows.length === 0)
        return [];
    const feedbackIds = rows.map((row) => row.id);
    const commentRows = await runFeedbackQuery(() => prisma_1.prisma.$queryRaw `
      SELECT "id", "feedbackId", "authorId", "authorName", "body", "createdAt"
      FROM "ProductFeedbackComment"
      WHERE "feedbackId" IN (${client_1.Prisma.join(feedbackIds)})
      ORDER BY "createdAt" ASC
    `);
    const commentsByFeedbackId = new Map();
    for (const row of commentRows) {
        const mapped = mapFeedbackComment(row);
        const list = commentsByFeedbackId.get(mapped.feedbackId);
        if (list)
            list.push(mapped);
        else
            commentsByFeedbackId.set(mapped.feedbackId, [mapped]);
    }
    return rows.map((row) => mapFeedback({ ...row, comments: commentsByFeedbackId.get(row.id) || [] }));
}
async function updateProductFeedback(viewerRole, id, patch) {
    if (!canViewAll(viewerRole))
        throw { status: 403, message: 'Only Owner or HR can edit feedback' };
    const hasMessage = patch.message !== undefined;
    const hasCompleted = patch.completed !== undefined;
    if (!hasMessage && !hasCompleted)
        throw { status: 400, message: 'No changes provided' };
    let trimmed;
    if (hasMessage) {
        trimmed = String(patch.message || '').trim();
        if (!trimmed)
            throw { status: 400, message: 'Feedback message is required' };
        if (trimmed.length > MAX_FEEDBACK_LENGTH)
            throw { status: 400, message: `Feedback is too long (max ${MAX_FEEDBACK_LENGTH} characters)` };
    }
    const completed = Boolean(patch.completed);
    let updatedRows = [];
    if (hasMessage && hasCompleted) {
        updatedRows = await runFeedbackQuery(() => prisma_1.prisma.$queryRaw `
        UPDATE "ProductFeedback"
        SET "message" = ${trimmed}, "completed" = ${completed}, "completedAt" = ${completed ? new Date() : null}
        WHERE "id" = ${id}
        RETURNING "id", "userId", "userName", "userEmail", "userRole", "message", "pageUrl", "completed", "completedAt", "forwardedAt", "forwardError", "createdAt"
      `);
    }
    else if (hasMessage) {
        updatedRows = await runFeedbackQuery(() => prisma_1.prisma.$queryRaw `
        UPDATE "ProductFeedback"
        SET "message" = ${trimmed}
        WHERE "id" = ${id}
        RETURNING "id", "userId", "userName", "userEmail", "userRole", "message", "pageUrl", "completed", "completedAt", "forwardedAt", "forwardError", "createdAt"
      `);
    }
    else if (hasCompleted) {
        updatedRows = await runFeedbackQuery(() => prisma_1.prisma.$queryRaw `
        UPDATE "ProductFeedback"
        SET "completed" = ${completed}, "completedAt" = ${completed ? new Date() : null}
        WHERE "id" = ${id}
        RETURNING "id", "userId", "userName", "userEmail", "userRole", "message", "pageUrl", "completed", "completedAt", "forwardedAt", "forwardError", "createdAt"
      `);
    }
    const updated = updatedRows[0];
    if (!updated)
        throw { status: 404, message: 'Feedback not found' };
    return mapFeedback(updated);
}
async function deleteProductFeedback(viewerRole, id) {
    if (!canViewAll(viewerRole))
        throw { status: 403, message: 'Only Owner or HR can delete feedback' };
    const deletedRows = await runFeedbackQuery(() => prisma_1.prisma.$queryRaw `
      DELETE FROM "ProductFeedback"
      WHERE "id" = ${id}
      RETURNING "id"
    `);
    if (!deletedRows[0])
        throw { status: 404, message: 'Feedback not found' };
    return { id, deleted: true };
}
async function retryProductFeedbackForward(viewerRole, id) {
    if (!canViewAll(viewerRole))
        throw { status: 403, message: 'Only Owner or HR can retry feedback email forwarding' };
    const rows = await runFeedbackQuery(() => prisma_1.prisma.$queryRaw `
      SELECT "id", "userId", "userName", "userEmail", "userRole", "message", "pageUrl", "completed", "completedAt", "forwardedAt", "forwardError", "createdAt"
      FROM "ProductFeedback"
      WHERE "id" = ${id}
      LIMIT 1
    `);
    const row = rows[0];
    if (!row)
        throw { status: 404, message: 'Feedback not found' };
    try {
        await queueFeedbackEmailForward(row, 'retry');
        const updatedRows = await runFeedbackQuery(() => prisma_1.prisma.$queryRaw `
        UPDATE "ProductFeedback"
        SET "forwardedAt" = NOW(), "forwardError" = NULL
        WHERE "id" = ${row.id}
        RETURNING "id", "userId", "userName", "userEmail", "userRole", "message", "pageUrl", "completed", "completedAt", "forwardedAt", "forwardError", "createdAt"
      `);
        return mapFeedback(updatedRows[0] ?? row);
    }
    catch (err) {
        const msg = extractForwardErrorMessage(err);
        const updatedRows = await runFeedbackQuery(() => prisma_1.prisma.$queryRaw `
        UPDATE "ProductFeedback"
        SET "forwardError" = ${msg.slice(0, 1000)}
        WHERE "id" = ${row.id}
        RETURNING "id", "userId", "userName", "userEmail", "userRole", "message", "pageUrl", "completed", "completedAt", "forwardedAt", "forwardError", "createdAt"
      `);
        return mapFeedback(updatedRows[0] ?? row);
    }
}
async function addProductFeedbackComment(input) {
    if (!canViewAll(input.viewerRole))
        throw { status: 403, message: 'Only Owner or HR can comment on feedback' };
    const body = String(input.body || '').trim();
    if (!body)
        throw { status: 400, message: 'Comment is required' };
    if (body.length > MAX_COMMENT_LENGTH)
        throw { status: 400, message: `Comment is too long (max ${MAX_COMMENT_LENGTH} characters)` };
    const feedbackRows = await runFeedbackQuery(() => prisma_1.prisma.$queryRaw `
      SELECT "id"
      FROM "ProductFeedback"
      WHERE "id" = ${input.feedbackId}
      LIMIT 1
    `);
    if (!feedbackRows[0])
        throw { status: 404, message: 'Feedback not found' };
    const author = await prisma_1.prisma.user.findUnique({
        where: { id: input.authorId },
        select: { firstName: true, lastName: true, email: true },
    });
    if (!author)
        throw { status: 404, message: 'User not found' };
    const authorName = `${author.firstName || ''} ${author.lastName || ''}`.trim() || author.email;
    const rows = await runFeedbackQuery(() => prisma_1.prisma.$queryRaw `
      INSERT INTO "ProductFeedbackComment" ("id", "feedbackId", "authorId", "authorName", "body", "createdAt")
      VALUES (${(0, crypto_1.randomUUID)()}, ${input.feedbackId}, ${input.authorId}, ${authorName}, ${body}, NOW())
      RETURNING "id", "feedbackId", "authorId", "authorName", "body", "createdAt"
    `);
    const created = rows[0];
    if (!created)
        throw new Error('Could not create feedback comment');
    return mapFeedbackComment(created);
}
