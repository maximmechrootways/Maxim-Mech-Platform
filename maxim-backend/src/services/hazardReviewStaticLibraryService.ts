import { prisma } from '../lib/prisma'
import { uploadBlob, getBlobSasUrl, deleteBlob } from './blobStorageService'
import {
  HAZARD_RISK_TEMPLATE_KEYS,
  type HazardRiskTemplateKey,
} from '../seed/hazardRiskAssessmentTemplateFields'

function canManage(role: string) {
  return role === 'hr' || role === 'owner'
}

function assertBuiltInKey(templateKey: string): asserts templateKey is HazardRiskTemplateKey {
  if (!HAZARD_RISK_TEMPLATE_KEYS.includes(templateKey as HazardRiskTemplateKey)) {
    throw { status: 400, message: 'Invalid built-in template key' }
  }
}

export async function listStaticHiddenKeys(): Promise<string[]> {
  const rows = await prisma.hazardReviewStaticTemplateHidden.findMany({ select: { templateKey: true } })
  return rows.map((r) => r.templateKey)
}

export async function listStaticOverrideKeys(): Promise<string[]> {
  const rows = await prisma.hazardReviewStaticPdfOverride.findMany({ select: { templateKey: true } })
  return rows.map((r) => r.templateKey)
}

export async function isStaticTemplateHidden(templateKey: string): Promise<boolean> {
  const row = await prisma.hazardReviewStaticTemplateHidden.findUnique({
    where: { templateKey },
    select: { templateKey: true },
  })
  return !!row
}

export async function getStaticOverrideViewUrl(templateKey: string) {
  assertBuiltInKey(templateKey)
  const row = await prisma.hazardReviewStaticPdfOverride.findUnique({
    where: { templateKey },
    select: { filePath: true },
  })
  if (!row) throw { status: 404, message: 'No override PDF for this template' }
  const url = await getBlobSasUrl(row.filePath, 120)
  return { url }
}

export async function upsertStaticOverridePdf(
  templateKey: string,
  userRole: string,
  file: Express.Multer.File
) {
  if (!canManage(userRole)) throw { status: 403, message: 'Forbidden' }
  assertBuiltInKey(templateKey)

  const newPath = await uploadBlob(file.path, 'documents')
  const existing = await prisma.hazardReviewStaticPdfOverride.findUnique({
    where: { templateKey },
    select: { filePath: true },
  })
  if (existing?.filePath) await deleteBlob(existing.filePath)

  await prisma.hazardReviewStaticPdfOverride.upsert({
    where: { templateKey },
    create: { templateKey, filePath: newPath },
    update: { filePath: newPath },
  })

  return { templateKey, ok: true as const }
}

/** Remove built-in card from library and delete any replacement PDF. */
export async function hideStaticTemplate(templateKey: string, userRole: string) {
  if (!canManage(userRole)) throw { status: 403, message: 'Forbidden' }
  assertBuiltInKey(templateKey)

  const override = await prisma.hazardReviewStaticPdfOverride.findUnique({
    where: { templateKey },
    select: { filePath: true },
  })
  if (override?.filePath) await deleteBlob(override.filePath)

  await prisma.hazardReviewStaticPdfOverride.deleteMany({ where: { templateKey } })
  await prisma.hazardReviewStaticTemplateHidden.upsert({
    where: { templateKey },
    create: { templateKey },
    update: {},
  })

  return { ok: true as const }
}
