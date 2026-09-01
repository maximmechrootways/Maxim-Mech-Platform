"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPdfQualityFindingDedupe = runPdfQualityFindingDedupe;
exports.recomputePdfSubmissionFindings = recomputePdfSubmissionFindings;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../lib/prisma");
const detectPdfSubmission_1 = require("./detectPdfSubmission");
/** Serialize recompute per submission so concurrent delete/insert cannot double rows. */
const recomputeTailBySubmissionId = new Map();
function wherePdfRowsBase(submissionId) {
    if (submissionId) {
        return client_1.Prisma.sql `f."sourceType" = 'PDF_SUBMISSION'::"QualityFindingSource" AND f."sourceId" = ${submissionId}`;
    }
    return client_1.Prisma.sql `f."sourceType" = 'PDF_SUBMISSION'::"QualityFindingSource"`;
}
function whereChecklistSubstandard(submissionId) {
    if (submissionId) {
        return client_1.Prisma.sql `f."sourceType" = 'PDF_SUBMISSION'::"QualityFindingSource" AND f."ruleCode" = 'checklist_substandard' AND f."sourceId" = ${submissionId}`;
    }
    return client_1.Prisma.sql `f."sourceType" = 'PDF_SUBMISSION'::"QualityFindingSource" AND f."ruleCode" = 'checklist_substandard'`;
}
/**
 * Removes duplicate PDF quality rows.
 * 1) Same submission + rule + field id (race / double insert).
 * 2) Same submission + checklist_substandard + normalized label + value (duplicate template field ids).
 */
async function runPdfQualityFindingDedupe(opts) {
    const submissionId = opts?.submissionId;
    const whereBase = wherePdfRowsBase(submissionId);
    await prisma_1.prisma.$executeRaw(client_1.Prisma.sql `
    WITH ranked AS (
      SELECT f."id",
             ROW_NUMBER() OVER (
               PARTITION BY f."sourceType", f."sourceId", f."ruleCode", COALESCE(f."fieldId", '')
               ORDER BY f."detectedAt" ASC, f."id" ASC
             ) AS rn
      FROM "SubmissionQualityFinding" f
      WHERE ${whereBase}
    )
    DELETE FROM "SubmissionQualityFinding" AS d
    USING ranked r
    WHERE d."id" = r."id" AND r.rn > 1
  `);
    const whereChecklist = whereChecklistSubstandard(submissionId);
    await prisma_1.prisma.$executeRaw(client_1.Prisma.sql `
    WITH ranked AS (
      SELECT f."id",
             ROW_NUMBER() OVER (
               PARTITION BY f."sourceType",
                            f."sourceId",
                            f."ruleCode",
                            LOWER(TRIM(COALESCE(f."fieldLabelSnapshot", ''))),
                            LOWER(TRIM(COALESCE(f."valueSnapshot", '')))
               ORDER BY f."detectedAt" ASC, f."id" ASC
             ) AS rn
      FROM "SubmissionQualityFinding" f
      WHERE ${whereChecklist}
    )
    DELETE FROM "SubmissionQualityFinding" AS d
    USING ranked r
    WHERE d."id" = r."id" AND r.rn > 1
  `);
}
/**
 * Replaces all PDF-derived quality findings for this submission (hard delete + insert).
 * Safe to call on every submit/save; idempotent per current field values.
 */
async function recomputePdfSubmissionFindings(submissionId) {
    const prev = recomputeTailBySubmissionId.get(submissionId) ?? Promise.resolve();
    const job = prev
        .catch(() => {
        /* keep queue alive */
    })
        .then(() => recomputePdfSubmissionFindingsCore(submissionId));
    recomputeTailBySubmissionId.set(submissionId, job);
    await job;
}
async function recomputePdfSubmissionFindingsCore(submissionId) {
    const s = await prisma_1.prisma.pdfSubmission.findUnique({
        where: { id: submissionId },
        include: { template: { select: { id: true, name: true, fields: true } } },
    });
    if (!s?.template)
        return;
    const fieldValues = s.fieldValues || {};
    const drafts = (0, detectPdfSubmission_1.detectPdfChecklistSubstandard)({
        templateId: s.template.id,
        templateName: s.template.name,
        fields: s.template.fields ?? [],
        fieldValues,
    });
    await prisma_1.prisma.$transaction(async (tx) => {
        await tx.submissionQualityFinding.deleteMany({
            where: { sourceType: 'PDF_SUBMISSION', sourceId: submissionId },
        });
        if (drafts.length === 0)
            return;
        await tx.submissionQualityFinding.createMany({
            data: drafts.map((d) => ({
                sourceType: 'PDF_SUBMISSION',
                sourceId: submissionId,
                ruleCode: d.ruleCode,
                ruleVersion: d.ruleVersion,
                severity: 'warning',
                templateId: d.templateId,
                templateNameSnapshot: d.templateNameSnapshot,
                fieldId: d.fieldId,
                fieldLabelSnapshot: d.fieldLabelSnapshot,
                valueSnapshot: d.valueSnapshot,
                linkedJobId: d.linkedJobId ?? null,
                siteTextSnapshot: d.siteTextSnapshot ?? null,
            })),
        });
    });
    await runPdfQualityFindingDedupe({ submissionId });
}
