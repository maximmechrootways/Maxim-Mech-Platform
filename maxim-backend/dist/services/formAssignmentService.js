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
exports.createAssignments = createAssignments;
exports.listAssignments = listAssignments;
exports.getAssignmentById = getAssignmentById;
exports.linkSubmission = linkSubmission;
exports.reviewAssignment = reviewAssignment;
exports.forwardAssignmentToHR = forwardAssignmentToHR;
exports.getAssignmentCounts = getAssignmentCounts;
const prisma_1 = require("../lib/prisma");
const notificationService = __importStar(require("./notificationService"));
function isOwnerOrHr(role) {
    return role === 'owner' || role === 'hr';
}
function isSupervisorOrAbove(role) {
    return role === 'supervisor' || isOwnerOrHr(role);
}
/**
 * Create form assignments (one per labourer).
 */
async function createAssignments(userId, userRole, data) {
    if (!isSupervisorOrAbove(userRole)) {
        throw { status: 403, message: 'Only supervisors, Owner, or HR can assign forms' };
    }
    const template = await prisma_1.prisma.pdfTemplate.findUnique({ where: { id: data.templateId } });
    if (!template)
        throw { status: 404, message: 'Template not found' };
    const recurrence = ['once', 'daily', 'weekly', 'monthly'].includes(data.recurrence ?? '') ? data.recurrence : 'once';
    const assignments = [];
    for (const assigneeId of data.assignedToUserIds) {
        const assignment = await prisma_1.prisma.pdfFormAssignment.create({
            data: {
                templateId: data.templateId,
                assignedById: userId,
                assignedToId: assigneeId,
                dueDate: data.dueDate || null,
                recurrence: recurrence === 'once' ? null : recurrence,
                note: data.note || null,
                status: 'pending',
            },
        });
        assignments.push(assignment);
        await notificationService.createNotification({
            userId: assigneeId,
            title: 'New form assigned',
            body: `You have been assigned "${template.name}"${data.dueDate ? ` (due ${data.dueDate})` : ''}. Go to Forms & Documents to fill it out.`,
            type: 'alert',
            linkTo: '/library?view=templates',
            emailPreferenceKey: 'signatures',
        }).catch(() => { });
    }
    return { created: assignments.length, assignments: assignments.map((a) => ({ id: a.id, status: a.status })) };
}
/**
 * List assignments scoped by role.
 */
async function listAssignments(userId, userRole, query) {
    const where = {};
    if (query?.status)
        where.status = query.status;
    if (query?.status === 'completed')
        where.forwardedToHRAt = null;
    if (query?.templateId)
        where.templateId = query.templateId;
    if (isOwnerOrHr(userRole) && query?.assignedToId)
        where.assignedToId = query.assignedToId;
    if (userRole === 'labourer') {
        where.assignedToId = userId;
    }
    else if (userRole === 'supervisor') {
        where.assignedById = userId;
    }
    const list = await prisma_1.prisma.pdfFormAssignment.findMany({
        where,
        include: {
            template: { select: { id: true, name: true, pageCount: true, filePath: true } },
            assignedTo: { select: { id: true, firstName: true, lastName: true } },
            assignedBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
    });
    return list.map((a) => ({
        id: a.id,
        templateId: a.templateId,
        templateName: a.template.name,
        templatePageCount: a.template.pageCount,
        assignedTo: `${a.assignedTo.firstName} ${a.assignedTo.lastName}`,
        assignedToId: a.assignedToId,
        assignedBy: `${a.assignedBy.firstName} ${a.assignedBy.lastName}`,
        assignedById: a.assignedById,
        dueDate: a.dueDate,
        recurrence: a.recurrence ?? undefined,
        note: a.note,
        status: a.status,
        submissionId: a.submissionId,
        reviewComment: a.reviewComment,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
    }));
}
/**
 * Get a single assignment by ID.
 */
async function getAssignmentById(id, userId, userRole) {
    const a = await prisma_1.prisma.pdfFormAssignment.findUnique({
        where: { id },
        include: {
            template: { select: { id: true, name: true, pageCount: true, filePath: true } },
            assignedTo: { select: { id: true, firstName: true, lastName: true } },
            assignedBy: { select: { id: true, firstName: true, lastName: true } },
        },
    });
    if (!a)
        throw { status: 404, message: 'Assignment not found' };
    const canAccess = isOwnerOrHr(userRole) || a.assignedToId === userId || a.assignedById === userId;
    if (!canAccess)
        throw { status: 403, message: 'Forbidden' };
    return {
        id: a.id,
        templateId: a.templateId,
        templateName: a.template.name,
        assignedTo: `${a.assignedTo.firstName} ${a.assignedTo.lastName}`,
        assignedToId: a.assignedToId,
        assignedBy: `${a.assignedBy.firstName} ${a.assignedBy.lastName}`,
        assignedById: a.assignedById,
        dueDate: a.dueDate,
        recurrence: a.recurrence ?? undefined,
        note: a.note,
        status: a.status,
        submissionId: a.submissionId,
        reviewComment: a.reviewComment,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
    };
}
/**
 * Link a PdfSubmission to an assignment (called when labourer submits).
 */
async function linkSubmission(assignmentId, submissionId, userId) {
    const assignment = await prisma_1.prisma.pdfFormAssignment.findUnique({ where: { id: assignmentId } });
    if (!assignment)
        throw { status: 404, message: 'Assignment not found' };
    if (assignment.assignedToId !== userId)
        throw { status: 403, message: 'Not your assignment' };
    await prisma_1.prisma.pdfFormAssignment.update({
        where: { id: assignmentId },
        data: { submissionId, status: 'completed' },
    });
    const labourer = await prisma_1.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
    });
    const labourerName = labourer ? `${labourer.firstName} ${labourer.lastName}` : 'A labourer';
    const template = await prisma_1.prisma.pdfTemplate.findUnique({
        where: { id: assignment.templateId },
        select: { name: true },
    });
    await notificationService.createNotification({
        userId: assignment.assignedById,
        title: 'Form submission received',
        body: `${labourerName} submitted "${template?.name ?? 'a form'}". Go to Submissions to review.`,
        type: 'info',
        linkTo: '/library?view=submissions',
        emailPreferenceKey: 'forms_pending',
    }).catch(() => { });
    return { status: 'completed' };
}
/**
 * Supervisor reviews a submission.
 */
