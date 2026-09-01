import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'

const ALLOWED_ROLES = new Set(['owner', 'hr', 'supervisor'])

export function assertCanAccessOfflineSubcontractorForms(role: string) {
    if (!ALLOWED_ROLES.has(role)) {
        throw { status: 403, message: 'Forbidden' }
    }
}

type FormRow = {
    id: string
    title: string
    filePath: string | null
    originalName: string | null
    mimeType: string | null
    sizeBytes: number | null
    uploadedById: string | null
    createdAt: Date | string
    firstName: string | null
    lastName: string | null
    email: string | null
}

function mapRecord(f: FormRow) {
    const uploadedByName =
        [f.firstName ?? '', f.lastName ?? ''].filter(Boolean).join(' ').trim()
        || f.email
        || 'Unknown user'
    const createdAt = new Date(f.createdAt)
    return {
        id: f.id,
        title: f.title,
        filePath: f.filePath ?? '',
        originalName: f.originalName ?? '',
        mimeType: f.mimeType ?? undefined,
        sizeBytes: f.sizeBytes ?? undefined,
        uploadedById: f.uploadedById ?? '',
        uploadedByName,
        createdAt: createdAt.toISOString(),
    }
}

export async function listOfflineSubcontractorForms() {
    const rows = await prisma.$queryRaw<FormRow[]>`
        SELECT
            f."id",
            f."title",
            f."filePath",
            f."originalName",
            f."mimeType",
            f."sizeBytes",
            f."uploadedById",
            f."createdAt",
            u."firstName",
            u."lastName",
            u."email"
        FROM "OfflineSubcontractorForm" f
        INNER JOIN "User" u ON u."id" = f."uploadedById"
        ORDER BY f."createdAt" DESC
    `
    return rows.map(mapRecord)
}

export async function createOfflineSubcontractorForm(
    userId: string,
    data: { title: string; filePath: string; originalName: string; mimeType: string; sizeBytes: number }
) {
    const id = randomUUID()
    await prisma.$executeRaw`
        INSERT INTO "OfflineSubcontractorForm"
            ("id", "title", "filePath", "originalName", "mimeType", "sizeBytes", "uploadedById", "createdAt")
        VALUES
            (${id}, ${data.title}, ${data.filePath}, ${data.originalName}, ${data.mimeType}, ${data.sizeBytes}, ${userId}, NOW())
    `
    const rows = await prisma.$queryRaw<FormRow[]>`
        SELECT
            f."id",
            f."title",
            f."filePath",
            f."originalName",
            f."mimeType",
            f."sizeBytes",
            f."uploadedById",
            f."createdAt",
            u."firstName",
            u."lastName",
            u."email"
        FROM "OfflineSubcontractorForm" f
        INNER JOIN "User" u ON u."id" = f."uploadedById"
        WHERE f."id" = ${id}
        LIMIT 1
    `
    if (rows.length === 0) throw { status: 500, message: 'Failed to create form upload record' }
    return mapRecord(rows[0])
}

export async function deleteOfflineSubcontractorForm(id: string) {
    const rows = await prisma.$queryRaw<Array<{ id: string; filePath: string }>>`
        SELECT "id", "filePath"
        FROM "OfflineSubcontractorForm"
        WHERE "id" = ${id}
        LIMIT 1
    `
    if (rows.length === 0) throw { status: 404, message: 'Not found' }
    await prisma.$executeRaw`
        DELETE FROM "OfflineSubcontractorForm"
        WHERE "id" = ${id}
    `
    return rows[0]
}
