import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { detectPdfChecklistSubstandard } from './detectPdfSubmission'

/** Serialize recompute per submission so concurrent delete/insert cannot double rows. */
const recomputeTailBySubmissionId = new Map<string, Promise<void>>()

function wherePdfRowsBase(submissionId?: string): Prisma.Sql {
  if (submissionId) {
    return Prisma.sql`f."sourceType" = 'PDF_SUBMISSION'::"QualityFindingSource" AND f."sourceId" = ${submissionId}`
  }
  return Prisma.sql`f."sourceType" = 'PDF_SUBMISSION'::"QualityFindingSource"`
}

function whereChecklistSubstandard(submissionId?: string): Prisma.Sql {
  if (submissionId) {
    return Prisma.sql`f."sourceType" = 'PDF_SUBMISSION'::"QualityFindingSource" AND f."ruleCode" = 'checklist_substandard' AND f."sourceId" = ${submissionId}`
  }
  return Prisma.sql`f."sourceType" = 'PDF_SUBMISSION'::"QualityFindingSource" AND f."ruleCode" = 'checklist_substandard'`
}

/**
 * Removes duplicate PDF quality rows.
 * 1) Same submission + rule + field id (race / double insert).
 * 2) Same submission + checklist_substandard + normalized label + value (duplicate template field ids).
 */
export async function runPdfQualityFindingDedupe(opts?: { submissionId?: string }): Promise<void> {
  const submissionId = opts?.submissionId
  const whereBase = wherePdfRowsBase(submissionId)

  await prisma.$executeRaw(Prisma.sql`
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
  `)

  const whereChecklist = whereChecklistSubstandard(submissionId)

  await prisma.$executeRaw(Prisma.sql`
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
  `)
}

/**
 * Replaces all PDF-derived quality findings for this submission (hard delete + insert).
 * Safe to call on every submit/save; idempotent per current field values.
 */
export async function recomputePdfSubmissionFindings(submissionId: string): Promise<void> {
  const prev = recomputeTailBySubmissionId.get(submissionId) ?? Promise.resolve()
  const job = prev
    .catch(() => {
      /* keep queue alive */
    })
    .then(() => recomputePdfSubmissionFindingsCore(submissionId))
  recomputeTailBySubmissionId.set(submissionId, job)
  await job
}

async function recomputePdfSubmissionFindingsCore(submissionId: string): Promise<void> {
  const s = await prisma.pdfSubmission.findUnique({
    where: { id: submissionId },
    include: { template: { select: { id: true, name: true, fields: true } } },
  })
  if (!s?.template) return

  const fieldValues = (s.fieldValues as Record<string, unknown>) || {}
  const drafts = detectPdfChecklistSubstandard({
    templateId: s.template.id,
    templateName: s.template.name,
    fields: s.template.fields ?? [],
    fieldValues,
  })

  await prisma.$transaction(async (tx) => {
    await tx.submissionQualityFinding.deleteMany({
      where: { sourceType: 'PDF_SUBMISSION', sourceId: submissionId },
    })
    if (drafts.length === 0) return
    await tx.submissionQualityFinding.createMany({
      data: drafts.map((d) => ({
        sourceType: 'PDF_SUBMISSION' as const,
        sourceId: submissionId,
        ruleCode: d.ruleCode,
        ruleVersion: d.ruleVersion,
        severity: 'warning' as const,
        templateId: d.templateId,
        templateNameSnapshot: d.templateNameSnapshot,
        fieldId: d.fieldId,
        fieldLabelSnapshot: d.fieldLabelSnapshot,
        valueSnapshot: d.valueSnapshot,
        linkedJobId: d.linkedJobId ?? null,
        siteTextSnapshot: d.siteTextSnapshot ?? null,
      })),
    })
  })
  await runPdfQualityFindingDedupe({ submissionId })
}