async function reviewAssignment(assignmentId, userId, userRole, data) {
    if (!isSupervisorOrAbove(userRole)) {
        throw { status: 403, message: 'Only supervisors can review' };
    }
    const assignment = await prisma_1.prisma.pdfFormAssignment.findUnique({ where: { id: assignmentId } });
    if (!assignment)
        throw { status: 404, message: 'Assignment not found' };
    if (!isOwnerOrHr(userRole) && assignment.assignedById !== userId) {
        throw { status: 403, message: 'Not your assignment to review' };
    }
    const newStatus = data.action === 'reviewed' ? 'reviewed' : 'resubmission_required';
    await prisma_1.prisma.pdfFormAssignment.update({
        where: { id: assignmentId },
        data: {
            status: newStatus,
            reviewComment: data.comment || null,
        },
    });
    const template = await prisma_1.prisma.pdfTemplate.findUnique({
        where: { id: assignment.templateId },
        select: { name: true },
    });
    const notificationBody = data.action === 'reviewed'
        ? `Your submission for "${template?.name}" has been reviewed and approved.`
        : `Your submission for "${template?.name}" requires changes.${data.comment ? ` Comment: ${data.comment}` : ''}`;
    await notificationService.createNotification({
        userId: assignment.assignedToId,
        title: data.action === 'reviewed' ? 'Form approved' : 'Resubmission required',
        body: notificationBody,
        type: data.action === 'reviewed' ? 'info' : 'alert',
        linkTo: '/library?view=submissions',
        emailPreferenceKey: 'forms_pending',
    }).catch(() => { });
    return { status: newStatus };
}
/**
 * Forward a PDF form assignment to HR (supervisor/owner marks as forwarded, notifies HR).
 */
async function forwardAssignmentToHR(assignmentId, userId, userRole) {
    if (!isSupervisorOrAbove(userRole)) {
        throw { status: 403, message: 'Only supervisors and owners can forward to HR' };
    }
    const assignment = await prisma_1.prisma.pdfFormAssignment.findUnique({
        where: { id: assignmentId },
        include: { template: { select: { name: true } } },
    });
    if (!assignment)
        throw { status: 404, message: 'Assignment not found' };
    if (assignment.status !== 'completed' && assignment.status !== 'reviewed') {
        throw { status: 400, message: 'Only completed or reviewed submissions can be forwarded to HR' };
    }
    if (!isOwnerOrHr(userRole) && assignment.assignedById !== userId) {
        throw { status: 403, message: 'Not your assignment to forward' };
    }
    await prisma_1.prisma.pdfFormAssignment.update({
        where: { id: assignmentId },
        data: {
            forwardedToHRAt: new Date(),
            forwardedToHRById: userId,
            status: 'reviewed',
        },
    });
    const hrUsers = await prisma_1.prisma.user.findMany({ where: { role: 'hr' } });
    const sender = await prisma_1.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
    });
    const senderName = sender ? `${sender.firstName} ${sender.lastName}`.trim() || 'A supervisor' : 'A supervisor';
    for (const hr of hrUsers) {
        await notificationService.createNotification({
            userId: hr.id,
            title: 'Signed form forwarded for filing',
            body: `${senderName} has forwarded "${assignment.template.name}" for filing.`,
            type: 'info',
            linkTo: '/library?view=submissions',
            emailPreferenceKey: 'forms_pending',
        }).catch(() => { });
    }
    return { forwarded: true };
}
/**
 * Dashboard widget counts.
 */
async function getAssignmentCounts(userId, userRole) {
    if (userRole === 'supervisor') {
        const pendingReview = await prisma_1.prisma.pdfFormAssignment.count({
            where: { assignedById: userId, status: 'completed', forwardedToHRAt: null },
        });
        const total = await prisma_1.prisma.pdfFormAssignment.count({
            where: { assignedById: userId },
        });
        return { pendingReview, total };
    }
    if (userRole === 'labourer') {
        const pending = await prisma_1.prisma.pdfFormAssignment.count({
            where: { assignedToId: userId, status: { in: ['pending', 'in_progress', 'resubmission_required'] } },
        });
        const total = await prisma_1.prisma.pdfFormAssignment.count({
            where: { assignedToId: userId },
        });
        return { pending, total };
    }
    if (isOwnerOrHr(userRole)) {
        const pendingReview = await prisma_1.prisma.pdfFormAssignment.count({
            where: { status: 'completed', forwardedToHRAt: null },
        });
        return { pendingReview, total: 0 };
    }
    return { pendingReview: 0, pending: 0, total: 0 };
}
