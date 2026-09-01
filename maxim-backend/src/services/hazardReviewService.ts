import { prisma } from '../lib/prisma'
import {
  getHazardRiskTemplateFields,
  getHazardRiskTemplateFieldsWithIds,
  listHazardRiskTemplates,
  HAZARD_RISK_TEMPLATE_KEYS,
  type HazardRiskTemplateKey,
} from '../seed/hazardRiskAssessmentTemplateFields'
import {
  sanitizeFieldValuesForTemplate,
  validateHazardSubmissionFieldValues,
} from '../seed/hazardRiskAssessmentValidation'
import {
  assertTemplateKeyAllowedForComments,
  listCustomTemplateKeys,
} from './hazardReviewCustomDocumentService'

function isHrOrOwner(role: string) {
  return role === 'owner' || role === 'hr'
}

/**
 * True if the supervisor oversees this labourer on at least one job (JobSupervisor + JobAssignment)
 * or at least one site (SiteSupervisor + SiteAssignment).
 */
async function supervisorOverseesLabourer(supervisorId: string, labourerId: string): Promise<boolean> {
  const [onJob, onSite] = await Promise.all([
    prisma.jobAssignment.findFirst({
      where: {
        userId: labourerId,
        job: { supervisors: { some: { userId: supervisorId } } },
      },
      select: { id: true },
    }),
    prisma.siteAssignment.findFirst({
      where: {
        userId: labourerId,
        site: { siteSupervisors: { some: { userId: supervisorId } } },
      },
      select: { id: true },
    }),
  ])
  return !!(onJob || onSite)
}

/** Labourer user IDs assigned to jobs or sites this user supervises (for submission bin filtering). */
async function labourerUserIdsSupervisedBy(supervisorId: string): Promise<string[]> {
  const [fromJobs, fromSites] = await Promise.all([
    prisma.jobAssignment.findMany({
      where: {
        job: { supervisors: { some: { userId: supervisorId } } },
      },
      select: { userId: true },
    }),
    prisma.siteAssignment.findMany({
      where: {
        site: { siteSupervisors: { some: { userId: supervisorId } } },
      },
      select: { userId: true },
    }),
  ])
  return [...new Set([...fromJobs.map((r) => r.userId), ...fromSites.map((r) => r.userId)])]
}

export async function canViewSubmission(
  viewerId: string,
  viewerRole: string,
  submission: { submittedById: string; status: string }
) {
  if (isHrOrOwner(viewerRole)) return true
  /** Submitted hazard assessments are shared reference documents — any signed-in user may open (read-only). */
  if (submission.status === 'SUBMITTED') return true
  if (submission.submittedById === viewerId) return true
  if (viewerRole === 'supervisor') {
    const subUser = await prisma.user.findUnique({
      where: { id: submission.submittedById },
      select: { role: true },
    })
    if (subUser?.role === 'labourer') {
      return supervisorOverseesLabourer(viewerId, submission.submittedById)
    }
    return submission.submittedById === viewerId
  }
  return false
}

export function listTemplates() {
  return listHazardRiskTemplates()
}

export function getTemplateFields(templateKey: string) {
  const fields = getHazardRiskTemplateFieldsWithIds(templateKey)
  if (!fields) throw { status: 400, message: 'Unknown template' }
  return fields
}

export async function createDraft(userId: string, templateKey: string, jobId?: string | null) {
  if (!HAZARD_RISK_TEMPLATE_KEYS.includes(templateKey as HazardRiskTemplateKey)) {
    throw { status: 400, message: 'Invalid template key' }
  }
  getHazardRiskTemplateFields(templateKey)
  if (jobId) {
    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } })
    if (!job) throw { status: 400, message: 'Job not found' }
  }
  const sub = await prisma.hazardRiskAssessmentSubmission.create({
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
  })
  const fields = getHazardRiskTemplateFieldsWithIds(templateKey) ?? []
  return { ...formatSubmission(sub), fields }
}

