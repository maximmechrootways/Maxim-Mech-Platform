"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCertificates = listCertificates;
exports.getCertificateById = getCertificateById;
exports.createCertificate = createCertificate;
exports.updateCertificate = updateCertificate;
exports.deleteCertificate = deleteCertificate;
exports.markCertificateReminderSent = markCertificateReminderSent;
const prisma_1 = require("../lib/prisma");
const permissions_1 = require("../config/permissions");
const certificateTrainingSync_1 = require("./certificateTrainingSync");
const jobService_1 = require("./jobService");
const EXPIRING_DAYS = 30;
function certStatus(expirationDate) {
    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + EXPIRING_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (expirationDate < today)
        return 'expired';
    if (expirationDate <= in30)
        return 'expiring-soon';
    return 'current';
}
function mapCert(c) {
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
    };
}
function canManageCertificates(userRole) {
    return userRole === 'owner' || userRole === 'hr';
}
async function assertSupervisorMayViewCertificate(supervisorUserId, holderUserId) {
    if (!holderUserId) {
        throw { status: 403, message: 'You can only view certificates for your supervised team members' };
    }
    const teamIds = await (0, jobService_1.getLabourerIdsSupervisedBy)(supervisorUserId);
    if (!teamIds.includes(holderUserId)) {
        throw { status: 403, message: 'You can only view certificates for your supervised team members' };
    }
}
async function listCertificates(userId, userRole) {
    if (!(0, permissions_1.canViewFeature)(userRole, 'certificates')) {
        throw { status: 403, message: 'You do not have permission to list certificates' };
    }
    if (canManageCertificates(userRole)) {
        const list = await prisma_1.prisma.certificate.findMany({
            orderBy: [{ expirationDate: { sort: 'asc', nulls: 'last' } }, { uploadedAt: 'desc' }],
        });
        return list.map(mapCert);
    }
    const teamIds = await (0, jobService_1.getLabourerIdsSupervisedBy)(userId);
    if (teamIds.length === 0)
        return [];
    const list = await prisma_1.prisma.certificate.findMany({
        where: { holderUserId: { in: teamIds } },
        orderBy: [{ expirationDate: { sort: 'asc', nulls: 'last' } }, { uploadedAt: 'desc' }],
    });
    return list.map(mapCert);
}
async function getCertificateById(id, userId, userRole) {
    if (!(0, permissions_1.canViewFeature)(userRole, 'certificates')) {
        throw { status: 403, message: 'You do not have permission to view certificates' };
    }
    const c = await prisma_1.prisma.certificate.findUnique({ where: { id } });
    if (!c)
        throw { status: 404, message: 'Certificate not found' };
    if (!canManageCertificates(userRole)) {
        await assertSupervisorMayViewCertificate(userId, c.holderUserId);
    }
    return mapCert(c);
}
async function createCertificate(userId, userRole, userName, data) {
    if (userRole !== 'owner' && userRole !== 'hr')
        throw { status: 403, message: 'Only Owner or HR can create certificates' };
    let cert = await prisma_1.prisma.certificate.create({
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
        },
    });
    if (cert.holderUserId) {
        try {
            const mirrored = await (0, certificateTrainingSync_1.mirrorTrainingDocumentFromCertificate)({
                id: cert.id,
                name: cert.name,
                holderUserId: cert.holderUserId,
                expirationDate: cert.expirationDate,
                issueDate: cert.issueDate,
                filePath: cert.filePath,
                fileName: cert.fileName,
                uploadedById: cert.uploadedById,
            });
            if (mirrored && !cert.employeeDocumentId) {
                cert = await prisma_1.prisma.certificate.update({
                    where: { id: cert.id },
                    data: { employeeDocumentId: mirrored.id },
                });
            }
        }
        catch (e) {
            console.error('[certificateService] Failed to mirror training document:', e);
        }
    }
    return mapCert(cert);
}
async function updateCertificate(id, userRole, data) {
    if (userRole !== 'owner' && userRole !== 'hr')
        throw { status: 403, message: 'Only Owner or HR can update certificates' };
    const existing = await prisma_1.prisma.certificate.findUnique({ where: { id } });
    if (!existing)
        throw { status: 404, message: 'Certificate not found' };
    let cert = await prisma_1.prisma.certificate.update({
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
        },
    });
    if (cert.holderUserId) {
        try {
            const mirrored = await (0, certificateTrainingSync_1.mirrorTrainingDocumentFromCertificate)({
                id: cert.id,
                name: cert.name,
                holderUserId: cert.holderUserId,
                expirationDate: cert.expirationDate,
                issueDate: cert.issueDate,
                filePath: cert.filePath,
                fileName: cert.fileName,
                uploadedById: cert.uploadedById,
            });
            if (mirrored && !cert.employeeDocumentId) {
                cert = await prisma_1.prisma.certificate.update({
                    where: { id: cert.id },
                    data: { employeeDocumentId: mirrored.id },
                });
            }
        }
        catch (e) {
            console.error('[certificateService] Failed to mirror training document on update:', e);
        }
    }
    return mapCert(cert);
}
async function deleteCertificate(id, userRole) {
    if (userRole !== 'owner' && userRole !== 'hr')
        throw { status: 403, message: 'Only Owner or HR can delete certificates' };
    try {
        await (0, certificateTrainingSync_1.deleteLinkedTrainingDocument)(id);
    }
    catch (e) {
        console.error('[certificateService] Failed to delete linked training document:', e);
    }
    await prisma_1.prisma.certificate.delete({ where: { id } }).catch(() => {
        throw { status: 404, message: 'Certificate not found' };
    });
    return { message: 'Deleted' };
}
async function markCertificateReminderSent(id, userRole) {
    if (userRole !== 'owner' && userRole !== 'hr')
        throw { status: 403, message: 'Only Owner or HR can update certificates' };
    const cert = await prisma_1.prisma.certificate.update({
        where: { id },
        data: { expirationReminderSentAt: new Date() },
    });
    return mapCert(cert);
}
