"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTrainingExpirationDate = resolveTrainingExpirationDate;
exports.mirrorTrainingDocumentFromCertificate = mirrorTrainingDocumentFromCertificate;
exports.mirrorCertificateFromTrainingDocument = mirrorCertificateFromTrainingDocument;
exports.deleteLinkedTrainingDocument = deleteLinkedTrainingDocument;
exports.reconcileAllCertificateTrainingLinks = reconcileAllCertificateTrainingLinks;
exports.deleteLinkedCertificate = deleteLinkedCertificate;
const prisma_1 = require("../lib/prisma");
const TRAINING_META_PREFIX = '__training_meta__:';
function resolveTrainingExpirationDate(expiresAt) {
    const trimmed = expiresAt?.trim();
    return trimmed || null;
}
function encodeTrainingDisplayName(courseName, hoursCompleted, trainingFacility) {
    const payload = {
        courseName: courseName.trim(),
        hoursCompleted: typeof hoursCompleted === 'number' && Number.isFinite(hoursCompleted) ? hoursCompleted : undefined,
        trainingFacility: trainingFacility?.trim() || undefined,
    };
    return `${TRAINING_META_PREFIX}${JSON.stringify(payload)}`;
}
/** Mirror a global Certificate onto the employee Training & Certificates section. */
async function mirrorTrainingDocumentFromCertificate(cert) {
    if (!cert.holderUserId)
        return null;
    const existing = await prisma_1.prisma.employeeDocument.findFirst({
        where: { certificateId: cert.id },
    });
    if (existing)
        return existing;
    const displayNameForStorage = encodeTrainingDisplayName(cert.name);
    return prisma_1.prisma.employeeDocument.create({
        data: {
            employeeId: cert.holderUserId,
            category: 'training',
            filePath: cert.filePath?.trim() || '',
            originalName: cert.fileName?.trim() || cert.name,
            mimeType: cert.filePath?.trim() ? 'application/pdf' : null,
            sizeBytes: null,
            uploadedById: cert.uploadedById,
            expiresAt: cert.expirationDate ?? null,
            completedAt: cert.issueDate?.trim() || null,
            displayName: displayNameForStorage,
            certificateId: cert.id,
        },
    });
}
/** Create or update a global Certificate from an employee training record. */
async function mirrorCertificateFromTrainingDocument(doc, holderName, uploaderId, uploaderName) {
    const courseName = doc.displayName?.startsWith(TRAINING_META_PREFIX)
        ? (() => {
            try {
                const parsed = JSON.parse(doc.displayName.slice(TRAINING_META_PREFIX.length));
                return parsed.courseName?.trim() || doc.originalName;
            }
            catch {
                return doc.originalName;
            }
        })()
        : doc.displayName?.trim() || doc.originalName;
    const expirationDate = resolveTrainingExpirationDate(doc.expiresAt);
    if (doc.certificateId) {
        const existing = await prisma_1.prisma.certificate.findUnique({ where: { id: doc.certificateId } });
        if (existing) {
            return prisma_1.prisma.certificate.update({
                where: { id: existing.id },
                data: {
                    name: courseName,
                    holderName,
                    holderUserId: doc.employeeId,
                    issueDate: doc.completedAt?.trim() || null,
                    expirationDate,
                    ...(doc.filePath?.trim()
                        ? { filePath: doc.filePath.trim(), fileName: doc.originalName }
                        : {}),
                    employeeDocumentId: doc.id,
                },
            });
        }
    }
    const cert = await prisma_1.prisma.certificate.create({
        data: {
            name: courseName,
            holderName,
            holderUserId: doc.employeeId,
            issueDate: doc.completedAt?.trim() || null,
            expirationDate,
            uploadedById: uploaderId,
            uploadedBy: uploaderName,
            fileName: doc.filePath?.trim() ? doc.originalName : null,
            filePath: doc.filePath?.trim() || null,
            employeeDocumentId: doc.id,
        },
    });
    await prisma_1.prisma.employeeDocument.update({
        where: { id: doc.id },
        data: { certificateId: cert.id },
    });
    return cert;
}
async function deleteLinkedTrainingDocument(certificateId) {
    const docs = await prisma_1.prisma.employeeDocument.findMany({ where: { certificateId } });
    for (const doc of docs) {
        const blobKey = (doc.filePath ?? '').trim();
        if (blobKey) {
            try {
                const { deleteBlob } = await Promise.resolve().then(() => __importStar(require('./blobStorageService')));
                await deleteBlob(blobKey);
            }
            catch {
                /* keep delete resilient */
            }
        }
        await prisma_1.prisma.employeeDocument.delete({ where: { id: doc.id } });
    }
}
function normPersonName(value) {
    return value.trim().toLowerCase().replace(/[\s-]+/g, ' ');
}
function decodeCourseName(displayName, fallback) {
    const raw = displayName?.trim() || '';
    if (!raw.startsWith(TRAINING_META_PREFIX))
        return raw || fallback;
    try {
        const parsed = JSON.parse(raw.slice(TRAINING_META_PREFIX.length));
        return parsed.courseName?.trim() || fallback;
    }
    catch {
        return fallback;
    }
}
/**
 * Idempotent backfill: link existing training records ↔ global certificates and resolve holderUserId.
 */
