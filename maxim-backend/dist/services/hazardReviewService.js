"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canViewSubmission = canViewSubmission;
exports.listTemplates = listTemplates;
exports.getTemplateFields = getTemplateFields;
exports.createDraft = createDraft;
exports.getSubmission = getSubmission;
exports.saveValues = saveValues;
exports.submitAssessment = submitAssessment;
exports.deleteSubmission = deleteSubmission;
exports.listSubmissions = listSubmissions;
exports.listCommentsForTemplate = listCommentsForTemplate;
exports.listCommentsGroupedByTemplate = listCommentsGroupedByTemplate;
exports.createComment = createComment;
exports.moderateComment = moderateComment;
const prisma_1 = require("../lib/prisma");
const hazardRiskAssessmentTemplateFields_1 = require("../seed/hazardRiskAssessmentTemplateFields");
const hazardRiskAssessmentValidation_1 = require("../seed/hazardRiskAssessmentValidation");
const hazardReviewCustomDocumentService_1 = require("./hazardReviewCustomDocumentService");
function isHrOrOwner(role) {
    return role === 'owner' || role === 'hr';
}
/**
 * True if the supervisor oversees this labourer on at least one job (JobSupervisor + JobAssignment)
 * or at least one site (SiteSupervisor + SiteAssignment).
 */
