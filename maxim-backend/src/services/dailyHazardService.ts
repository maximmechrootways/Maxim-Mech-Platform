import { prisma } from '../lib/prisma'
import { createNotification } from './notificationService'

function formatUserDisplayName(user?: { firstName: string | null; lastName: string | null; email: string } | null) {
  if (!user) return 'Unknown'
  const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
  return fullName || user.email
}

function approvalFieldsFromRow(r: {
  approved: boolean
  approvedAt: Date | null
  approvedById: string | null
  approvedByName: string | null
}) {
  return {
    approved: Boolean(r.approved),
    approvedAt: r.approvedAt?.toISOString?.() ?? null,
    approvedById: r.approvedById,
    approvedByName: r.approvedByName,
  }
}

export async function createDailyHazardSubmission(userId: string, data: any) {
  const submitter = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true, email: true },
  })
  const submitterName = formatUserDisplayName(submitter as { firstName: string | null; lastName: string | null; email: string } | null)

  const r = await prisma.dailyHazardSubmission.create({
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
  })
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
  }
}

export async function listDailyHazardSubmissions(params?: { projectId?: string; fromDate?: string; toDate?: string }) {
  const where: any = {}
  if (params?.projectId) where.projectId = params.projectId
  if (params?.fromDate || params?.toDate) {
    where.date = {}
    if (params.fromDate) where.date.gte = params.fromDate
    if (params.toDate) where.date.lte = params.toDate
  }
  const list = await prisma.dailyHazardSubmission.findMany({
    where,
    orderBy: { submittedAt: 'desc' },
  })
  const submittedByIds = Array.from(
    new Set(
      list
        .map((row) => row.submittedById)
        .filter((id): id is string => Boolean(id))
    )
  )
  const users = submittedByIds.length > 0
    ? await prisma.user.findMany({
      where: { id: { in: submittedByIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    })
    : []
  const userNameById = new Map(users.map((u) => [u.id, formatUserDisplayName(u)]))

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
    weatherConditions: r.weatherConditions as string[],
    nearestHospital: r.nearestHospital,
    emergencyCoordinator: r.emergencyCoordinator,
    activities: r.activities as string[],
    hazards: r.hazards as string[],
    controls: r.controls as string[],
    ppe: r.ppe as string[],
    jobHazardAssessment: r.jobHazardAssessment as any[],
    workplaceViolence: r.workplaceViolence as any[],
    workplaceViolenceActions: r.workplaceViolenceActions,
    toolsReplaced: r.toolsReplaced,
    additionalComments: r.additionalComments,
    signatures: r.signatures as any[],
    submittedById: r.submittedById,
    submittedBy: (r.submittedById ? userNameById.get(r.submittedById) : null) ?? r.submittedBy,
    submittedAt: r.submittedAt?.toISOString?.(),
    ...approvalFieldsFromRow({
      approved: r.approved,
      approvedAt: r.approvedAt,
      approvedById: r.approvedById,
      approvedByName: r.approvedByName,
    }),
  }))
}

export async function getDailyHazardSubmissionById(id: string) {
  const r = await prisma.dailyHazardSubmission.findUnique({ where: { id } })
  if (!r) throw { status: 404, message: 'Submission not found' }
  const submitter = r.submittedById
    ? await prisma.user.findUnique({
      where: { id: r.submittedById },
      select: { firstName: true, lastName: true, email: true },
    })
    : null
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
    weatherConditions: r.weatherConditions as string[],
    nearestHospital: r.nearestHospital,
    emergencyCoordinator: r.emergencyCoordinator,
    activities: r.activities as string[],
    hazards: r.hazards as string[],
    controls: r.controls as string[],
    ppe: r.ppe as string[],
    jobHazardAssessment: r.jobHazardAssessment as any[],
    workplaceViolence: r.workplaceViolence as any[],
    workplaceViolenceActions: r.workplaceViolenceActions,
    toolsReplaced: r.toolsReplaced,
    additionalComments: r.additionalComments,
    signatures: r.signatures as any[],
    submittedBy: submitter ? formatUserDisplayName(submitter) : r.submittedBy,
    submittedAt: r.submittedAt?.toISOString?.(),
    ...approvalFieldsFromRow({
      approved: r.approved,
      approvedAt: r.approvedAt,
      approvedById: r.approvedById,
      approvedByName: r.approvedByName,
    }),
  }
}

export async function setDailyHazardApproval(
  id: string,
  approverId: string,
  userRole: string,
  approved: boolean
) {
  if (userRole !== 'owner' && userRole !== 'hr') {
    throw { status: 403, message: 'Only Owner or HR can approve Daily Hazard Analysis submissions' }
  }

  const existing = await prisma.dailyHazardSubmission.findUnique({ where: { id } })
  if (!existing) throw { status: 404, message: 'Submission not found' }

  const wasApproved = Boolean(existing.approved)

  if (!approved) {
    const updated = await prisma.dailyHazardSubmission.update({
      where: { id },
      data: {
        approved: false,
        approvedAt: null,
        approvedById: null,
        approvedByName: null,
      },
    })
    return getDailyHazardSubmissionById(updated.id)
  }

  const approver = await prisma.user.findUnique({
    where: { id: approverId },
    select: { firstName: true, lastName: true, email: true },
  })
  if (!approver) throw { status: 404, message: 'Approver not found' }
  const approverName = formatUserDisplayName(approver)

  await prisma.dailyHazardSubmission.update({
    where: { id },
    data: {
      approved: true,
      approvedAt: new Date(),
      approvedById: approverId,
      approvedByName: approverName,
    },
  })

  if (!wasApproved && existing.submittedById && existing.submittedById !== approverId) {
    await createNotification({
      userId: existing.submittedById,
      title: 'Daily Hazard Analysis approved',
      body: `Your Daily Hazard Analysis for ${existing.date} (${existing.projectTitle ?? existing.projectId}) was approved by ${approverName}.`,
      type: 'info',
      linkTo: '/forms/daily-hazard-analysis',
      emailPreferenceKey: 'forms_pending',
    }).catch(() => {})
  }

  return getDailyHazardSubmissionById(id)
}

export async function deleteDailyHazardSubmission(id: string, userRole: string) {
  if (userRole !== 'owner' && userRole !== 'hr') {
    throw { status: 403, message: 'Only HR or Owner can delete Daily Hazard Analysis submissions' }
  }

  const existing = await prisma.dailyHazardSubmission.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!existing) throw { status: 404, message: 'Submission not found' }

  await prisma.dailyHazardSubmission.delete({ where: { id } })
  return { success: true as const }
}