async function reconcileAllCertificateTrainingLinks() {
    const stats = {
        certificatesLinked: 0,
        trainingDocsLinked: 0,
        holderIdsResolved: 0,
        certificatesCreated: 0,
        trainingDocsMirrored: 0,
    };
    const users = await prisma_1.prisma.user.findMany({
        select: { id: true, firstName: true, lastName: true },
    });
    const userByName = new Map(users.map((u) => [normPersonName(`${u.firstName} ${u.lastName}`), u]));
    const certs = await prisma_1.prisma.certificate.findMany();
    for (const cert of certs) {
        if (!cert.holderUserId) {
            const uid = userByName.get(normPersonName(cert.holderName));
            if (uid) {
                await prisma_1.prisma.certificate.update({
                    where: { id: cert.id },
                    data: { holderUserId: uid.id },
                });
                stats.holderIdsResolved += 1;
            }
        }
    }
    const trainingDocs = await prisma_1.prisma.employeeDocument.findMany({
        where: { category: { in: ['training', 'certification'] } },
        orderBy: { uploadedAt: 'asc' },
    });
    for (const doc of trainingDocs) {
        const employee = users.find((u) => u.id === doc.employeeId);
        if (!employee)
            continue;
        const holderName = `${employee.firstName} ${employee.lastName}`.trim();
        const blobKey = (doc.filePath ?? '').trim();
        if (doc.certificateId) {
            const linked = await prisma_1.prisma.certificate.findUnique({ where: { id: doc.certificateId } });
            if (linked) {
                if (!linked.employeeDocumentId) {
                    await prisma_1.prisma.certificate.update({
                        where: { id: linked.id },
                        data: { employeeDocumentId: doc.id, holderUserId: linked.holderUserId ?? doc.employeeId },
                    });
                    stats.certificatesLinked += 1;
                }
                continue;
            }
        }
        if (blobKey) {
            const byFile = await prisma_1.prisma.certificate.findFirst({ where: { filePath: blobKey } });
            if (byFile) {
                await prisma_1.prisma.employeeDocument.update({
                    where: { id: doc.id },
                    data: { certificateId: byFile.id },
                });
                if (!byFile.employeeDocumentId || !byFile.holderUserId) {
                    await prisma_1.prisma.certificate.update({
                        where: { id: byFile.id },
                        data: {
                            employeeDocumentId: byFile.employeeDocumentId ?? doc.id,
                            holderUserId: byFile.holderUserId ?? doc.employeeId,
                        },
                    });
                }
                stats.trainingDocsLinked += 1;
                continue;
            }
        }
        const courseName = decodeCourseName(doc.displayName ?? null, doc.originalName);
        const expirationDate = resolveTrainingExpirationDate(doc.expiresAt);
        const existingCert = await prisma_1.prisma.certificate.findFirst({
            where: {
                holderUserId: doc.employeeId,
                name: { equals: courseName, mode: 'insensitive' },
                ...(expirationDate ? { expirationDate } : { expirationDate: null }),
            },
        });
        if (existingCert) {
            await prisma_1.prisma.employeeDocument.update({
                where: { id: doc.id },
                data: { certificateId: existingCert.id },
            });
            if (!existingCert.employeeDocumentId) {
                await prisma_1.prisma.certificate.update({
                    where: { id: existingCert.id },
                    data: { employeeDocumentId: doc.id },
                });
            }
            stats.trainingDocsLinked += 1;
            continue;
        }
        const created = await mirrorCertificateFromTrainingDocument({
            id: doc.id,
            employeeId: doc.employeeId,
            displayName: doc.displayName,
            originalName: doc.originalName,
            expiresAt: doc.expiresAt,
            completedAt: doc.completedAt,
            filePath: doc.filePath,
            certificateId: null,
        }, holderName, doc.uploadedById, holderName);
        if (created)
            stats.certificatesCreated += 1;
    }
    const certsAfter = await prisma_1.prisma.certificate.findMany();
    for (const cert of certsAfter) {
        if (!cert.holderUserId)
            continue;
        const linkedDoc = await prisma_1.prisma.employeeDocument.findFirst({
            where: { OR: [{ certificateId: cert.id }, { id: cert.employeeDocumentId ?? '' }] },
        });
        if (linkedDoc) {
            if (!cert.employeeDocumentId) {
                await prisma_1.prisma.certificate.update({
                    where: { id: cert.id },
                    data: { employeeDocumentId: linkedDoc.id },
                });
            }
            if (!linkedDoc.certificateId) {
                await prisma_1.prisma.employeeDocument.update({
                    where: { id: linkedDoc.id },
                    data: { certificateId: cert.id },
                });
            }
            continue;
        }
        const mirrored = await mirrorTrainingDocumentFromCertificate({
            id: cert.id,
            name: cert.name,
            holderUserId: cert.holderUserId,
            expirationDate: cert.expirationDate,
            issueDate: cert.issueDate,
            filePath: cert.filePath,
            fileName: cert.fileName,
            uploadedById: cert.uploadedById,
        });
        if (mirrored) {
            await prisma_1.prisma.certificate.update({
                where: { id: cert.id },
                data: { employeeDocumentId: mirrored.id },
            });
            stats.trainingDocsMirrored += 1;
        }
    }
    return stats;
}
async function deleteLinkedCertificate(employeeDocumentId) {
    const cert = await prisma_1.prisma.certificate.findFirst({ where: { employeeDocumentId } });
    if (cert) {
        await prisma_1.prisma.certificate.delete({ where: { id: cert.id } }).catch(() => { });
    }
    const doc = await prisma_1.prisma.employeeDocument.findUnique({
        where: { id: employeeDocumentId },
        select: { certificateId: true },
    });
    if (doc?.certificateId) {
        await prisma_1.prisma.certificate.delete({ where: { id: doc.certificateId } }).catch(() => { });
    }
}
