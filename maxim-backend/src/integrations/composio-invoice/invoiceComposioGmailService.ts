import fs from 'fs'
import { env } from '../../config/env'
import { getInvoiceComposioClient, resolveInvoiceInboxIdentity } from './invoiceComposioClient'

export type GmailAttachmentMeta = {
    attachmentId: string
    filename: string
    mimeType: string
    size?: number
}

export type FetchedGmailMessage = {
    messageId: string
    threadId?: string
    subject: string
    from: string
    to: string
    receivedAt?: Date
    bodyText: string
    bodyHtml: string
    attachments: GmailAttachmentMeta[]
}

function unwrapToolData(result: unknown): Record<string, unknown> {
    const root = result as { data?: unknown }
    const data = root?.data
    if (data && typeof data === 'object') return data as Record<string, unknown>
    if (result && typeof result === 'object') return result as Record<string, unknown>
    return {}
}

function decodeBase64Url(input: string): Buffer {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
    const pad = normalized.length % 4
    const padded = pad ? normalized + '='.repeat(4 - pad) : normalized
    return Buffer.from(padded, 'base64')
}

function extractBodyFromPayload(payload: unknown): { text: string; html: string } {
    let text = ''
    let html = ''
    const walk = (node: unknown) => {
        if (!node || typeof node !== 'object') return
        const part = node as { mimeType?: string; body?: { data?: string }; parts?: unknown[] }
        const mime = String(part.mimeType || '').toLowerCase()
        const data = part.body?.data
        if (data && mime === 'text/plain') {
            text += decodeBase64Url(data).toString('utf8')
        } else if (data && mime === 'text/html') {
            html += decodeBase64Url(data).toString('utf8')
        }
        if (Array.isArray(part.parts)) {
            for (const child of part.parts) walk(child)
        }
    }
    walk(payload)
    return { text: text.trim(), html: html.trim() }
}

const PROCESSABLE_ATTACHMENT_MIME_TYPES = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/tiff',
])

export function isProcessableInvoiceAttachment(filename: string, mimeType: string): boolean {
    const mime = mimeType.toLowerCase()
    const name = filename.toLowerCase()
    if (PROCESSABLE_ATTACHMENT_MIME_TYPES.has(mime)) return true
    if (name.endsWith('.pdf')) return true
    if (/\.(png|jpe?g|webp|tiff?)$/.test(name)) return true
    return false
}

function normalizeAttachments(raw: unknown): GmailAttachmentMeta[] {
    if (!Array.isArray(raw)) return []
    const out: GmailAttachmentMeta[] = []
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue
        const row = item as Record<string, unknown>
        const attachmentId = String(row.attachmentId || row.attachment_id || row.id || '').trim()
        const filename = String(row.filename || row.name || 'attachment.pdf').trim()
        const mimeType = String(row.mimeType || row.mime_type || 'application/pdf').trim()
        if (!attachmentId) continue
        if (!isProcessableInvoiceAttachment(filename, mimeType)) continue
        out.push({
            attachmentId,
            filename,
            mimeType,
            size: typeof row.size === 'number' ? row.size : undefined,
        })
    }
    return out
}

async function executeGmailTool(toolName: string, arguments_: Record<string, unknown>) {
    const composio = getInvoiceComposioClient()
    const identity = resolveInvoiceInboxIdentity()
    const liveAccount = await composio.connectedAccounts.get(identity.connectedAccountId)
    if (liveAccount.status !== 'ACTIVE') {
        throw new Error(`Invoice inbox connected account is not active (status=${liveAccount.status || 'unknown'})`)
    }
    const result = await composio.tools.execute(toolName, {
        userId: identity.composioUserId,
        connectedAccountId: identity.connectedAccountId,
        version: env.COMPOSIO_INVOICE_GMAIL_TOOLKIT_VERSION,
        arguments: arguments_,
    })
    return unwrapToolData(result)
}

export async function fetchGmailMessageById(messageId: string): Promise<FetchedGmailMessage> {
    const data = await executeGmailTool('GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID', {
        message_id: messageId,
        format: 'full',
    })
    const payload = data.payload || data.message || data
    const payloadObj = payload && typeof payload === 'object' ? payload as Record<string, unknown> : data
    const headers = Array.isArray(payloadObj.headers) ? payloadObj.headers as Array<{ name?: string; value?: string }> : []
    const headerMap = new Map(headers.map((h) => [String(h.name || '').toLowerCase(), String(h.value || '')]))
    const { text, html } = extractBodyFromPayload(payloadObj.payload || payloadObj)
    const attachmentList = normalizeAttachments(
        payloadObj.attachmentList || payloadObj.attachment_list || data.attachmentList || data.attachment_list,
    )
    const internalDate = payloadObj.internalDate || data.internalDate
    const receivedAt = internalDate ? new Date(Number(internalDate)) : undefined
    return {
        messageId: String(data.messageId || data.message_id || data.id || messageId),
        threadId: String(data.threadId || data.thread_id || payloadObj.threadId || '') || undefined,
        subject: headerMap.get('subject') || String(data.subject || ''),
        from: headerMap.get('from') || String(data.sender || data.from || ''),
        to: headerMap.get('to') || String(data.to || ''),
        receivedAt: receivedAt && !Number.isNaN(receivedAt.getTime()) ? receivedAt : undefined,
        bodyText: text || String(data.message_text || data.messageText || data.snippet || ''),
        bodyHtml: html,
        attachments: attachmentList,
    }
}

