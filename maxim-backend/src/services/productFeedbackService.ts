import { prisma } from '../lib/prisma'
import { randomUUID } from 'crypto'
import { enqueueSystemEmailJob } from './notificationEmailQueue'
import { getBlobSasUrl, uploadBufferToBlob } from './blobStorageService'
import { Prisma } from '@prisma/client'

const DEFAULT_FEEDBACK_NOTIFY_RECIPIENTS = [
  'gershmanrobin@gmail.com',
  'matthew_bodenstein@hotmail.com',
]
const FEEDBACK_NOTIFY_RECIPIENTS = Array.from(
  new Set(
    [
      ...(process.env.FEEDBACK_NOTIFY_RECIPIENTS || '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
      ...DEFAULT_FEEDBACK_NOTIFY_RECIPIENTS,
    ]
  )
)

const FEEDBACK_TABLE_MISSING_MESSAGE =
  'Product feedback storage is not ready yet on this environment. Run `npx prisma migrate deploy` and restart the backend.'
const MAX_FEEDBACK_LENGTH = 5000000
const MAX_COMMENT_LENGTH = 4000
const SCREENSHOT_TOKEN_REGEX = /\[\[screenshot:data:image\/[a-zA-Z0-9.+-]+;base64,[^\]]+\]\]/g
const SCREENSHOT_CAPTURE_REGEX = /\[\[screenshot:(data:image\/([a-zA-Z0-9.+-]+);base64,([^\]]+))\]\]/g
const FEEDBACK_SCREENSHOT_EXPIRY_MINUTES = 60 * 24 * 7 // 7 days
const SCREENSHOT_UPLOAD_MAX_RETRIES = 3

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function normalizeImageExtension(subtype: string) {
  const lower = subtype.toLowerCase()
  if (lower.includes('jpeg') || lower === 'jpg') return 'jpg'
  if (lower.includes('png')) return 'png'
  if (lower.includes('webp')) return 'webp'
  if (lower.includes('gif')) return 'gif'
  return 'png'
}

