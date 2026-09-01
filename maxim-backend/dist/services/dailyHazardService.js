"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDailyHazardSubmission = createDailyHazardSubmission;
exports.listDailyHazardSubmissions = listDailyHazardSubmissions;
exports.getDailyHazardSubmissionById = getDailyHazardSubmissionById;
exports.setDailyHazardApproval = setDailyHazardApproval;
exports.deleteDailyHazardSubmission = deleteDailyHazardSubmission;
const prisma_1 = require("../lib/prisma");
const notificationService_1 = require("./notificationService");
function formatUserDisplayName(user) {
    if (!user)
        return 'Unknown';
    const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
    return fullName || user.email;
}
function approvalFieldsFromRow(r) {
    return {
        approved: Boolean(r.approved),
        approvedAt: r.approvedAt?.toISOString?.() ?? null,
        approvedById: r.approvedById,
        approvedByName: r.approvedByName,
    };
}
async function createDailyHazardSubmission(userId, data) {
    const submitter = await prisma_1.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true, email: true },
    });
    const submitterName = formatUserDisplayName(submitter);
    const r = await prisma_1.prisma.dailyHazardSubmission.create({
        data: {
            date: data.date || new Date().toISOString().slice(0, 10),
            projectId: data.projectId || '',
            projectTitle: data.projectTitle || null,
            siteName: data.siteName || null,
            musterPoint: data.musterPoint?.trim() || null,
            supervisorId: data.supervisorId || null,
            supervisorName: data.supervisorName || null,
            jobNumber: data.jobNumber?.trim() || null,
            weatherTemp: data.weatherTemp?.trim() || null,
            weatherConditions: Array.isArray(data.weatherConditions) ? data.weatherConditions : [],
            nearestHospital: data.nearestHospital?.trim() || null,
            emergencyCoordinator: data.emergencyCoordinator?.trim() || null,
            activities: Array.isArray(data.activities) ? data.activities : [],
            hazards: Array.isArray(data.hazards) ? data.hazards : [],
            controls: Array.isArray(data.controls) ? data.controls : [],
            ppe: Array.isArray(data.ppe) ? data.ppe : [],
            jobHazardAssessment: Array.isArray(data.jobHazardAssessment) ? data.jobHazardAssessment : [],
            workplaceViolence: Array.isArray(data.workplaceViolence) ? data.workplaceViolence : [],
            workplaceViolenceActions: data.workplaceViolenceActions?.trim() || null,
            toolsReplaced: data.toolsReplaced?.trim() || null,
            additionalComments: data.additionalComments?.trim() || null,
            signatures: Array.isArray(data.signatures) ? data.signatures : [],
            submittedById: userId,
            // Persist submitter name from the authoritative user record (not client payload/JWT email).
            submittedBy: submitterName,
        },
    });
    return {
        id: r.id,
        date: r.date,
        projectId: r.projectId,
        projectTitle: r.projectTitle,
        siteName: r.siteName,
        supervisorName: r.supervisorName,
        jobNumber: r.jobNumber,
        submittedBy: r.submittedBy,
        submittedAt: r.submittedAt?.toISOString?.(),
        ...approvalFieldsFromRow({
            approved: r.approved,
            approvedAt: r.approvedAt,
            approvedById: r.approvedById,
            approvedByName: r.approvedByName,
        }),
    };
}
async function listDailyHazardSubmissions(params) {
    const where = {};
    if (params?.projectId)
        where.projectId = params.projectId;
    if (params?.fromDate || params?.toDate) {
        where.date = {};
        if (params.fromDate)
            where.date.gte = params.fromDate;
        if (params.toDate)
            where.date.lte = params.toDate;
    }
    const list = await prisma_1.prisma.dailyHazardSubmission.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
    });
    const submittedByIds = Array.from(new Set(list
        .map((row) => row.submittedById)
        .filter((id) => Boolean(id))));
    const users = submittedByIds.length > 0
        ? await prisma_1.prisma.user.findMany({
            where: { id: { in: submittedByIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
        })
        : [];
    const userNameById = new Map(users.map((u) => [u.id, formatUserDisplayName(u)]));
    return list.map((r) => ({
        id: r.id,
        date: r.date,
        projectId: r.projectId,
        projectTitle: r.projectTitle,
        siteName: r.siteName,
        musterPoint: r.musterPoint,
        supervisorName: r.supervisorName,
        jobNumber: r.jobNumber,
        weatherTemp: r.weatherTemp,
        weatherConditions: r.weatherConditions,
        nearestHospital: r.nearestHospital,
        emergencyCoordinator: r.emergencyCoordinator,
        activities: r.activities,
        hazards: r.hazards,
        controls: r.controls,
        ppe: r.ppe,
        jobHazardAssessment: r.jobHazardAssessment,
        workplaceViolence: r.workplaceViolence,
        workplaceViolenceActions: r.workplaceViolenceActions,
        toolsReplaced: r.toolsReplaced,
        additionalComments: r.additionalComments,
        signatures: r.signatures,
        submittedById: r.submittedById,
        submittedBy: (r.submittedById ? userNameById.get(r.submittedById) : null) ?? r.submittedBy,
        submittedAt: r.submittedAt?.toISOString?.(),
        ...approvalFieldsFromRow({
            approved: r.approved,
            approvedAt: r.approvedAt,
            approvedById: r.approvedById,
            approvedByName: r.approvedByName,
        }),
    }));
}
async function getDailyHazardSubmissionById(id) {
    const r = await prisma_1.prisma.dailyHazardSubmission.findUnique({ where: { id } });
    if (!r)
        throw { status: 404, message: 'Submission not found' };
    const submitter = r.submittedById
        ? await prisma_1.prisma.user.findUnique({
            where: { id: r.submittedById },
            select: { firstName: true, lastName: true, email: true },
        })
        : null;
    return {
        id: r.id,
        date: r.date,
        projectId: r.projectId,
        projectTitle: r.projectTitle,
        siteName: r.siteName,
        musterPoint: r.musterPoint,
        supervisorId: r.supervisorId,
        supervisorName: r.supervisorName,
        jobNumber: r.jobNumber,
        weatherTemp: r.weatherTemp,
        weatherConditions: r.weatherConditions,
        nearestHospital: r.nearestHospital,
        emergencyCoordinator: r.emergencyCoordinator,
        activities: r.activities,
        hazards: r.hazards,
        controls: r.controls,
        ppe: r.ppe,
        jobHazardAssessment: r.jobHazardAssessment,
        workplaceViolence: r.workplaceViolence,
        workplaceViolenceActions: r.workplaceViolenceActions,
        toolsReplaced: r.toolsReplaced,
        additionalComments: r.additionalComments,
        signatures: r.signatures,
        submittedBy: submitter ? formatUserDisplayName(submitter) : r.submittedBy,
        submittedAt: r.submittedAt?.toISOString?.(),
        ...approvalFieldsFromRow({
            approved: r.approved,
            approvedAt: r.approvedAt,
            approvedById: r.approvedById,
            approvedByName: r.approvedByName,
        }),
    };
}
async function setDailyHazardApproval(id, approverId, userRole, approved) {
    if (userRole !== 'owner' && userRole !== 'hr') {
        throw { status: 403, message: 'Only Owner or HR can approve Daily Hazard Analysis submissions' };
    }
    const existing = await prisma_1.prisma.dailyHazardSubmission.findUnique({ where: { id } });
    if (!existing)
        throw { status: 404, message: 'Submission not found' };
    const wasApproved = Boolean(existing.approved);
    if (!approved) {
        const updated = await prisma_1.prisma.dailyHazardSubmission.update({
            where: { id },
            data: {
                approved: false,
                approvedAt: null,
                approvedById: null,
                approvedByName: null,
            },
        });
        return getDailyHazardSubmissionById(updated.id);
    }
    const approver = await prisma_1.prisma.user.findUnique({
        where: { id: approverId },
        select: { firstName: true, lastName: true, email: true },
    });
    if (!approver)
        throw { status: 404, message: 'Approver not found' };
    const approverName = formatUserDisplayName(approver);
    await prisma_1.prisma.dailyHazardSubmission.update({
        where: { id },
        data: {
            approved: true,
            approvedAt: new Date(),
            approvedById: approverId,
            approvedByName: approverName,
        },
    });
    if (!wasApproved && existing.submittedById && existing.submittedById !== approverId) {
        await (0, notificationService_1.createNotification)({
            userId: existing.submittedById,
            title: 'Daily Hazard Analysis approved',
            body: `Your Daily Hazard Analysis for ${existing.date} (${existing.projectTitle ?? existing.projectId}) was approved by ${approverName}.`,
            type: 'info',
            linkTo: '/forms/daily-hazard-analysis',
            emailPreferenceKey: 'forms_pending',
        }).catch(() => { });
    }
    return getDailyHazardSubmissionById(id);
}
async function deleteDailyHazardSubmission(id, userRole) {
    if (userRole !== 'owner' && userRole !== 'hr') {
        throw { status: 403, message: 'Only HR or Owner can delete Daily Hazard Analysis submissions' };
    }
    const existing = await prisma_1.prisma.dailyHazardSubmission.findUnique({
        where: { id },
        select: { id: true },
    });
    if (!existing)
        throw { status: 404, message: 'Submission not found' };
    await prisma_1.prisma.dailyHazardSubmission.delete({ where: { id } });
    return { success: true };
}