export async function getSubmission(id: string, viewerId: string, viewerRole: string) {
  const sub = await prisma.hazardRiskAssessmentSubmission.findUnique({
    where: { id },
    include: {
      submittedBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
      job: { select: { id: true, title: true, siteId: true } },
    },
  })
  if (!sub) throw { status: 404, message: 'Not found' }
  const ok = await canViewSubmission(viewerId, viewerRole, sub)
  if (!ok) throw { status: 403, message: 'Forbidden' }
  const fields = getHazardRiskTemplateFieldsWithIds(sub.templateKey) ?? []
  return { ...formatSubmission(sub), fields }
}

function formatSubmission(sub: any) {
  return {
    id: sub.id,
    templateKey: sub.templateKey,
    status: sub.status,
    fieldValues: (sub.fieldValues || {}) as Record<string, string>,
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
  }
}

export async function saveValues(
  id: string,
  userId: string,
  viewerRole: string,
  fieldValues: Record<string, string>
) {
  const sub = await prisma.hazardRiskAssessmentSubmission.findUnique({ where: { id } })
  if (!sub) throw { status: 404, message: 'Not found' }
  if (sub.submittedById !== userId && !isHrOrOwner(viewerRole)) throw { status: 403, message: 'Forbidden' }
  if (sub.status === 'SUBMITTED' && !isHrOrOwner(viewerRole)) throw { status: 400, message: 'Already submitted' }

  const cleaned = sanitizeFieldValuesForTemplate(sub.templateKey, fieldValues)

  const updated = await prisma.hazardRiskAssessmentSubmission.update({
    where: { id },
    data: { fieldValues: cleaned as object },
  })
  const fields = getHazardRiskTemplateFieldsWithIds(updated.templateKey) ?? []
  return { ...formatSubmission(updated), fields }
}

export async function submitAssessment(id: string, userId: string, viewerRole: string) {
  const sub = await prisma.hazardRiskAssessmentSubmission.findUnique({ where: { id } })
  if (!sub) throw { status: 404, message: 'Not found' }
  if (sub.submittedById !== userId && !isHrOrOwner(viewerRole)) throw { status: 403, message: 'Forbidden' }
  if (sub.status === 'SUBMITTED') {
    const full = await prisma.hazardRiskAssessmentSubmission.findUnique({
      where: { id },
      include: {
        submittedBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
        job: { select: { id: true, title: true, siteId: true } },
      },
    })
    if (!full) throw { status: 404, message: 'Not found' }
    const fields = getHazardRiskTemplateFieldsWithIds(full.templateKey) ?? []
    return { ...formatSubmission(full), fields }
  }

  const currentValues = (sub.fieldValues || {}) as Record<string, string>
  const validationError = validateHazardSubmissionFieldValues(sub.templateKey, currentValues)
  if (validationError) throw { status: 400, message: validationError }

  const updated = await prisma.hazardRiskAssessmentSubmission.update({
    where: { id },
    data: { status: 'SUBMITTED', submittedAt: new Date() },
    include: {
      submittedBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
      job: { select: { id: true, title: true, siteId: true } },
    },
  })
  const fields = getHazardRiskTemplateFieldsWithIds(updated.templateKey) ?? []
  return { ...formatSubmission(updated), fields }
}

/** HR / owner only — permanently remove a hazard assessment submission. */
export async function deleteSubmission(id: string, viewerRole: string) {
  if (!isHrOrOwner(viewerRole)) throw { status: 403, message: 'Forbidden' }
  const sub = await prisma.hazardRiskAssessmentSubmission.findUnique({ where: { id } })
  if (!sub) throw { status: 404, message: 'Not found' }
  await prisma.hazardRiskAssessmentSubmission.delete({ where: { id } })
  return { ok: true as const }
}

