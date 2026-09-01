import { prisma } from '../lib/prisma'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import * as jobService from './jobService'

const ROLES = ['owner', 'hr', 'supervisor']

function canAccess(role: string) {
    if (!ROLES.includes(role)) throw { status: 403, message: 'Insufficient role for near-miss reports' }
}

function isOwnerOrHr(role: string) {
    return role === 'owner' || role === 'hr'
}

const WIN_ANSI_REPLACEMENTS: Record<string, string> = {
    '–': '-',
    '—': '-',
    '−': '-',
    '…': '...',
    '•': '*',
}

function toWinAnsiSafeText(value: unknown): string {
    const raw = String(value ?? '')
    const replaced = raw.replace(/[–—−…•]/g, (char) => WIN_ANSI_REPLACEMENTS[char] ?? char)
    const normalized = replaced.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    return normalized.replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '?')
}

function wrapPdfText(text: string, maxWidth: number, font: any, fontSize: number): string[] {
    const raw = toWinAnsiSafeText(text).replace(/\r/g, '')
    const inputLines = raw.split('\n')
    const output: string[] = []
    for (const line of inputLines) {
        const words = line.split(/\s+/).filter(Boolean)
        if (words.length === 0) {
            output.push('')
            continue
        }
        let current = words[0]
        for (let i = 1; i < words.length; i++) {
            const next = `${current} ${words[i]}`
            if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
                current = next
            } else {
                output.push(current)
                current = words[i]
            }
        }
        output.push(current)
    }
    return output
}

export async function buildNearMissSummaryPdfBuffer(record: {
    id: string
    siteName?: string | null
    reportedBy?: string | null
    reportedAt?: Date | string | null
    description?: string | null
    status?: string | null
    followUpNotes?: string | null
    correctiveAction?: string | null
    correctiveActionDate?: Date | string | null
    reportCompletedBy?: string | null
}) {
    const doc = await PDFDocument.create()
    const regular = await doc.embedFont(StandardFonts.Helvetica)
    const bold = await doc.embedFont(StandardFonts.HelveticaBold)
    const margin = 40
    const titleSize = 14
    const textSize = 11
    const lineHeight = 16

    let page = doc.addPage()
    let { width, height } = page.getSize()
    let y = height - margin

    const ensureSpace = (needed = lineHeight) => {
        if (y - needed < margin) {
            page = doc.addPage()
            ;({ width, height } = page.getSize())
            y = height - margin
        }
    }

    const drawLine = (line: string, options?: { isBold?: boolean; size?: number }) => {
        const size = options?.size ?? textSize
        ensureSpace(lineHeight + 2)
        page.drawText(toWinAnsiSafeText(line), {
            x: margin,
            y,
            size,
            font: options?.isBold ? bold : regular,
        })
        y -= lineHeight
    }

    const drawParagraph = (label: string, text: string) => {
        drawLine(label, { isBold: true })
        const lines = wrapPdfText(text || '—', width - margin * 2, regular, textSize)
        for (const line of lines) drawLine(line)
        y -= 4
    }

    drawLine('Near Miss Report', { isBold: true, size: titleSize })
    drawLine(`Site: ${record.siteName ?? '—'}`)
    drawLine(`Reported by: ${record.reportedBy ?? '—'}`)
    drawLine(`Reported at: ${record.reportedAt ? new Date(record.reportedAt).toLocaleString() : '—'}`)
    drawLine(`Status: ${record.status ?? 'open'}`)
    y -= 4
    drawParagraph('Description:', record.description ?? '—')
    if (record.correctiveAction) {
        drawParagraph('Corrective action to be taken:', record.correctiveAction)
    }
    if (record.correctiveActionDate) {
        drawLine(`Date of corrective action: ${new Date(record.correctiveActionDate).toLocaleDateString()}`)
    }
    if (record.reportCompletedBy) {
        drawLine(`Report completed by: ${record.reportCompletedBy}`)
    }
    if (record.followUpNotes) {
        drawParagraph('Follow-up notes:', record.followUpNotes)
    }

    const bytes = await doc.save()
    return Buffer.from(bytes)
}

