"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listQualityFindings = listQualityFindings;
exports.summaryQualityFindings = summaryQualityFindings;
exports.acknowledgeQualityFinding = acknowledgeQualityFinding;
exports.dedupeStoredPdfQualityFindings = dedupeStoredPdfQualityFindings;
exports.syncQualityFindingsFromCompletedPdfSubmissions = syncQualityFindingsFromCompletedPdfSubmissions;
const prisma_1 = require("../lib/prisma");
const client_1 = require("@prisma/client");
const recomputePdfSubmissionFindings_1 = require("./qualityFindings/recomputePdfSubmissionFindings");
/** Non-draft PDF submissions that should contribute to Form Red Flags. */
const PDF_FINDING_SYNC_STATUSES = ['SUBMITTED', 'APPROVED', 'AWAITING_SIGNATURES', 'RESUBMIT_REQUIRED'];
/** Escape `%`, `_`, and `!` for ILIKE with ESCAPE '!'. */
function ilikeContainsPattern(raw) {
    const escaped = raw.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_');
    return `%${escaped}%`;
}
function buildFindingWhereParts(opts) {
    const parts = [
        client_1.Prisma.sql `f."sourceType" = 'PDF_SUBMISSION'::"QualityFindingSource"`,
    ];
    if (opts.queue === 'open')
        parts.push(client_1.Prisma.sql `f."acknowledgedAt" IS NULL`);
    if (opts.queue === 'resolved')
        parts.push(client_1.Prisma.sql `f."acknowledgedAt" IS NOT NULL`);
    if (opts.templateId)
        parts.push(client_1.Prisma.sql `f."templateId" = ${opts.templateId}`);
    if (opts.ruleCode)
        parts.push(client_1.Prisma.sql `f."ruleCode" = ${opts.ruleCode}`);
    if (opts.linkedJobId)
        parts.push(client_1.Prisma.sql `f."linkedJobId" = ${opts.linkedJobId}`);
    if (opts.from)
        parts.push(client_1.Prisma.sql `f."detectedAt" >= ${new Date(opts.from)}`);
    if (opts.to)
        parts.push(client_1.Prisma.sql `f."detectedAt" <= ${new Date(opts.to)}`);
    if (opts.formNameNeedle) {
        const pat = ilikeContainsPattern(opts.formNameNeedle);
        parts.push(client_1.Prisma.sql `(p."title" ILIKE ${pat} ESCAPE '!' OR t."name" ILIKE ${pat} ESCAPE '!')`);
    }
    return parts;
}
async function listQualityFindings(opts) {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    const formNameNeedle = typeof opts.formName === 'string' ? opts.formName.trim() : '';
    const queue = opts.queue === 'resolved' || opts.queue === 'all' ? opts.queue : 'open';
    const filterOpts = {
        queue,
        from: opts.from,
        to: opts.to,
        templateId: opts.templateId,
        ruleCode: opts.ruleCode,
        linkedJobId: opts.linkedJobId,
        formNameNeedle: formNameNeedle || undefined,
    };
    const whereSqlCount = client_1.Prisma.join(buildFindingWhereParts(filterOpts), ' AND ');
    const whereSqlRows = client_1.Prisma.join(buildFindingWhereParts(filterOpts), ' AND ');
    const [countRows, rawRows] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.$queryRaw `
      SELECT COUNT(*)::bigint AS c
      FROM "SubmissionQualityFinding" f
      INNER JOIN "PdfSubmission" p ON p.id = f."sourceId"
      LEFT JOIN "PdfTemplate" t ON t.id = p."templateId"
      WHERE ${whereSqlCount}
    `,
        prisma_1.prisma.$queryRaw `
      SELECT
        f."id",
        f."sourceType"::text AS "sourceType",
        f."sourceId",
        f."ruleCode",
        f."ruleVersion",
        f."severity"::text AS "severity",
        f."templateId",
        f."templateNameSnapshot",
        f."fieldId",
        f."fieldLabelSnapshot",
        f."valueSnapshot",
        f."linkedJobId",
        f."detectedAt",
        p."createdAt" AS "formSubmittedAt",
        f."acknowledgedAt",
        p."title" AS "submissionTitle",
        t."name" AS "submissionTemplateName",
        p."status"::text AS "submissionStatus",
        u."firstName" AS "submitterFirstName",
        u."lastName" AS "submitterLastName"
      FROM "SubmissionQualityFinding" f
      INNER JOIN "PdfSubmission" p ON p.id = f."sourceId"
      LEFT JOIN "PdfTemplate" t ON t.id = p."templateId"
      LEFT JOIN "User" u ON u.id = p."submittedById"
      WHERE ${whereSqlRows}
      ORDER BY p."createdAt" DESC, f."detectedAt" DESC
      LIMIT ${limit} OFFSET ${offset}
    `,
    ]);
    const total = Number(countRows[0]?.c ?? 0);
    const rows = rawRows.map((r) => {
        const fn = r.submitterFirstName ?? '';
        const ln = r.submitterLastName ?? '';
        const submittedByDisplay = `${fn} ${ln}`.trim() || null;
        return {
            id: r.id,
            sourceType: r.sourceType,
            sourceId: r.sourceId,
            ruleCode: r.ruleCode,
            ruleVersion: r.ruleVersion,
            severity: r.severity,
            templateId: r.templateId,
            templateNameSnapshot: r.templateNameSnapshot,
            fieldId: r.fieldId,
            fieldLabelSnapshot: r.fieldLabelSnapshot,
            valueSnapshot: r.valueSnapshot,
            linkedJobId: r.linkedJobId,
            detectedAt: r.detectedAt.toISOString(),
            formSubmittedAt: r.formSubmittedAt ? r.formSubmittedAt.toISOString() : null,
            acknowledgedAt: r.acknowledgedAt ? r.acknowledgedAt.toISOString() : null,
            submissionTitle: r.submissionTitle,
            submissionTemplateName: r.submissionTemplateName,
            submissionStatus: r.submissionStatus,
            submittedByDisplay,
        };
    });
    return { rows, total };
}
async function summaryQualityFindings() {
    const baseOpen = [
        client_1.Prisma.sql `f."sourceType" = 'PDF_SUBMISSION'::"QualityFindingSource"`,
        client_1.Prisma.sql `f."acknowledgedAt" IS NULL`,
    ];
    const baseResolved = [
        client_1.Prisma.sql `f."sourceType" = 'PDF_SUBMISSION'::"QualityFindingSource"`,
        client_1.Prisma.sql `f."acknowledgedAt" IS NOT NULL`,
    ];
    const whereOpenCount = client_1.Prisma.join(baseOpen, ' AND ');
    const whereOpenGroup = client_1.Prisma.join(baseOpen, ' AND ');
    const whereResolvedCount = client_1.Prisma.join(baseResolved, ' AND ');
    const [openCountRows, resolvedCountRows, grouped] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.$queryRaw `
      SELECT COUNT(*)::bigint AS c
      FROM "SubmissionQualityFinding" f
      INNER JOIN "PdfSubmission" p ON p.id = f."sourceId"
      WHERE ${whereOpenCount}
    `,
        prisma_1.prisma.$queryRaw `
      SELECT COUNT(*)::bigint AS c
      FROM "SubmissionQualityFinding" f
      INNER JOIN "PdfSubmission" p ON p.id = f."sourceId"
      WHERE ${whereResolvedCount}
    `,
        prisma_1.prisma.$queryRaw `
      SELECT f."ruleCode", COUNT(*)::bigint AS cnt
      FROM "SubmissionQualityFinding" f
      INNER JOIN "PdfSubmission" p ON p.id = f."sourceId"
      WHERE ${whereOpenGroup}
      GROUP BY f."ruleCode"
    `,
    ]);
    const openCount = Number(openCountRows[0]?.c ?? 0);
    const resolvedCount = Number(resolvedCountRows[0]?.c ?? 0);
    const byRule = {};
    for (const g of grouped) {
        byRule[g.ruleCode] = Number(g.cnt);
    }
    return { openCount, resolvedCount, byRule };
}
async function acknowledgeQualityFinding(findingId, userId) {
    const row = await prisma_1.prisma.submissionQualityFinding.findFirst({
        where: { id: findingId, sourceType: 'PDF_SUBMISSION' },
        select: { id: true, acknowledgedAt: true },
    });
    if (!row) {
        const err = { status: 404, message: 'Finding not found' };
        throw err;
    }
    if (row.acknowledgedAt != null)
        return;
    await prisma_1.prisma.submissionQualityFinding.update({
        where: { id: findingId },
        data: { acknowledgedAt: new Date(), acknowledgedById: userId },
    });
}
/** Fast cleanup: collapse duplicate PDF finding rows already in the database (no form re-scan). */
async function dedupeStoredPdfQualityFindings() {
    await (0, recomputePdfSubmissionFindings_1.runPdfQualityFindingDedupe)();
}
/**
 * Re-runs PDF checklist detection for every completed (non-draft) submission so Form Red Flags
 * stays accurate without opening each form individually.
 */
async function syncQualityFindingsFromCompletedPdfSubmissions() {
    const rows = await prisma_1.prisma.pdfSubmission.findMany({
        where: { status: { in: [...PDF_FINDING_SYNC_STATUSES] } },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
    });
    const batchSize = 12;
    let failed = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
        const chunk = rows.slice(i, i + batchSize);
        const settled = await Promise.allSettled(chunk.map(({ id }) => (0, recomputePdfSubmissionFindings_1.recomputePdfSubmissionFindings)(id)));
        for (const r of settled) {
            if (r.status === 'rejected')
                failed += 1;
        }
    }
    await (0, recomputePdfSubmissionFindings_1.runPdfQualityFindingDedupe)();
    return { processed: rows.length, failed };
}
