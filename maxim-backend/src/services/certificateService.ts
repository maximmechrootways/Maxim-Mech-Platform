import { prisma } from '../lib/prisma'
import { canViewFeature } from '../config/permissions'
import {
    mirrorTrainingDocumentFromCertificate,
    deleteLinkedTrainingDocument,
} from './certificateTrainingSync'
import { getLabourerIdsSupervisedBy } from './jobService'

const EXPIRING_DAYS = 30

function certStatus(expirationDate: string): 'current' | 'expiring-soon' | 'expired' {
    const today = new Date().toISOString().slice(0, 10)
    const in30 = new Date(Date.now() + EXPIRING_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    if (expirationDate < today) return 'expired'
    if (expirationDate <= in30) return 'expiring-soon'
    return 'current'
}

function mapCert(c: any) {
    return {
        id: c.id,
        name: c.name,
        holderName: c.holderName,
        holderUserId: c.holderUserId ?? undefined,
        issueDate: c.issueDate ?? undefined,
        expirationDate: c.expirationDate ?? undefined,
        uploadedAt: c.uploadedAt?.toISOString?.() ?? c.uploadedAt,
        uploadedBy: c.uploadedBy,
        fileName: c.fileName ?? undefined,
        filePath: c.filePath ?? undefined,
        employeeDocumentId: c.employeeDocumentId ?? undefined,
        expirationReminderSentAt: c.expirationReminderSentAt?.toISOString?.() ?? undefined,
    }
}

function canManageCertificates(userRole: string) {
    return userRole === 'owner' || userRole === 'hr'
}

async function assertSupervisorMayViewCertificate(supervisorUserId: string, holderUserId: string | null | undefined) {
    if (!holderUserId) {
        throw { status: 403, message: 'You can only view certificates for your supervised team members' }
    }
    const teamIds = await getLabourerIdsSupervisedBy(supervisorUserId)
    if (!teamIds.includes(holderUserId)) {
        throw { status: 403, message: 'You can only view certificates for your supervised team members' }
    }
}

export async function listCertificates(userId: string, userRole: string) {
    if (!canViewFeature(userRole, 'certificates')) {
        throw { status: 403, message: 'You do not have permission to list certificates' }
    }

    if (canManageCertificates(userRole)) {
        const list = await prisma.certificate.findMany({
            orderBy: [{ expirationDate: { sort: 'asc', nulls: 'last' } }, { uploadedAt: 'desc' }],
        })
        return list.map(mapCert)
    }

    const teamIds = await getLabourerIdsSupervisedBy(userId)
    if (teamIds.length === 0) return []

    const list = await prisma.certificate.findMany({
        where: { holderUserId: { in: teamIds } },
        orderBy: [{ expirationDate: { sort: 'asc', nulls: 'last' } }, { uploadedAt: 'desc' }],
    })
    return list.map(mapCert)
}

export async function getCertificateById(id: string, userId: string, userRole: string) {
    if (!canViewFeature(userRole, 'certificates')) {
        throw { status: 403, message: 'You do not have permission to view certificates' }
    }
    const c = await prisma.certificate.findUnique({ where: { id } })
    if (!c) throw { status: 404, message: 'Certificate not found' }
    if (!canManageCertificates(userRole)) {
        await assertSupervisorMayViewCertificate(userId, c.holderUserId)
    }
    return mapCert(c)
}

export async function createCertificate(userId: string, userRole: string, userName: string, data: {
    name: string
    holderName: string
    holderUserId?: string
    issueDate?: string
    expirationDate?: string
    fileName?: string
    filePath?: string
}) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can create certificates' }
    let cert = await prisma.certificate.create({
        data: {
            name: data.name.trim(),
            holderName: data.holderName.trim(),
            holderUserId: data.holderUserId?.trim() || null,
            issueDate: data.issueDate?.trim() || null,
            expirationDate: data.expirationDate?.trim() || null,
            uploadedById: userId,
            uploadedBy: userName,
            fileName: data.fileName?.trim() || null,
            filePath: data.filePath?.trim() || null,
        } as any,
    })
    if (cert.holderUserId) {
        try {
            const mirrored = await mirrorTrainingDocumentFromCertificate({
                id: cert.id,
                name: cert.name,
                holderUserId: cert.holderUserId,
                expirationDate: cert.expirationDate,
                issueDate: cert.issueDate,
                filePath: cert.filePath,
                fileName: cert.fileName,
                uploadedById: cert.uploadedById,
            })
            if (mirrored && !cert.employeeDocumentId) {
                cert = await prisma.certificate.update({
                    where: { id: cert.id },
                    data: { employeeDocumentId: mirrored.id },
                })
            }
        } catch (e) {
            console.error('[certificateService] Failed to mirror training document:', e)
        }
    }
    return mapCert(cert)
}

export async function updateCertificate(id: string, userRole: string, data: Partial<{
    name: string
    holderName: string
    holderUserId: string
    issueDate: string
    expirationDate: string
    fileName: string
    filePath: string
    expirationReminderSentAt: string
}>) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can update certificates' }
    const existing = await prisma.certificate.findUnique({ where: { id } })
    if (!existing) throw { status: 404, message: 'Certificate not found' }
    let cert = await prisma.certificate.update({
        where: { id },
        data: {
            ...(data.name !== undefined && { name: data.name.trim() }),
            ...(data.holderName !== undefined && { holderName: data.holderName.trim() }),
            ...(data.holderUserId !== undefined && { holderUserId: data.holderUserId?.trim() || null }),
            ...(data.issueDate !== undefined && { issueDate: data.issueDate?.trim() || null }),
            ...(data.expirationDate !== undefined && { expirationDate: data.expirationDate?.trim() || null }),
            ...(data.fileName !== undefined && { fileName: data.fileName?.trim() || null }),
            ...(data.filePath !== undefined && { filePath: data.filePath?.trim() || null }),
            ...(data.expirationReminderSentAt !== undefined && { expirationReminderSentAt: data.expirationReminderSentAt ? new Date(data.expirationReminderSentAt) : null }),
        } as any,
    })
    if (cert.holderUserId) {
        try {
            const mirrored = await mirrorTrainingDocumentFromCertificate({
                id: cert.id,
                name: cert.name,
                holderUserId: cert.holderUserId,
                expirationDate: cert.expirationDate,
                issueDate: cert.issueDate,
                filePath: cert.filePath,
                fileName: cert.fileName,
                uploadedById: cert.uploadedById,
            })
            if (mirrored && !cert.employeeDocumentId) {
                cert = await prisma.certificate.update({
                    where: { id: cert.id },
                    data: { employeeDocumentId: mirrored.id },
                })
            }
        } catch (e) {
            console.error('[certificateService] Failed to mirror training document on update:', e)
        }
    }
    return mapCert(cert)
}

export async function deleteCertificate(id: string, userRole: string) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can delete certificates' }
    try {
        await deleteLinkedTrainingDocument(id)
    } catch (e) {
        console.error('[certificateService] Failed to delete linked training document:', e)
    }
    await prisma.certificate.delete({ where: { id } }).catch(() => {
        throw { status: 404, message: 'Certificate not found' }
    })
    return { message: 'Deleted' }
}

export async function markCertificateReminderSent(id: string, userRole: string) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can update certificates' }
    const cert = await prisma.certificate.update({
        where: { id },
        data: { expirationReminderSentAt: new Date() },
    })
    return mapCert(cert)
}
