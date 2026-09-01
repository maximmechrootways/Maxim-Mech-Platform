import { prisma } from '../lib/prisma'
import { Prisma } from '@prisma/client'
import { recomputePdfSubmissionFindings, runPdfQualityFindingDedupe } from './qualityFindings/recomputePdfSubmissionFindings'

/** Non-draft PDF submissions that should contribute to Form Red Flags. */
const PDF_FINDING_SYNC_STATUSES = ['SUBMITTED', 'APPROVED', 'AWAITING_SIGNATURES', 'RESUBMIT_REQUIRED'] as const

export type QualityFindingListRow = {
  id: string
  sourceType: string
  sourceId: string
  ruleCode: string
  ruleVersion: number
  severity: string
  templateId: string | null
  templateNameSnapshot: string | null
  fieldId: string | null
  fieldLabelSnapshot: string | null
  valueSnapshot: string | null
  linkedJobId: string | null
  detectedAt: string
  /** Same date as the form review header (PdfSubmission.createdAt). */
  formSubmittedAt: string | null
  acknowledgedAt: string | null
  submissionTitle: string | null
  submissionTemplateName: string | null
  submissionStatus: string | null
  submittedByDisplay: string | null
}

/** Escape `%`, `_`, and `!` for ILIKE with ESCAPE '!'. */
function ilikeContainsPattern(raw: string): string {
  const escaped = raw.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_')
  return `%${escaped}%`
}

type FindingJoinRow = {
  id: string
  sourceType: string
  sourceId: string
  ruleCode: string
  ruleVersion: number
  severity: string
  templateId: string | null
  templateNameSnapshot: string | null
  fieldId: string | null
  fieldLabelSnapshot: string | null
  valueSnapshot: string | null
  linkedJobId: string | null
  detectedAt: Date
  formSubmittedAt: Date | null
  acknowledgedAt: Date | null
  submissionTitle: string | null
  submissionTemplateName: string | null
  submissionStatus: string | null
  submitterFirstName: string | null
  submitterLastName: string | null
}

function buildFindingWhereParts(opts: {
  queue?: 'open' | 'resolved' | 'all'
  from?: string
  to?: string
  templateId?: string
  ruleCode?: string
  linkedJobId?: string
  formNameNeedle?: string
}): Prisma.Sql[] {
  const parts: Prisma.Sql[] = [
    Prisma.sql`f."sourceType" = 'PDF_SUBMISSION'::"QualityFindingSource"`,
  ]
  if (opts.queue === 'open') parts.push(Prisma.sql`f."acknowledgedAt" IS NULL`)
  if (opts.queue === 'resolved') parts.push(Prisma.sql`f."acknowledgedAt" IS NOT NULL`)
  if (opts.templateId) parts.push(Prisma.sql`f."templateId" = ${opts.templateId}`)
  if (opts.ruleCode) parts.push(Prisma.sql`f."ruleCode" = ${opts.ruleCode}`)
  if (opts.linkedJobId) parts.push(Prisma.sql`f."linkedJobId" = ${opts.linkedJobId}`)
  if (opts.from) parts.push(Prisma.sql`f."detectedAt" >= ${new Date(opts.from)}`)
  if (opts.to) parts.push(Prisma.sql`f."detectedAt" <= ${new Date(opts.to)}`)
  if (opts.formNameNeedle) {
    const pat = ilikeContainsPattern(opts.formNameNeedle)
    parts.push(Prisma.sql`(p."title" ILIKE ${pat} ESCAPE '!' OR t."name" ILIKE ${pat} ESCAPE '!')`)
  }
  return parts
}

export async function listQualityFindings(opts: {
  /** open = needs review; resolved = acknowledged; all = both */
  queue?: 'open' | 'resolved' | 'all'
  from?: string
  to?: string
  templateId?: string
  ruleCode?: string
  linkedJobId?: string
  /** Case-insensitive match on submission title or template name */
  formName?: string
  limit?: number
  offset?: number
}): Promise<{ rows: QualityFindingListRow[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
  const offset = Math.max(opts.offset ?? 0, 0)
  const formNameNeedle = typeof opts.formName === 'string' ? opts.formName.trim() : ''
  const queue: 'open' | 'resolved' | 'all' =
    opts.queue === 'resolved' || opts.queue === 'all' ? opts.queue : 'open'

  const filterOpts = {
    queue,
    from: opts.from,
    to: opts.to,
    templateId: opts.templateId,
    ruleCode: opts.ruleCode,
    linkedJobId: opts.linkedJobId,
    formNameNeedle: formNameNeedle || undefined,
  }
  const whereSqlCount = Prisma.join(buildFindingWhereParts(filterOpts), ' AND ')
  const whereSqlRows = Prisma.join(buildFindingWhereParts(filterOpts), ' AND ')

  const [countRows, rawRows] = await prisma.$transaction([
    prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*)::bigint AS c
      FROM "SubmissionQualityFinding" f
      INNER JOIN "PdfSubmission" p ON p.id = f."sourceId"
      LEFT JOIN "PdfTemplate" t ON t.id = p."templateId"
      WHERE ${whereSqlCount}
    `,
    prisma.$queryRaw<FindingJoinRow[]>`
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
  ])

  const total = Number(countRows[0]?.c ?? 0)
  const rows: QualityFindingListRow[] = rawRows.map((r) => {
    const fn = r.submitterFirstName ?? ''
    const ln = r.submitterLastName ?? ''
    const submittedByDisplay = `${fn} ${ln}`.trim() || null
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
    }
  })

  return { rows, total }
}