export async function listSubmissions(
  viewerId: string,
  viewerRole: string,
  query: { templateKey?: string; status?: string; q?: string; scope?: string; siteId?: string }
) {
  const where: any = {}
  if (query.templateKey) where.templateKey = query.templateKey
  if (query.status) where.status = query.status
  if (query.siteId) {
    if (!isHrOrOwner(viewerRole)) throw { status: 403, message: 'Site filter is only available to HR or Owner' }
    where.job = { siteId: query.siteId }
  }

  /** Per-template library: all completed (SUBMITTED) rows for that role — visible to every user. */
  const templateLibraryCompleted =
    query.scope === 'template_library' && query.templateKey && query.status === 'SUBMITTED'

  if (!templateLibraryCompleted) {
    if (isHrOrOwner(viewerRole)) {
      // all
    } else if (viewerRole === 'labourer') {
      where.submittedById = viewerId
    } else if (viewerRole === 'supervisor') {
      const labourerIds = await labourerUserIdsSupervisedBy(viewerId)
      const allowed = Array.from(new Set([viewerId, ...labourerIds]))
      where.submittedById = { in: allowed }
    } else {
      where.submittedById = viewerId
    }
  }

  const rows = await prisma.hazardRiskAssessmentSubmission.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 200,
    include: {
      submittedBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
      job: { select: { id: true, title: true, siteId: true } },
    },
  })

  let out = rows.map((r) => formatSubmission(r))
  if (query.q) {
    const qq = query.q.toLowerCase()
    out = out.filter((s) => {
      const name = (s.submittedBy as { name?: string } | undefined)?.name?.toLowerCase() ?? ''
      const blob = JSON.stringify(s.fieldValues).toLowerCase()
      return name.includes(qq) || blob.includes(qq) || s.templateKey.toLowerCase().includes(qq)
    })
  }

  return out
}

function mapHazardCommentRow(c: {
  id: string
  templateKey: string
  body: string
  authorId: string
  createdAt: Date
  deletedAt: Date | null
  hrRemark: string | null
  hrRemarkAt: Date | null
  author: { firstName: string; lastName: string }
  hrRemarkBy: { firstName: string; lastName: string } | null
}) {
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
  }
}

/** Comments for one template’s message board page. */
export async function listCommentsForTemplate(_viewerRole: string, templateKey: string) {
  await assertTemplateKeyAllowedForComments(templateKey)
  const rows = await prisma.hazardReviewComment.findMany({
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
  })
  return rows.map((c) => mapHazardCommentRow(c as any))
}

/** All comments grouped by template (one board per hazard role). */
export async function listCommentsGroupedByTemplate(_viewerRole: string) {
  const rows = await prisma.hazardReviewComment.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    take: 2000,
    include: {
      author: { select: { id: true, firstName: true, lastName: true } },
      hrRemarkBy: { select: { id: true, firstName: true, lastName: true } },
    },
  })
  const customKeys = await listCustomTemplateKeys()
  const out: Record<string, ReturnType<typeof mapHazardCommentRow>[]> = {}
  for (const k of HAZARD_RISK_TEMPLATE_KEYS) {
    out[k] = []
  }
  for (const k of customKeys) {
    out[k] = []
  }
  const allowed = new Set<string>([...HAZARD_RISK_TEMPLATE_KEYS, ...customKeys])
  for (const c of rows) {
    const key = allowed.has(c.templateKey) ? c.templateKey : 'general_labourer'
    if (!out[key]) out[key] = []
    out[key].push(mapHazardCommentRow(c as any))
  }
  return out
}

export async function createComment(userId: string, body: string, templateKey: string) {
  const trimmed = String(body ?? '').trim()
  if (!trimmed) throw { status: 400, message: 'Comment required' }
  if (trimmed.length > 8000) throw { status: 400, message: 'Comment too long' }
  await assertTemplateKeyAllowedForComments(templateKey)
  const c = await prisma.hazardReviewComment.create({
    data: { body: trimmed, authorId: userId, templateKey },
    include: { author: { select: { firstName: true, lastName: true } }, hrRemarkBy: true },
  })
  return mapHazardCommentRow(c as any)
}

export async function moderateComment(
  commentId: string,
  hrUserId: string,
  hrRole: string,
  action: 'delete' | 'remark',
  remark?: string
) {
  if (!isHrOrOwner(hrRole)) throw { status: 403, message: 'Forbidden' }
  const c = await prisma.hazardReviewComment.findUnique({ where: { id: commentId } })
  if (!c) throw { status: 404, message: 'Not found' }
  if (action === 'delete') {
    await prisma.hazardReviewComment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    })
    return { ok: true }
  }
  const r = String(remark ?? '').trim()
  if (!r) throw { status: 400, message: 'Remark required' }
  await prisma.hazardReviewComment.update({
    where: { id: commentId },
    data: {
      hrRemark: r,
      hrRemarkById: hrUserId,
      hrRemarkAt: new Date(),
    },
  })
  return { ok: true }
}
