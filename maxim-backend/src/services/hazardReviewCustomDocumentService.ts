import { prisma } from '../lib/prisma'
import { uploadBlob, getBlobSasUrl, deleteBlob } from './blobStorageService'
import { HAZARD_RISK_TEMPLATE_KEYS, type HazardRiskTemplateKey } from '../seed/hazardRiskAssessmentTemplateFields'

function canManageCustomHazardDocs(role: string) {
  return role === 'hr' || role === 'owner'
}

/** Static seed keys or an existing custom document id. */
export async function assertTemplateKeyAllowedForComments(templateKey: string): Promise<void> {
  if (HAZARD_RISK_TEMPLATE_KEYS.includes(templateKey as HazardRiskTemplateKey)) return
  const custom = await prisma.hazardReviewCustomDocument.findUnique({
    where: { id: templateKey },
    select: { id: true },
  })
  if (!custom) throw { status: 400, message: 'Invalid templateKey' }
}

export async function listCustomDocumentMeta() {
  const rows = await prisma.hazardReviewCustomDocument.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      shortLabel: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  return rows.map((r) => ({
    id: r.id,
    templateKey: r.id,
    shortLabel: r.shortLabel,
    title: `Hazard Risk Assessment — ${r.shortLabel}`,
    description: `Completed hazard risk assessment for ${r.shortLabel} roles.`,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }))
}

export async function createCustomDocument(
  userId: string,
  userRole: string,
  file: Express.Multer.File,
  shortLabelRaw: string
) {
  if (!canManageCustomHazardDocs(userRole)) throw { status: 403, message: 'Only HR or Owner can add hazard documents' }
  const shortLabel = String(shortLabelRaw ?? '').trim()
  if (!shortLabel || shortLabel.length > 120) throw { status: 400, message: 'Name is required (max 120 characters)' }

  const filePath = await uploadBlob(file.path, 'documents')
  const doc = await prisma.hazardReviewCustomDocument.create({
    data: {
      shortLabel,
      filePath,
      uploadedById: userId,
    },
    select: { id: true, shortLabel: true, createdAt: true, updatedAt: true },
  })
  return {
    id: doc.id,
    templateKey: doc.id,
    shortLabel: doc.shortLabel,
    title: `Hazard Risk Assessment — ${doc.shortLabel}`,
    description: `Completed hazard risk assessment for ${doc.shortLabel} roles.`,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}

export async function updateCustomDocumentLabel(id: string, userId: string, userRole: string, shortLabelRaw: string) {
  if (!canManageCustomHazardDocs(userRole)) throw { status: 403, message: 'Forbidden' }
  const shortLabel = String(shortLabelRaw ?? '').trim()
  if (!shortLabel || shortLabel.length > 120) throw { status: 400, message: 'Name is required (max 120 characters)' }

  const existing = await prisma.hazardReviewCustomDocument.findUnique({ where: { id } })
  if (!existing) throw { status: 404, message: 'Not found' }

  const doc = await prisma.hazardReviewCustomDocument.update({
    where: { id },
    data: { shortLabel },
    select: { id: true, shortLabel: true, updatedAt: true },
  })
  return {
    id: doc.id,
    templateKey: doc.id,
    shortLabel: doc.shortLabel,
    title: `Hazard Risk Assessment — ${doc.shortLabel}`,
    description: `Completed hazard risk assessment for ${doc.shortLabel} roles.`,
    updatedAt: doc.updatedAt.toISOString(),
  }
}

export async function replaceCustomDocumentFile(id: string, userId: string, userRole: string, file: Express.Multer.File) {
  if (!canManageCustomHazardDocs(userRole)) throw { status: 403, message: 'Forbidden' }
  const existing = await prisma.hazardReviewCustomDocument.findUnique({ where: { id } })
  if (!existing) throw { status: 404, message: 'Not found' }

  const newPath = await uploadBlob(file.path, 'documents')
  if (existing.filePath) await deleteBlob(existing.filePath)

  await prisma.hazardReviewCustomDocument.update({
    where: { id },
    data: { filePath: newPath },
  })

  return { id, templateKey: id, filePath: newPath }
}

export async function deleteCustomDocument(id: string, userRole: string) {
  if (!canManageCustomHazardDocs(userRole)) throw { status: 403, message: 'Forbidden' }
  const existing = await prisma.hazardReviewCustomDocument.findUnique({ where: { id } })
  if (!existing) throw { status: 404, message: 'Not found' }

  if (existing.filePath) await deleteBlob(existing.filePath)

  await prisma.hazardReviewComment.deleteMany({ where: { templateKey: id } })
  await prisma.hazardReviewCustomDocument.delete({ where: { id } })
  return { ok: true }
}

export async function getCustomDocumentViewUrl(_userRole: string, id: string) {
  const doc = await prisma.hazardReviewCustomDocument.findUnique({
    where: { id },
    select: { filePath: true },
  })
  if (!doc) throw { status: 404, message: 'Not found' }
  const url = await getBlobSasUrl(doc.filePath, 120)
  return { url }
}

export async function listCustomTemplateKeys(): Promise<string[]> {
  const rows = await prisma.hazardReviewCustomDocument.findMany({ select: { id: true } })
  return rows.map((r) => r.id)
}
