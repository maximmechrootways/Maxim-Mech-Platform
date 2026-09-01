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
exports.listFormSubmissions = listFormSubmissions;
exports.getFormSubmissionById = getFormSubmissionById;
exports.createFormSubmission = createFormSubmission;
exports.updateFormSubmission = updateFormSubmission;
const prisma_1 = require("../lib/prisma");
const jobService = __importStar(require("./jobService"));
const notificationService = __importStar(require("./notificationService"));
function isOwnerOrHr(role) {
    return role === 'owner' || role === 'hr';
}
async function listFormSubmissions(userId, userRole, query) {
    const where = {};
    if (query.status)
        where.status = query.status;
    if (query.templateId)
        where.templateId = query.templateId;
    if (userRole === 'labourer') {
        where.submittedById = userId;
    }
    else if (userRole === 'supervisor') {
        const labourerIds = await jobService.getLabourerIdsSupervisedBy(userId);
        if (labourerIds.length === 0)
            return [];
        where.submittedById = { in: labourerIds };
    }
    const list = await prisma_1.prisma.formSubmission.findMany({
        where,
        include: { submittedBy: { select: { firstName: true, lastName: true } } },
        orderBy: { submittedAt: 'desc' },
    });
    return list.map((s) => ({
        id: s.id,
        templateId: s.templateId,
        templateName: s.templateName,
        status: s.status,
        submittedAt: s.submittedAt?.toISOString(),
        submittedBy: s.submittedBy ? `${s.submittedBy.firstName} ${s.submittedBy.lastName}` : undefined,
        siteName: s.siteName,
        fieldValues: s.fieldValues,
        workflowType: s.workflowType,
        siteSignerIds: s.siteSignerIds,
        siteSignatures: s.siteSignatures,
        auditEvents: s.auditEvents,
    }));
}
async function getFormSubmissionById(id, userId, userRole) {
    const s = await prisma_1.prisma.formSubmission.findUnique({
        where: { id },
        include: {
            submittedBy: { select: { id: true, firstName: true, lastName: true } },
            reviewedBy: { select: { firstName: true, lastName: true } },
        },
    });
    if (!s)
        throw { status: 404, message: 'Submission not found' };
    const siteSignerIds = s.siteSignerIds || [];
    let canAccess = isOwnerOrHr(userRole) ||
        s.submittedById === userId ||
        siteSignerIds.includes(userId);
    if (!canAccess && userRole === 'supervisor') {
        const labourerIds = await jobService.getLabourerIdsSupervisedBy(userId);
        canAccess = s.submittedById != null && labourerIds.includes(s.submittedById);
    }
    if (!canAccess)
        throw { status: 403, message: 'Forbidden' };
    return {
        id: s.id,
        templateId: s.templateId,
        templateName: s.templateName,
        status: s.status,
        submittedAt: s.submittedAt?.toISOString(),
        submittedBy: s.submittedBy ? `${s.submittedBy.firstName} ${s.submittedBy.lastName}` : undefined,
        submittedById: s.submittedById,
        reviewedAt: s.reviewedAt?.toISOString(),
        reviewedBy: s.reviewedBy ? `${s.reviewedBy.firstName} ${s.reviewedBy.lastName}` : undefined,
        reviewComment: s.reviewComment,
        siteName: s.siteName,
        fieldValues: s.fieldValues,
        workflowType: s.workflowType,
        siteSignerIds: s.siteSignerIds,
        siteSignatures: s.siteSignatures,
        auditEvents: s.auditEvents,
        archivedAt: s.archivedAt?.toISOString(),
        archivedBy: s.archivedBy,
        submittedToHrAt: s.submittedToHrAt?.toISOString(),
        lastOpenedAt: s.lastOpenedAt?.toISOString(),
        lastOpenedBy: s.lastOpenedBy,
        lastEditedAt: s.lastEditedAt?.toISOString(),
        lastEditedBy: s.lastEditedBy,
    };
}
async function createFormSubmission(userId, userRole, data) {
    const userName = await getUserName(userId);
    const status = data.status || 'draft';
    const auditEvents = [
        { id: `ev-${Date.now()}`, type: 'draft_created', at: new Date().toISOString(), by: userName },
    ];
    if (status !== 'draft') {
        auditEvents.push({ id: `ev-${Date.now()}-2`, type: 'submitted', at: new Date().toISOString(), by: userName });
    }
    const submission = await prisma_1.prisma.formSubmission.create({
        data: {
            templateId: data.templateId,
            templateName: data.templateName,
            status,
            submittedById: status !== 'draft' ? userId : null,
            submittedAt: status !== 'draft' ? new Date() : null,
            siteName: data.siteName,
            fieldValues: (data.fieldValues || {}),
            workflowType: data.workflowType || 'standard',
            siteSignerIds: (data.siteSignerIds || []),
            siteSignatures: [],
            auditEvents: auditEvents,
        },
    });
    return { id: submission.id, status: submission.status, submittedAt: submission.submittedAt?.toISOString() };
}
async function updateFormSubmission(id, userId, userRole, data) {
    const submission = await prisma_1.prisma.formSubmission.findUnique({ where: { id } });
    if (!submission)
        throw { status: 404, message: 'Submission not found' };
    const userName = await getUserName(userId);
    const updateData = {};
    if (data.status !== undefined)
        updateData.status = data.status;
    if (data.reviewComment !== undefined)
        updateData.reviewComment = data.reviewComment;
    if (data.status === 'approved' || data.status === 'rejected') {
        updateData.reviewedById = userId;
        updateData.reviewedAt = new Date();
    }
    if (data.siteSignatures !== undefined)
        updateData.siteSignatures = data.siteSignatures;
    if (data.submittedToHrAt !== undefined)
        updateData.submittedToHrAt = new Date(data.submittedToHrAt);
    if (data.lastOpenedAt !== undefined)
        updateData.lastOpenedAt = new Date(data.lastOpenedAt);
    if (data.lastOpenedBy !== undefined)
        updateData.lastOpenedBy = data.lastOpenedBy;
    if (data.lastEditedAt !== undefined)
        updateData.lastEditedAt = new Date(data.lastEditedAt);
    if (data.lastEditedBy !== undefined)
        updateData.lastEditedBy = data.lastEditedBy;
    if (data.auditEvent) {
        const events = submission.auditEvents || [];
        events.push({
            id: `ev-${Date.now()}`,
            type: data.auditEvent.type,
            at: new Date().toISOString(),
            by: userName,
            comment: data.auditEvent.comment,
        });
        updateData.auditEvents = events;
    }
    await prisma_1.prisma.formSubmission.update({ where: { id }, data: updateData });
    if (data.status === 'approved' && submission.submittedById) {
        await notificationService.createNotification({
            userId: submission.submittedById,
            title: 'Submission approved',
            body: `Your submission "${submission.templateName}" has been approved.`,
            type: 'info',
            linkTo: '/forms',
            emailPreferenceKey: 'forms_pending',
        }).catch(() => { });
    }
    return await getFormSubmissionById(id, userId, userRole);
}
async function getUserName(userId) {
    const u = await prisma_1.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
    });
    return u ? `${u.firstName} ${u.lastName}` : 'Unknown';
}