export async function summaryQualityFindings(): Promise<{
  openCount: number
  resolvedCount: number
  byRule: Record<string, number>
}> {
  const baseOpen = [
    Prisma.sql`f."sourceType" = 'PDF_SUBMISSION'::"QualityFindingSource"`,
    Prisma.sql`f."acknowledgedAt" IS NULL`,
  ]
  const baseResolved = [
    Prisma.sql`f."sourceType" = 'PDF_SUBMISSION'::"QualityFindingSource"`,
    Prisma.sql`f."acknowledgedAt" IS NOT NULL`,
  ]
  const whereOpenCount = Prisma.join(baseOpen, ' AND ')
  const whereOpenGroup = Prisma.join(baseOpen, ' AND ')
  const whereResolvedCount = Prisma.join(baseResolved, ' AND ')

  const [openCountRows, resolvedCountRows, grouped] = await prisma.$transaction([
    prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*)::bigint AS c
      FROM "SubmissionQualityFinding" f
      INNER JOIN "PdfSubmission" p ON p.id = f."sourceId"
      WHERE ${whereOpenCount}
    `,
    prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*)::bigint AS c
      FROM "SubmissionQualityFinding" f
      INNER JOIN "PdfSubmission" p ON p.id = f."sourceId"
      WHERE ${whereResolvedCount}
    `,
    prisma.$queryRaw<{ ruleCode: string; cnt: bigint }[]>`
      SELECT f."ruleCode", COUNT(*)::bigint AS cnt
      FROM "SubmissionQualityFinding" f
      INNER JOIN "PdfSubmission" p ON p.id = f."sourceId"
      WHERE ${whereOpenGroup}
      GROUP BY f."ruleCode"
    `,
  ])

  const openCount = Number(openCountRows[0]?.c ?? 0)
  const resolvedCount = Number(resolvedCountRows[0]?.c ?? 0)
  const byRule: Record<string, number> = {}
  for (const g of grouped) {
    byRule[g.ruleCode] = Number(g.cnt)
  }

  return { openCount, resolvedCount, byRule }
}

export async function acknowledgeQualityFinding(findingId: string, userId: string): Promise<void> {
  const row = await prisma.submissionQualityFinding.findFirst({
    where: { id: findingId, sourceType: 'PDF_SUBMISSION' },
    select: { id: true, acknowledgedAt: true },
  })
  if (!row) {
    const err: { status: number; message: string } = { status: 404, message: 'Finding not found' }
    throw err
  }
  if (row.acknowledgedAt != null) return
  await prisma.submissionQualityFinding.update({
    where: { id: findingId },
    data: { acknowledgedAt: new Date(), acknowledgedById: userId },
  })
}

/** Fast cleanup: collapse duplicate PDF finding rows already in the database (no form re-scan). */
export async function dedupeStoredPdfQualityFindings(): Promise<void> {
  await runPdfQualityFindingDedupe()
}

/**
 * Re-runs PDF checklist detection for every completed (non-draft) submission so Form Red Flags
 * stays accurate without opening each form individually.
 */
export async function syncQualityFindingsFromCompletedPdfSubmissions(): Promise<{
  processed: number
  failed: number
}> {
  const rows = await prisma.pdfSubmission.findMany({
    where: { status: { in: [...PDF_FINDING_SYNC_STATUSES] } },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  })
  const batchSize = 12
  let failed = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize)
    const settled = await Promise.allSettled(chunk.map(({ id }) => recomputePdfSubmissionFindings(id)))
    for (const r of settled) {
      if (r.status === 'rejected') failed += 1
    }
  }
  await runPdfQualityFindingDedupe()
  return { processed: rows.length, failed }
}