async function supervisorOverseesLabourer(supervisorId, labourerId) {
    const [onJob, onSite] = await Promise.all([
        prisma_1.prisma.jobAssignment.findFirst({
            where: {
                userId: labourerId,
                job: { supervisors: { some: { userId: supervisorId } } },
            },
            select: { id: true },
        }),
        prisma_1.prisma.siteAssignment.findFirst({
            where: {
                userId: labourerId,
                site: { siteSupervisors: { some: { userId: supervisorId } } },
            },
            select: { id: true },
        }),
    ]);
    return !!(onJob || onSite);
}
/** Labourer user IDs assigned to jobs or sites this user supervises (for submission bin filtering). */
async function labourerUserIdsSupervisedBy(supervisorId) {
    const [fromJobs, fromSites] = await Promise.all([
        prisma_1.prisma.jobAssignment.findMany({
            where: {
                job: { supervisors: { some: { userId: supervisorId } } },
            },
            select: { userId: true },
        }),
        prisma_1.prisma.siteAssignment.findMany({
            where: {
                site: { siteSupervisors: { some: { userId: supervisorId } } },
            },
            select: { userId: true },
        }),
    ]);
    return [...new Set([...fromJobs.map((r) => r.userId), ...fromSites.map((r) => r.userId)])];
}
async function canViewSubmission(viewerId, viewerRole, submission) {
    if (isHrOrOwner(viewerRole))
        return true;
    /** Submitted hazard assessments are shared reference documents — any signed-in user may open (read-only). */
    if (submission.status === 'SUBMITTED')
        return true;
    if (submission.submittedById === viewerId)
        return true;
    if (viewerRole === 'supervisor') {
        const subUser = await prisma_1.prisma.user.findUnique({
            where: { id: submission.submittedById },
            select: { role: true },
        });
        if (subUser?.role === 'labourer') {
            return supervisorOverseesLabourer(viewerId, submission.submittedById);
        }
        return submission.submittedById === viewerId;
    }
    return false;
}
function listTemplates() {
    return (0, hazardRiskAssessmentTemplateFields_1.listHazardRiskTemplates)();
}
function getTemplateFields(templateKey) {
    const fields = (0, hazardRiskAssessmentTemplateFields_1.getHazardRiskTemplateFieldsWithIds)(templateKey);
    if (!fields)
        throw { status: 400, message: 'Unknown template' };
    return fields;
}
async function createDraft(userId, templateKey, jobId) {
    if (!hazardRiskAssessmentTemplateFields_1.HAZARD_RISK_TEMPLATE_KEYS.includes(templateKey)) {
        throw { status: 400, message: 'Invalid template key' };
    }
    (0, hazardRiskAssessmentTemplateFields_1.getHazardRiskTemplateFields)(templateKey);
    if (jobId) {
        const job = await prisma_1.prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
        if (!job)
            throw { status: 400, message: 'Job not found' };
    }
    const sub = await prisma_1.prisma.hazardRiskAssessmentSubmission.create({
        data: {
            templateKey,
            submittedById: userId,
            status: 'DRAFT',
            fieldValues: {},
            jobId: jobId || null,
        },
        include: {
            submittedBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
            job: { select: { id: true, title: true, siteId: true } },
        },
    });
    const fields = (0, hazardRiskAssessmentTemplateFields_1.getHazardRiskTemplateFieldsWithIds)(templateKey) ?? [];
    return { ...formatSubmission(sub), fields };
}
async function getSubmission(id, viewerId, viewerRole) {
    const sub = await prisma_1.prisma.hazardRiskAssessmentSubmission.findUnique({
        where: { id },
        include: {
            submittedBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
            job: { select: { id: true, title: true, siteId: true } },
        },
    });
    if (!sub)
        throw { status: 404, message: 'Not found' };
    const ok = await canViewSubmission(viewerId, viewerRole, sub);
    if (!ok)
        throw { status: 403, message: 'Forbidden' };
    const fields = (0, hazardRiskAssessmentTemplateFields_1.getHazardRiskTemplateFieldsWithIds)(sub.templateKey) ?? [];
    return { ...formatSubmission(sub), fields };
}
function formatSubmission(sub) {
    return {
        id: sub.id,
        templateKey: sub.templateKey,
        status: sub.status,
        fieldValues: (sub.fieldValues || {}),
        jobId: sub.jobId,
        submittedById: sub.submittedById,
        submittedAt: sub.submittedAt ? new Date(sub.submittedAt).toISOString() : null,
        createdAt: new Date(sub.createdAt).toISOString(),
        updatedAt: new Date(sub.updatedAt).toISOString(),
        submittedBy: sub.submittedBy
            ? {
                id: sub.submittedBy.id,
                name: `${sub.submittedBy.firstName} ${sub.submittedBy.lastName}`.trim(),
                email: sub.submittedBy.email,
                role: sub.submittedBy.role,
            }
            : undefined,
        job: sub.job
            ? { id: sub.job.id, title: sub.job.title, siteId: sub.job.siteId }
            : null,
    };
}
async function saveValues(id, userId, viewerRole, fieldValues) {
    const sub = await prisma_1.prisma.hazardRiskAssessmentSubmission.findUnique({ where: { id } });
    if (!sub)
        throw { status: 404, message: 'Not found' };
    if (sub.submittedById !== userId && !isHrOrOwner(viewerRole))
        throw { status: 403, message: 'Forbidden' };
    if (sub.status === 'SUBMITTED' && !isHrOrOwner(viewerRole))
        throw { status: 400, message: 'Already submitted' };
    const cleaned = (0, hazardRiskAssessmentValidation_1.sanitizeFieldValuesForTemplate)(sub.templateKey, fieldValues);
    const updated = await prisma_1.prisma.hazardRiskAssessmentSubmission.update({
        where: { id },
        data: { fieldValues: cleaned },
    });
    const fields = (0, hazardRiskAssessmentTemplateFields_1.getHazardRiskTemplateFieldsWithIds)(updated.templateKey) ?? [];
    return { ...formatSubmission(updated), fields };
}
async function submitAssessment(id, userId, viewerRole) {
    const sub = await prisma_1.prisma.hazardRiskAssessmentSubmission.findUnique({ where: { id } });
    if (!sub)
        throw { status: 404, message: 'Not found' };
    if (sub.submittedById !== userId && !isHrOrOwner(viewerRole))
        throw { status: 403, message: 'Forbidden' };
    if (sub.status === 'SUBMITTED') {
        const full = await prisma_1.prisma.hazardRiskAssessmentSubmission.findUnique({
            where: { id },
            include: {
                submittedBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
                job: { select: { id: true, title: true, siteId: true } },
            },
        });
        if (!full)
            throw { status: 404, message: 'Not found' };
        const fields = (0, hazardRiskAssessmentTemplateFields_1.getHazardRiskTemplateFieldsWithIds)(full.templateKey) ?? [];
        return { ...formatSubmission(full), fields };
    }
    const currentValues = (sub.fieldValues || {});
    const validationError = (0, hazardRiskAssessmentValidation_1.validateHazardSubmissionFieldValues)(sub.templateKey, currentValues);
    if (validationError)
        throw { status: 400, message: validationError };
    const updated = await prisma_1.prisma.hazardRiskAssessmentSubmission.update({
        where: { id },
        data: { status: 'SUBMITTED', submittedAt: new Date() },
        include: {
            submittedBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
            job: { select: { id: true, title: true, siteId: true } },
        },
    });
    const fields = (0, hazardRiskAssessmentTemplateFields_1.getHazardRiskTemplateFieldsWithIds)(updated.templateKey) ?? [];
    return { ...formatSubmission(updated), fields };
}
/** HR / owner only — permanently remove a hazard assessment submission. */
async function deleteSubmission(id, viewerRole) {
    if (!isHrOrOwner(viewerRole))
        throw { status: 403, message: 'Forbidden' };
    const sub = await prisma_1.prisma.hazardRiskAssessmentSubmission.findUnique({ where: { id } });
    if (!sub)
        throw { status: 404, message: 'Not found' };
    await prisma_1.prisma.hazardRiskAssessmentSubmission.delete({ where: { id } });
    return { ok: true };
}
async function listSubmissions(viewerId, viewerRole, query) {
    const where = {};
    if (query.templateKey)
        where.templateKey = query.templateKey;
    if (query.status)
        where.status = query.status;
    if (query.siteId) {
        if (!isHrOrOwner(viewerRole))
            throw { status: 403, message: 'Site filter is only available to HR or Owner' };
        where.job = { siteId: query.siteId };
    }
    /** Per-template library: all completed (SUBMITTED) rows for that role — visible to every user. */
    const templateLibraryCompleted = query.scope === 'template_library' && query.templateKey && query.status === 'SUBMITTED';
    if (!templateLibraryCompleted) {
        if (isHrOrOwner(viewerRole)) {
            // all
        }
        else if (viewerRole === 'labourer') {
            where.submittedById = viewerId;
        }
        else if (viewerRole === 'supervisor') {
            const labourerIds = await labourerUserIdsSupervisedBy(viewerId);
            const allowed = Array.from(new Set([viewerId, ...labourerIds]));
            where.submittedById = { in: allowed };
        }
        else {
            where.submittedById = viewerId;
        }
    }
    const rows = await prisma_1.prisma.hazardRiskAssessmentSubmission.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: 200,
        include: {
            submittedBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
            job: { select: { id: true, title: true, siteId: true } },
        },
    });
    let out = rows.map((r) => formatSubmission(r));
    if (query.q) {
        const qq = query.q.toLowerCase();
        out = out.filter((s) => {
            const name = s.submittedBy?.name?.toLowerCase() ?? '';
            const blob = JSON.stringify(s.fieldValues).toLowerCase();
            return name.includes(qq) || blob.includes(qq) || s.templateKey.toLowerCase().includes(qq);
        });
    }
    return out;
}
function mapHazardCommentRow(c) {
    return {
        id: c.id,
        templateKey: c.templateKey,
        body: c.body,
        authorId: c.authorId,
        authorName: `${c.author.firstName} ${c.author.lastName}`.trim(),
        createdAt: c.createdAt.toISOString(),
        deletedAt: c.deletedAt?.toISOString() ?? null,
        hrRemark: c.hrRemark,
        hrRemarkAt: c.hrRemarkAt?.toISOString() ?? null,
        hrRemarkByName: c.hrRemarkBy
            ? `${c.hrRemarkBy.firstName} ${c.hrRemarkBy.lastName}`.trim()
            : null,
    };
}
/** Comments for one template’s message board page. */
async function listCommentsForTemplate(_viewerRole, templateKey) {
    await (0, hazardReviewCustomDocumentService_1.assertTemplateKeyAllowedForComments)(templateKey);
    const rows = await prisma_1.prisma.hazardReviewComment.findMany({
        where: {
            templateKey,
            deletedAt: null,
        },
        orderBy: { createdAt: 'asc' },
        take: 500,
        include: {
            author: { select: { id: true, firstName: true, lastName: true } },
            hrRemarkBy: { select: { id: true, firstName: true, lastName: true } },
        },
    });
    return rows.map((c) => mapHazardCommentRow(c));
}
/** All comments grouped by template (one board per hazard role). */
async function listCommentsGroupedByTemplate(_viewerRole) {
    const rows = await prisma_1.prisma.hazardReviewComment.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 2000,
        include: {
            author: { select: { id: true, firstName: true, lastName: true } },
            hrRemarkBy: { select: { id: true, firstName: true, lastName: true } },
        },
    });
    const customKeys = await (0, hazardReviewCustomDocumentService_1.listCustomTemplateKeys)();
    const out = {};
    for (const k of hazardRiskAssessmentTemplateFields_1.HAZARD_RISK_TEMPLATE_KEYS) {
        out[k] = [];
    }
    for (const k of customKeys) {
        out[k] = [];
    }
    const allowed = new Set([...hazardRiskAssessmentTemplateFields_1.HAZARD_RISK_TEMPLATE_KEYS, ...customKeys]);
    for (const c of rows) {
        const key = allowed.has(c.templateKey) ? c.templateKey : 'general_labourer';
        if (!out[key])
            out[key] = [];
        out[key].push(mapHazardCommentRow(c));
    }
    return out;
}
async function createComment(userId, body, templateKey) {
    const trimmed = String(body ?? '').trim();
    if (!trimmed)
        throw { status: 400, message: 'Comment required' };
    if (trimmed.length > 8000)
        throw { status: 400, message: 'Comment too long' };
    await (0, hazardReviewCustomDocumentService_1.assertTemplateKeyAllowedForComments)(templateKey);
    const c = await prisma_1.prisma.hazardReviewComment.create({
        data: { body: trimmed, authorId: userId, templateKey },
        include: { author: { select: { firstName: true, lastName: true } }, hrRemarkBy: true },
    });
    return mapHazardCommentRow(c);
}
async function moderateComment(commentId, hrUserId, hrRole, action, remark) {
    if (!isHrOrOwner(hrRole))
        throw { status: 403, message: 'Forbidden' };
    const c = await prisma_1.prisma.hazardReviewComment.findUnique({ where: { id: commentId } });
    if (!c)
        throw { status: 404, message: 'Not found' };
    if (action === 'delete') {
        await prisma_1.prisma.hazardReviewComment.update({
            where: { id: commentId },
            data: { deletedAt: new Date() },
        });
        return { ok: true };
    }
    const r = String(remark ?? '').trim();
    if (!r)
        throw { status: 400, message: 'Remark required' };
    await prisma_1.prisma.hazardReviewComment.update({
        where: { id: commentId },
        data: {
            hrRemark: r,
            hrRemarkById: hrUserId,
            hrRemarkAt: new Date(),
        },
    });
    return { ok: true };
}