async function uploadFeedbackScreenshots(message: string) {
  const screenshots: string[] = []
  let cleanMessage = message
  const matches = Array.from(message.matchAll(SCREENSHOT_CAPTURE_REGEX))
  if (matches.length === 0) return { cleanMessage, screenshotUrls: screenshots }

  for (const match of matches) {
    const dataUrl = match[1]
    const mimeSubtype = match[2]
    const base64Body = match[3]
    try {
      const buffer = Buffer.from(base64Body, 'base64')
      const ext = normalizeImageExtension(mimeSubtype)
      const blobName = `documents/feedback-screenshots/${Date.now()}-${randomUUID()}.${ext}`
      const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`
      let sasUrl = ''
      let lastError: unknown = null
      for (let attempt = 1; attempt <= SCREENSHOT_UPLOAD_MAX_RETRIES; attempt += 1) {
        try {
          await uploadBufferToBlob(blobName, buffer, contentType)
          sasUrl = await getBlobSasUrl(blobName, FEEDBACK_SCREENSHOT_EXPIRY_MINUTES)
          break
        } catch (err) {
          lastError = err
          if (attempt < SCREENSHOT_UPLOAD_MAX_RETRIES) {
            await new Promise((resolve) => setTimeout(resolve, 150 * attempt))
          }
        }
      }
      if (!sasUrl) throw lastError || new Error('Screenshot upload failed')
      screenshots.push(sasUrl)
    } catch (err) {
      console.warn('feedback_screenshot_upload_failed', {
        index: screenshots.length + 1,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    cleanMessage = cleanMessage.replace(match[0], '[screenshot attached]')
  }

  return { cleanMessage: cleanMessage.trim(), screenshotUrls: screenshots }
}

function canViewAll(role: string) {
  return role === 'owner' || role === 'hr'
}

function isMissingProductFeedbackTableError(err: unknown) {
  const anyErr = err as {
    code?: string
    meta?: { code?: string; message?: string }
    message?: string
  }
  if (anyErr?.code === 'P2010' && anyErr?.meta?.code === '42P01') {
    const metaMessage = String(anyErr?.meta?.message ?? '')
    return metaMessage.includes('"ProductFeedback"') || metaMessage.includes('"ProductFeedbackComment"')
  }
  const message = String(anyErr?.message ?? '')
  return message.includes('relation "ProductFeedback" does not exist') || message.includes('relation "ProductFeedbackComment" does not exist')
}

async function runFeedbackQuery<T>(queryFn: () => Promise<T>): Promise<T> {
  try {
    return await queryFn()
  } catch (err) {
    if (isMissingProductFeedbackTableError(err)) {
      throw { status: 503, message: FEEDBACK_TABLE_MISSING_MESSAGE }
    }
    throw err
  }
}

function mapFeedback(row: any) {
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
  }
}

function mapFeedbackComment(row: any) {
  return {
    id: row.id,
    feedbackId: row.feedbackId,
    authorId: row.authorId,
    authorName: row.authorName,
    body: row.body,
    createdAt: row.createdAt?.toISOString?.() ?? new Date().toISOString(),
  }
}

function extractForwardErrorMessage(err: unknown): string {
  const anyErr = err as {
    message?: string
    response?: { data?: { error?: string; message?: string } }
    cause?: { message?: string }
  }
  return (
    anyErr?.response?.data?.error ||
    anyErr?.response?.data?.message ||
    anyErr?.message ||
    anyErr?.cause?.message ||
    String(err)
  )
}

async function buildFeedbackEmailContent(input: {
  userName: string
  userEmail: string
  userRole: string
  message: string
  pageUrl?: string | null
  createdAtIso: string
}) {
  const screenshotCount = (input.message.match(SCREENSHOT_TOKEN_REGEX) || []).length
  const uploaded = await uploadFeedbackScreenshots(input.message)
  const normalizedMessage = uploaded.cleanMessage
  const safeMessage =
    normalizedMessage.length > 8000
      ? `${normalizedMessage.slice(0, 8000)}\n\n[message truncated]`
      : normalizedMessage
  const pageLine = input.pageUrl ? `Page: ${input.pageUrl}` : 'Page: (not provided)'
  const subject = `Maxim feedback from ${input.userName} (${input.userRole})`
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
  ].join('\n')

  const htmlMessage = escapeHtml(safeMessage).replace(/\n/g, '<br/>')
  const htmlImages = uploaded.screenshotUrls.length > 0
    ? `<div style="margin-top:16px"><p style="font-weight:600;margin:0 0 8px 0">Screenshots</p>${uploaded.screenshotUrls
      .map((url, idx) => `<div style="margin-bottom:12px"><img src="${url}" alt="Feedback screenshot ${idx + 1}" style="max-width:100%;height:auto;border:1px solid #ddd;border-radius:6px" /></div>`)
      .join('')}</div>`
    : ''
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
  `.trim()

  return { subject, bodyText, bodyHtml }
}

async function queueFeedbackEmailForward(row: {
  id: string
  userId: string
  userName: string
  userEmail: string
  userRole: string
  message: string
  pageUrl?: string | null
  createdAt: string | Date
}, mode: 'submit' | 'retry') {
  const { subject, bodyText, bodyHtml } = await buildFeedbackEmailContent({
    userName: row.userName,
    userEmail: row.userEmail,
    userRole: row.userRole,
    message: row.message,
    pageUrl: row.pageUrl,
    createdAtIso: new Date(row.createdAt).toISOString(),
  })

  const failures: string[] = []
  for (const recipient of FEEDBACK_NOTIFY_RECIPIENTS) {
    const idempotencyKey =
      mode === 'submit'
        ? `feedback:${row.id}:email:${recipient}`
        : `feedback:${row.id}:retry:${Date.now()}:${recipient}:${randomUUID()}`
    try {
      await enqueueSystemEmailJob({
        notificationId: `feedback:${row.id}`,
        userId: row.userId,
        toEmail: recipient,
        subject,
        bodyText,
        bodyHtml,
        idempotencyKey,
      })
    } catch (err) {
      failures.push(`${recipient}: ${extractForwardErrorMessage(err)}`)
    }
  }
  if (failures.length > 0) {
    throw new Error(`Could not enqueue feedback email delivery for ${failures.join(' | ')}`)
  }
}

export async function submitProductFeedback(input: {
  userId: string
  userRole: string
  message: string
  pageUrl?: string
}) {
  const message = String(input.message || '').trim()
  if (!message) throw { status: 400, message: 'Feedback message is required' }
  if (message.length > MAX_FEEDBACK_LENGTH) throw { status: 400, message: `Feedback is too long (max ${MAX_FEEDBACK_LENGTH} characters)` }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { firstName: true, lastName: true, email: true, role: true },
  })
  if (!user) throw { status: 404, message: 'User not found' }

  const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
  const createdRows = await runFeedbackQuery(() =>
    prisma.$queryRaw<any[]>`
      INSERT INTO "ProductFeedback"
        ("id", "userId", "userName", "userEmail", "userRole", "message", "pageUrl", "completed", "createdAt")
      VALUES
        (${randomUUID()}, ${input.userId}, ${userName}, ${user.email}, ${user.role || input.userRole}, ${message}, ${input.pageUrl?.trim() || null}, false, NOW())
      RETURNING "id", "userId", "userName", "userEmail", "userRole", "message", "pageUrl", "completed", "completedAt", "forwardedAt", "forwardError", "createdAt"
    `
  )
  const row = createdRows[0]
  if (!row) throw new Error('Could not create feedback')

  try {
    await queueFeedbackEmailForward(row, 'submit')
    const updatedRows = await runFeedbackQuery(() =>
      prisma.$queryRaw<any[]>`
        UPDATE "ProductFeedback"
        SET "forwardedAt" = NOW(), "forwardError" = NULL
        WHERE "id" = ${row.id}
        RETURNING "id", "userId", "userName", "userEmail", "userRole", "message", "pageUrl", "completed", "completedAt", "forwardedAt", "forwardError", "createdAt"
      `
    )
    const updated = updatedRows[0] ?? row
    return mapFeedback(updated)
  } catch (err: unknown) {
    const msg = extractForwardErrorMessage(err)
    const updatedRows = await runFeedbackQuery(() =>
      prisma.$queryRaw<any[]>`
        UPDATE "ProductFeedback"
        SET "forwardError" = ${msg.slice(0, 1000)}
        WHERE "id" = ${row.id}
        RETURNING "id", "userId", "userName", "userEmail", "userRole", "message", "pageUrl", "completed", "completedAt", "forwardedAt", "forwardError", "createdAt"
      `
    )
    const updated = updatedRows[0] ?? row
    return mapFeedback(updated)
  }
}