async function readComposioFilePayload(filePayload: unknown): Promise<Buffer | null> {
    if (!filePayload || typeof filePayload !== 'object') return null
    const file = filePayload as Record<string, unknown>
    const uri = typeof file.uri === 'string' ? file.uri : null
    if (uri && file.file_downloaded && fs.existsSync(uri)) {
        return fs.readFileSync(uri)
    }
    const s3url = typeof file.s3url === 'string' ? file.s3url : null
    if (s3url) {
        const res = await fetch(s3url)
        if (!res.ok) {
            throw new Error(`Gmail attachment download failed (${res.status})`)
        }
        return Buffer.from(await res.arrayBuffer())
    }
    return null
}

export async function downloadGmailAttachment(
    messageId: string,
    attachmentId: string,
    fileName = 'attachment.pdf',
): Promise<Buffer> {
    const data = await executeGmailTool('GMAIL_GET_ATTACHMENT', {
        message_id: messageId,
        attachment_id: attachmentId,
        file_name: fileName,
    })
    const fromFile = await readComposioFilePayload(data.file)
    if (fromFile && fromFile.length > 0) return fromFile

    const encoded = typeof data.data === 'string'
        ? data.data
        : typeof data.content === 'string'
            ? data.content
            : ''
    if (!encoded) throw new Error('Gmail attachment response missing data')
    return decodeBase64Url(encoded)
}

export async function listGmailLabels(): Promise<Array<{ id: string; name: string }>> {
    const data = await executeGmailTool('GMAIL_LIST_LABELS', {})
    const labels = Array.isArray(data.labels) ? data.labels : []
    return labels
        .filter((l): l is Record<string, unknown> => Boolean(l && typeof l === 'object'))
        .map((l) => ({
            id: String(l.id || ''),
            name: String(l.name || ''),
        }))
        .filter((l) => l.id && l.name)
}

export async function ensureProcessedLabel(labelName: string): Promise<string> {
    const existing = await listGmailLabels()
    const match = existing.find((l) => l.name === labelName)
    if (match) return match.id
    try {
        const created = await executeGmailTool('GMAIL_CREATE_LABEL', {
            label_name: labelName,
        })
        const id = String(created.id || created.labelId || created.label_id || '')
        if (id) return id
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!message.toLowerCase().includes('409') && !message.toLowerCase().includes('exist')) {
            throw error
        }
        const retry = await listGmailLabels()
        const again = retry.find((l) => l.name === labelName)
        if (again) return again.id
    }
    throw new Error(`Could not create or find Gmail label "${labelName}"`)
}

export async function markGmailMessageProcessed(messageId: string, processedLabelId: string) {
    await executeGmailTool('GMAIL_ADD_LABEL_TO_EMAIL', {
        message_ids: [messageId],
        add_label_ids: [processedLabelId],
        remove_label_ids: ['UNREAD'],
    })
}

export async function fetchUnreadInvoiceCandidateIds(limit = 25): Promise<string[]> {
    const label = env.COMPOSIO_INVOICE_PROCESSED_LABEL
    const data = await executeGmailTool('GMAIL_FETCH_EMAILS', {
        query: `in:inbox has:attachment -label:"${label}"`,
        max_results: limit,
        ids_only: true,
        include_payload: false,
    })
    const messages = Array.isArray(data.messages) ? data.messages : []
    return messages
        .filter((m): m is Record<string, unknown> => Boolean(m && typeof m === 'object'))
        .map((m) => String(m.messageId || m.message_id || m.id || ''))
        .filter(Boolean)
}

export async function setupInvoiceInboxTrigger(): Promise<{ triggerId: string }> {
    const composio = getInvoiceComposioClient()
    const identity = resolveInvoiceInboxIdentity()
    const label = env.COMPOSIO_INVOICE_PROCESSED_LABEL
    const trigger = await composio.triggers.create(
        identity.composioUserId,
        'GMAIL_NEW_GMAIL_MESSAGE',
        {
            connectedAccountId: identity.connectedAccountId,
            triggerConfig: {
                query: `in:inbox has:attachment -label:"${label}"`,
                interval: 5,
            },
        },
    )
    const triggerId = String(trigger.triggerId || '')
    if (!triggerId) throw new Error('Composio trigger create did not return triggerId')
    return { triggerId }
}

function buildOutgoingSentQuery(): string {
    const label = env.COMPOSIO_INVOICE_OUTGOING_PROCESSED_LABEL
    const sender = env.COMPOSIO_INVOICE_OUTGOING_SENDER.replace(/"/g, '')
    return `in:sent from:${sender} has:attachment -label:"${label}"`
}

export async function fetchSentOutgoingInvoiceCandidateIds(limit = 25): Promise<string[]> {
    const data = await executeGmailTool('GMAIL_FETCH_EMAILS', {
        query: buildOutgoingSentQuery(),
        max_results: limit,
        ids_only: true,
        include_payload: false,
    })
    const messages = Array.isArray(data.messages) ? data.messages : []
    return messages
        .filter((m): m is Record<string, unknown> => Boolean(m && typeof m === 'object'))
        .map((m) => String(m.messageId || m.message_id || m.id || ''))
        .filter(Boolean)
}

export async function setupOutgoingInvoiceSentTrigger(): Promise<{ triggerId: string }> {
    const composio = getInvoiceComposioClient()
    const identity = resolveInvoiceInboxIdentity()
    const trigger = await composio.triggers.create(
        identity.composioUserId,
        'GMAIL_NEW_GMAIL_MESSAGE',
        {
            connectedAccountId: identity.connectedAccountId,
            triggerConfig: {
                query: buildOutgoingSentQuery(),
                interval: 5,
            },
        },
    )
    const triggerId = String(trigger.triggerId || '')
    if (!triggerId) throw new Error('Composio outgoing trigger create did not return triggerId')
    return { triggerId }
}

export async function markGmailMessageOutgoingProcessed(messageId: string, processedLabelId: string) {
    await markGmailMessageProcessed(messageId, processedLabelId)
}
