import { prisma } from '../lib/prisma'
import { uploadBlob, getBlobSasUrl, deleteBlob } from './blobStorageService'
import {
    mirrorCertificateFromTrainingDocument,
    deleteLinkedCertificate,
} from './certificateTrainingSync'

const ROLES_OWNER_HR = ['owner', 'hr']
const TRAINING_META_PREFIX = '__training_meta__:'

function ensureOwnerOrHr(role: string) {
    if (!ROLES_OWNER_HR.includes(role)) throw { status: 403, message: 'Only Owner or HR can manage employee documents' }
}

function encodeTrainingDisplayName(courseName: string, hoursCompleted?: string, trainingFacility?: string) {
    const payload = {
        courseName: courseName.trim(),
        hoursCompleted: typeof hoursCompleted === 'string' && hoursCompleted.trim() !== '' ? Number(hoursCompleted) : undefined,
        trainingFacility: trainingFacility?.trim() || undefined,
    }
    return `${TRAINING_META_PREFIX}${JSON.stringify(payload)}`
}

function decodeTrainingDisplayName(rawDisplayName: string | null, fallbackOriginalName: string) {
    const raw = rawDisplayName?.trim() || ''
    if (!raw.startsWith(TRAINING_META_PREFIX)) {
        return {
            name: raw || fallbackOriginalName,
            hoursCompleted: undefined as number | undefined,
            trainingFacility: undefined as string | undefined,
        }
    }
    try {
        const parsed = JSON.parse(raw.slice(TRAINING_META_PREFIX.length)) as {
            courseName?: string
            hoursCompleted?: number
            trainingFacility?: string
        }
        return {
            name: parsed.courseName?.trim() || fallbackOriginalName,
            hoursCompleted: typeof parsed.hoursCompleted === 'number' && Number.isFinite(parsed.hoursCompleted)
                ? parsed.hoursCompleted
                : undefined,
            trainingFacility: parsed.trainingFacility?.trim() || undefined,
        }
    } catch {
        return {
            name: fallbackOriginalName,
            hoursCompleted: undefined as number | undefined,
            trainingFacility: undefined as string | undefined,
        }
    }
}

function mapDocRow(d: {
    id: string
    category: string
    originalName: string
    displayName: string | null
    uploadedAt: Date
    expiresAt: string | null
    completedAt: string | null
    filePath?: string | null
    mimeType?: string | null
    licenseNumber?: string | null
    certificateId?: string | null
}) {
    const decoded =
        d.category === 'training'
            ? decodeTrainingDisplayName(d.displayName ?? null, d.originalName)
            : { name: d.displayName || d.originalName, hoursCompleted: undefined, trainingFacility: undefined }
    return {
        ...decoded,
        id: d.id,
        category: d.category,
        originalName: d.originalName,
        uploadedAt: d.uploadedAt.toISOString().slice(0, 10),
        expiresAt: d.expiresAt ?? undefined,
        completedAt: d.completedAt ?? undefined,
        licenseNumber: d.licenseNumber ?? undefined,
        certificateId: d.certificateId ?? undefined,
        hasFile: Boolean((d.filePath ?? '').trim() && (d.mimeType || d.category !== 'training')),
    }
}

async function syncTrainingToCertificate(
    doc: {
        id: string
        employeeId: string
        displayName: string | null
        originalName: string
        expiresAt: string | null
        completedAt: string | null
        filePath: string | null
        certificateId?: string | null
    },
    holderName: string,
    uploaderId: string,
    uploaderName: string
) {
    try {
        await mirrorCertificateFromTrainingDocument(doc, holderName, uploaderId, uploaderName)
    } catch (e) {
        console.error('[employeeDocumentService] Failed to sync training to Certificate:', e)
    }
}

export async function listByEmployee(employeeId: string, requestRole: string) {
    ensureOwnerOrHr(requestRole)
    const docs = await prisma.employeeDocument.findMany({
        where: { employeeId },
        orderBy: { uploadedAt: 'desc' },
        select: {
            id: true,
            category: true,
            filePath: true,
            mimeType: true,
            originalName: true,
            displayName: true,
            uploadedAt: true,
            expiresAt: true,
            completedAt: true,
            licenseNumber: true,
            certificateId: true,
        },
    })
    return docs.map(mapDocRow)
}

export async function createLicenseRecord(
    uploaderId: string,
    requestRole: string,
    employeeId: string,
    body: {
        displayName?: string
        licenseNumber?: string
        completedAt?: string
    }
) {
    ensureOwnerOrHr(requestRole)
    const employee = await prisma.user.findUnique({
        where: { id: employeeId },
        select: { id: true },
    })
    if (!employee) throw { status: 404, message: 'Employee not found' }

    const doc = await prisma.employeeDocument.create({
        data: {
            employeeId,
            category: 'license',
            filePath: '',
            originalName: body.displayName?.trim() || 'Licence',
            mimeType: null,
            sizeBytes: null,
            uploadedById: uploaderId,
            displayName: body.displayName?.trim() || 'Licence',
            licenseNumber: body.licenseNumber?.trim() || null,
            completedAt: body.completedAt?.trim() || null,
        },
        select: {
            id: true,
            category: true,
            originalName: true,
            displayName: true,
            uploadedAt: true,
            expiresAt: true,
            completedAt: true,
            filePath: true,
            mimeType: true,
            licenseNumber: true,
            certificateId: true,
        },
    })
    return mapDocRow(doc)
}