export async function listProductFeedback(viewerRole: string) {
  if (!canViewAll(viewerRole)) throw { status: 403, message: 'Only Owner or HR can view all feedback' }
  const rows = await runFeedbackQuery(() =>
    prisma.$queryRaw<any[]>`
      SELECT "id", "userId", "userName", "userEmail", "userRole", "message", "pageUrl", "completed", "completedAt", "forwardedAt", "forwardError", "createdAt"
      FROM "ProductFeedback"
      ORDER BY "createdAt" DESC
    `
  )
  if (rows.length === 0) return []

  const feedbackIds = rows.map((row) => row.id)
  const commentRows = await runFeedbackQuery(() =>
    prisma.$queryRaw<any[]>`
      SELECT "id", "feedbackId", "authorId", "authorName", "body", "createdAt"
      FROM "ProductFeedbackComment"
      WHERE "feedbackId" IN (${Prisma.join(feedbackIds)})
      ORDER BY "createdAt" ASC
    `
  )

  const commentsByFeedbackId = new Map<string, ReturnType<typeof mapFeedbackComment>[]>()
  for (const row of commentRows) {
    const mapped = mapFeedbackComment(row)
    const list = commentsByFeedbackId.get(mapped.feedbackId)
    if (list) list.push(mapped)
    else commentsByFeedbackId.set(mapped.feedbackId, [mapped])
  }

  return rows.map((row) => mapFeedback({ ...row, comments: commentsByFeedbackId.get(row.id) || [] }))
}

export async function updateProductFeedback(viewerRole: string, id: string, patch: { message?: string; completed?: boolean }) {
  if (!canViewAll(viewerRole)) throw { status: 403, message: 'Only Owner or HR can edit feedback' }
  const hasMessage = patch.message !== undefined
  const hasCompleted = patch.completed !== undefined
  if (!hasMessage && !hasCompleted) throw { status: 400, message: 'No changes provided' }

  let trimmed: string | undefined
  if (hasMessage) {
    trimmed = String(patch.message || '').trim()
    if (!trimmed) throw { status: 400, message: 'Feedback message is required' }
    if (trimmed.length > MAX_FEEDBACK_LENGTH) throw { status: 400, message: `Feedback is too long (max ${MAX_FEEDBACK_LENGTH} characters)` }
  }

  const completed = Boolean(patch.completed)

  let updatedRows: any[] = []
  if (hasMessage && hasCompleted) {
    updatedRows = await runFeedbackQuery(() =>
      prisma.$queryRaw<any[]>`
        UPDATE "ProductFeedback"
        SET "message" = ${trimmed!}, "completed" = ${completed}, "completedAt" = ${completed ? new Date() : null}
        WHERE "id" = ${id}
        RETURNING "id", "userId", "userName", "userEmail", "userRole", "message", "pageUrl", "completed", "completedAt", "forwardedAt", "forwardError", "createdAt"
      `
    )
  } else if (hasMessage) {
    updatedRows = await runFeedbackQuery(() =>
      prisma.$queryRaw<any[]>`
        UPDATE "ProductFeedback"
        SET "message" = ${trimmed!}
        WHERE "id" = ${id}
        RETURNING "id", "userId", "userName", "userEmail", "userRole", "message", "pageUrl", "completed", "completedAt", "forwardedAt", "forwardError", "createdAt"
      `
    )
  } else if (hasCompleted) {
    updatedRows = await runFeedbackQuery(() =>
      prisma.$queryRaw<any[]>`
        UPDATE "ProductFeedback"
        SET "completed" = ${completed}, "completedAt" = ${completed ? new Date() : null}
        WHERE "id" = ${id}
        RETURNING "id", "userId", "userName", "userEmail", "userRole", "message", "pageUrl", "completed", "completedAt", "forwardedAt", "forwardError", "createdAt"
      `
    )
  }

  const updated = updatedRows[0]
  if (!updated) throw { status: 404, message: 'Feedback not found' }
  return mapFeedback(updated)
}