export async function getNearMissPdfBuffer(id: string, userId: string, role: string): Promise<Buffer> {
    canAccess(role)
    const r = await prisma.nearMiss.findUnique({ where: { id } })
    if (!r) throw { status: 404, message: 'Near-miss report not found' }

    if (!isOwnerOrHr(role)) {
        if (role === 'supervisor') {
            const labourerIds = await jobService.getLabourerIdsSupervisedBy(userId)
            const canView =
                r.reportedById === userId || (r.reportedById != null && labourerIds.includes(r.reportedById))
            if (!canView) throw { status: 403, message: 'Forbidden' }
        } else if (r.reportedById !== userId) {
            throw { status: 403, message: 'Forbidden' }
        }
    }

    return buildNearMissSummaryPdfBuffer(r)
}

function map(r: any) {
    return {
        id: r.id,
        siteId: r.siteId ?? undefined,
        siteName: r.siteName,
        reportedBy: r.reportedBy,
        reportedById: r.reportedById ?? undefined,
        reportedAt: r.reportedAt?.toISOString?.() ?? undefined,
        description: r.description,
        status: r.status,
        followUpNotes: r.followUpNotes ?? undefined,
        correctiveAction: r.correctiveAction ?? undefined,
        correctiveActionDate: r.correctiveActionDate?.toISOString?.() ?? undefined,
        reportCompletedBy: r.reportCompletedBy ?? undefined,
    }
}

export async function listNearMisses(role: string, query: { status?: string; siteId?: string }) {
    canAccess(role)
    const where: any = {}
    if (query.status) where.status = query.status
    if (query.siteId) where.siteId = query.siteId
    const list = await prisma.nearMiss.findMany({
        where,
        orderBy: { reportedAt: 'desc' },
    })
    return list.map(map)
}

export async function getNearMissById(id: string, role: string) {
    canAccess(role)
    const r = await prisma.nearMiss.findUnique({ where: { id } })
    if (!r) throw { status: 404, message: 'Near-miss report not found' }
    return map(r)
}

export async function createNearMiss(userId: string, role: string, userName: string, data: any) {
    canAccess(role)
    const correctiveActionDate =
        data.correctiveActionDate != null && String(data.correctiveActionDate).trim() !== ''
            ? new Date(data.correctiveActionDate)
            : null

    const r = await prisma.nearMiss.create({
        data: {
            siteId: data.siteId?.trim() || null,
            siteName: (data.siteName || '').trim(),
            reportedBy: data.reportedBy?.trim() || userName,
            reportedById: userId,
            description: (data.description || '').trim(),
            status: data.status || 'open',
            followUpNotes: data.followUpNotes?.trim() || null,
            correctiveAction: data.correctiveAction?.trim() || null,
            correctiveActionDate: Number.isNaN(correctiveActionDate?.getTime()) ? null : correctiveActionDate,
            reportCompletedBy: data.reportCompletedBy?.trim() || null,
        },
    })
    return map(r)
}

export async function updateNearMiss(id: string, role: string, data: any) {
    canAccess(role)
    const existing = await prisma.nearMiss.findUnique({ where: { id } })
    if (!existing) throw { status: 404, message: 'Near-miss report not found' }
    let correctiveActionDateUpdate: Date | null | undefined
    if (data.correctiveActionDate !== undefined) {
        if (data.correctiveActionDate == null || String(data.correctiveActionDate).trim() === '') {
            correctiveActionDateUpdate = null
        } else {
            const d = new Date(data.correctiveActionDate)
            correctiveActionDateUpdate = Number.isNaN(d.getTime()) ? null : d
        }
    }

    const r = await prisma.nearMiss.update({
        where: { id },
        data: {
            ...(data.siteName !== undefined && { siteName: data.siteName.trim() }),
            ...(data.siteId !== undefined && { siteId: data.siteId?.trim() || null }),
            ...(data.reportedBy !== undefined && { reportedBy: data.reportedBy.trim() }),
            ...(data.description !== undefined && { description: data.description.trim() }),
            ...(data.status !== undefined && { status: data.status }),
            ...(data.followUpNotes !== undefined && { followUpNotes: data.followUpNotes?.trim() || null }),
            ...(data.correctiveAction !== undefined && { correctiveAction: data.correctiveAction?.trim() || null }),
            ...(correctiveActionDateUpdate !== undefined && { correctiveActionDate: correctiveActionDateUpdate }),
            ...(data.reportCompletedBy !== undefined && { reportCompletedBy: data.reportCompletedBy?.trim() || null }),
        },
    })
    return map(r)
}

export async function deleteNearMiss(id: string, role: string) {
    canAccess(role)
    await prisma.nearMiss.delete({ where: { id } }).catch(() => {
        throw { status: 404, message: 'Near-miss report not found' }
    })
    return { message: 'Deleted' }
}