export async function upload(
    uploaderId: string,
    requestRole: string,
    employeeId: string,
    file: Express.Multer.File,
    body: {
        category: string
        expiresAt?: string
        completedAt?: string
        displayName?: string
        licenseNumber?: string
        hoursCompleted?: string
        trainingFacility?: string
    },
    uploaderName?: string
) {
    ensureOwnerOrHr(requestRole)
    const category = (body.category || 'hiring').toLowerCase()
    if (!['license', 'certification', 'training', 'hiring'].includes(category)) {
        throw { status: 400, message: 'Invalid category. Use license, certification, training, or hiring.' }
    }
    const employee = await prisma.user.findUnique({
        where: { id: employeeId },
        select: { id: true, firstName: true, lastName: true },
    })
    if (!employee) throw { status: 404, message: 'Employee not found' }

    const blobName = await uploadBlob(file.path, 'employee_documents')
    const displayNameForStorage =
        category === 'training'
            ? encodeTrainingDisplayName(body.displayName?.trim() || file.originalname, body.hoursCompleted, body.trainingFacility)
            : body.displayName?.trim() || null

    const doc = await prisma.employeeDocument.create({
        data: {
            employeeId,
            category,
            filePath: blobName,
            originalName: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            uploadedById: uploaderId,
            expiresAt: body.expiresAt?.trim() || null,
            completedAt: body.completedAt?.trim() || null,
            displayName: displayNameForStorage,
            licenseNumber: category === 'license' ? body.licenseNumber?.trim() || null : null,
        },
        select: {
            id: true,
            category: true,
            filePath: true,
            originalName: true,
            displayName: true,
            uploadedAt: true,
            expiresAt: true,
            completedAt: true,
            mimeType: true,
            licenseNumber: true,
            certificateId: true,
        },
    })

    const holderName = `${employee.firstName} ${employee.lastName}`.trim()
    if (category === 'training') {
        await syncTrainingToCertificate(
            { ...doc, employeeId },
            holderName,
            uploaderId,
            uploaderName || holderName
        )
    }

    return mapDocRow(doc)
}

export async function createTrainingRecord(
    uploaderId: string,
    requestRole: string,
    employeeId: string,
    body: {
        expiresAt?: string
        completedAt?: string
        displayName?: string
        hoursCompleted?: string
        trainingFacility?: string
    },
    uploaderName?: string
) {
    ensureOwnerOrHr(requestRole)
    const employee = await prisma.user.findUnique({
        where: { id: employeeId },
        select: { id: true, firstName: true, lastName: true },
    })
    if (!employee) throw { status: 404, message: 'Employee not found' }

    const displayNameForStorage = encodeTrainingDisplayName(
        body.displayName?.trim() || 'Training record',
        body.hoursCompleted,
        body.trainingFacility
    )

    const doc = await prisma.employeeDocument.create({
        data: {
            employeeId,
            category: 'training',
            filePath: '',
            originalName: body.displayName?.trim() || 'Training record',
            mimeType: null,
            sizeBytes: null,
            uploadedById: uploaderId,
            expiresAt: body.expiresAt?.trim() || null,
            completedAt: body.completedAt?.trim() || null,
            displayName: displayNameForStorage,
        },
        select: {
            id: true,
            category: true,
            originalName: true,
            displayName: true,
            uploadedAt: true,
            expiresAt: true,
            completedAt: true,
            filePath: true,
            mimeType: true,
            licenseNumber: true,
            certificateId: true,
        },
    })

    const holderName = `${employee.firstName} ${employee.lastName}`.trim()
    await syncTrainingToCertificate(
        { ...doc, employeeId },
        holderName,
        uploaderId,
        uploaderName || holderName
    )

    return mapDocRow(doc)
}

export async function getFileUrl(docId: string, requestUserId: string, requestRole: string) {
    ensureOwnerOrHr(requestRole)
    const doc = await prisma.employeeDocument.findUnique({
        where: { id: docId },
        select: { id: true, filePath: true, employeeId: true },
    })
    if (!doc) throw { status: 404, message: 'Document not found' }
    const blobKey = (doc.filePath ?? '').trim()
    if (!blobKey) throw { status: 404, message: 'No file stored for this record' }
    const url = await getBlobSasUrl(blobKey, 30)
    return { url, expiresInMinutes: 30 }
}

export async function getFileMeta(docId: string, requestRole: string) {
    ensureOwnerOrHr(requestRole)
    const doc = await prisma.employeeDocument.findUnique({
        where: { id: docId },
        select: { id: true, filePath: true, originalName: true, mimeType: true },
    })
    if (!doc) throw { status: 404, message: 'Document not found' }
    if (!(doc.filePath ?? '').trim()) throw { status: 404, message: 'No file stored for this record' }
    return doc
}

export async function remove(docId: string, requestRole: string) {
    ensureOwnerOrHr(requestRole)
    const doc = await prisma.employeeDocument.findUnique({
        where: { id: docId },
        select: { id: true, filePath: true, category: true, certificateId: true },
    })
    if (!doc) throw { status: 404, message: 'Document not found' }
    const blobKey = (doc.filePath ?? '').trim()
    if (blobKey) {
        try {
            await deleteBlob(blobKey)
        } catch (err) {
            const msg = `${(err as Error)?.message ?? ''}`.toLowerCase()
            const isBlobMissing =
                msg.includes('not found') ||
                msg.includes('blobnotfound') ||
                msg.includes('does not exist')
            if (!isBlobMissing) throw err
        }
    }
    if (doc.category === 'training') {
        try {
            await deleteLinkedCertificate(docId)
        } catch (e) {
            console.error('[employeeDocumentService] Failed to delete linked Certificate:', e)
        }
    }
    await prisma.employeeDocument.delete({ where: { id: docId } })
    return { deleted: true }
}