export async function deleteProductFeedback(viewerRole: string, id: string) {
  if (!canViewAll(viewerRole)) throw { status: 403, message: 'Only Owner or HR can delete feedback' }
  const deletedRows = await runFeedbackQuery(() =>
    prisma.$queryRaw<any[]>`
      DELETE FROM "ProductFeedback"
      WHERE "id" = ${id}
      RETURNING "id"
    `
  )
  if (!deletedRows[0]) throw { status: 404, message: 'Feedback not found' }
  return { id, deleted: true as const }
}

export async function retryProductFeedbackForward(viewerRole: string, id: string) {
  if (!canViewAll(viewerRole)) throw { status: 403, message: 'Only Owner or HR can retry feedback email forwarding' }

  const rows = await runFeedbackQuery(() =>
    prisma.$queryRaw<any[]>`
      SELECT "id", "userId", "userName", "userEmail", "userRole", "message", "pageUrl", "completed", "completedAt", "forwardedAt", "forwardError", "createdAt"
      FROM "ProductFeedback"
      WHERE "id" = ${id}
      LIMIT 1
    `
  )
  const row = rows[0]
  if (!row) throw { status: 404, message: 'Feedback not found' }

  try {
    await queueFeedbackEmailForward(row, 'retry')
    const updatedRows = await runFeedbackQuery(() =>
      prisma.$queryRaw<any[]>`
        UPDATE "ProductFeedback"
        SET "forwardedAt" = NOW(), "forwardError" = NULL
        WHERE "id" = ${row.id}
        RETURNING "id", "userId", "userName", "userEmail", "userRole", "message", "pageUrl", "completed", "completedAt", "forwardedAt", "forwardError", "createdAt"
      `
    )
    return mapFeedback(updatedRows[0] ?? row)
  } catch (err: unknown) {
    const msg = extractForwardErrorMessage(err)
    const updatedRows = await runFeedbackQuery(() =>
      prisma.$queryRaw<any[]>`
        UPDATE "ProductFeedback"
        SET "forwardError" = ${msg.slice(0, 1000)}
        WHERE "id" = ${row.id}
        RETURNING "id", "userId", "userName", "userEmail", "userRole", "message", "pageUrl", "completed", "completedAt", "forwardedAt", "forwardError", "createdAt"
      `
    )
    return mapFeedback(updatedRows[0] ?? row)
  }
}

export async function addProductFeedbackComment(input: {
  viewerRole: string
  feedbackId: string
  authorId: string
  body: string
}) {
  if (!canViewAll(input.viewerRole)) throw { status: 403, message: 'Only Owner or HR can comment on feedback' }
  const body = String(input.body || '').trim()
  if (!body) throw { status: 400, message: 'Comment is required' }
  if (body.length > MAX_COMMENT_LENGTH) throw { status: 400, message: `Comment is too long (max ${MAX_COMMENT_LENGTH} characters)` }

  const feedbackRows = await runFeedbackQuery(() =>
    prisma.$queryRaw<any[]>`
      SELECT "id"
      FROM "ProductFeedback"
      WHERE "id" = ${input.feedbackId}
      LIMIT 1
    `
  )
  if (!feedbackRows[0]) throw { status: 404, message: 'Feedback not found' }

  const author = await prisma.user.findUnique({
    where: { id: input.authorId },
    select: { firstName: true, lastName: true, email: true },
  })
  if (!author) throw { status: 404, message: 'User not found' }
  const authorName = `${author.firstName || ''} ${author.lastName || ''}`.trim() || author.email

  const rows = await runFeedbackQuery(() =>
    prisma.$queryRaw<any[]>`
      INSERT INTO "ProductFeedbackComment" ("id", "feedbackId", "authorId", "authorName", "body", "createdAt")
      VALUES (${randomUUID()}, ${input.feedbackId}, ${input.authorId}, ${authorName}, ${body}, NOW())
      RETURNING "id", "feedbackId", "authorId", "authorName", "body", "createdAt"
    `
  )
  const created = rows[0]
  if (!created) throw new Error('Could not create feedback comment')
  return mapFeedbackComment(created)
}
