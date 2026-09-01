import { prisma } from '../lib/prisma'
import type { Prisma } from '@prisma/client'

function isOwnerOrHr(role: string) {
  return role === 'owner' || role === 'hr'
}

export async function createDraft(userId: string, jobId?: string, siteId?: string) {
  const existing = await prisma.elevatingPlatformInspection.findFirst({
    where: {
      submittedById: userId,
      status: 'draft',
    },
    orderBy: { createdAt: 'desc' },
  })
  if (existing) return existing

  return prisma.elevatingPlatformInspection.create({
    data: {
      submittedById: userId,
      status: 'draft',
      jobId: jobId || null,
      siteId: siteId || null,
      checklistValues: {},
    },
  })
}

export async function getById(id: string, userId: string, userRole: string) {
  const inspection = await prisma.elevatingPlatformInspection.findUnique({
    where: { id },
    include: {
      submittedBy: { select: { firstName: true, lastName: true } },
    },
  })

  if (!inspection) throw { status: 404, message: 'Inspection not found' }

  if (!isOwnerOrHr(userRole) && inspection.submittedById !== userId) {
    throw { status: 403, message: 'Forbidden' }
  }

  return inspection
}

export async function list(userId: string, userRole: string, query?: { status?: string }) {
  const where: Prisma.ElevatingPlatformInspectionWhereInput = {}
  
  if (!isOwnerOrHr(userRole)) {
    where.submittedById = userId
  }

  if (query?.status) {
    where.status = query.status
  }

  return prisma.elevatingPlatformInspection.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      submittedBy: { select: { firstName: true, lastName: true } },
    },
  })
}

export async function update(id: string, userId: string, userRole: string, data: any) {
  const inspection = await prisma.elevatingPlatformInspection.findUnique({ where: { id } })
  if (!inspection) throw { status: 404, message: 'Not found' }

  if (!isOwnerOrHr(userRole) && inspection.submittedById !== userId) {
    throw { status: 403, message: 'Forbidden' }
  }

  return prisma.elevatingPlatformInspection.update({
    where: { id },
    data,
  })
}

export async function submit(id: string, userId: string, userRole: string) {
  const inspection = await prisma.elevatingPlatformInspection.findUnique({ where: { id } })
  if (!inspection) throw { status: 404, message: 'Not found' }

  if (!isOwnerOrHr(userRole) && inspection.submittedById !== userId) {
    throw { status: 403, message: 'Forbidden' }
  }

  return prisma.elevatingPlatformInspection.update({
    where: { id },
    data: {
      status: 'submitted',
      submittedAt: new Date(),
    },
  })
}
