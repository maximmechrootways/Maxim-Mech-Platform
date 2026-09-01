import { prisma } from '../lib/prisma'
import path from 'path'
import fs from 'fs'
import { uploadBlob, deleteBlob } from './blobStorageService'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse')

function isOwnerOrHr(role: string) {
  return role === 'owner' || role === 'hr'
}

const CUSTOM_TEMPLATE_PREFIX = 'custom-form://'

function toSafeFieldLabel(label: unknown): string {
  return String(label ?? '').trim().slice(0, 200)
}

function normalizeCustomFields(fields: any[] | undefined) {
  if (!Array.isArray(fields) || fields.length === 0) return []
  return fields.map((f: any, idx: number) => {
    const rawType = String(f?.type ?? 'TEXT').toUpperCase()
    const type = (rawType === 'DATE' || rawType === 'SIGNATURE' || rawType === 'CHECKBOX' || rawType === 'NUMBER' ? rawType : 'TEXT') as any
    const page = 1
    const x = 0.05
    const y = Math.max(0, Math.min(0.9, 0.05 + idx * 0.055))
    const width = type === 'CHECKBOX' ? 0.06 : 0.9
    const height = type === 'CHECKBOX' ? 0.04 : 0.05
    return {
      type,
      label: toSafeFieldLabel(f?.label || `Field ${idx + 1}`),
      page,
      x,
      y,
      width,
      height,
      required: Boolean(f?.required),
    }
  })
}

export async function createTemplate(
  userId: string,
  userRole: string,
  file: Express.Multer.File,
  name?: string
) {
  if (!isOwnerOrHr(userRole)) throw { status: 403, message: 'Only Owner or HR can upload PDF templates' }
  const localFilePath = file.path
  console.log('Creating template, localFilePath:', localFilePath)

  // Parse PDF page count BEFORE uploading (uploadBlob deletes the local file)
  let pageCount = 1
  try {
    const fileBuffer = fs.readFileSync(localFilePath)
    const pdfData = await pdfParse(fileBuffer)
    pageCount = pdfData.numpages ?? 1
    console.log('PDF parsed, pages:', pageCount)
  } catch (e) {
    console.warn('pdf-parse failed, using pageCount=1:', e)
  }

  // Upload to Azure Blob Storage (deletes local file on success or failure)
  const blobName = await uploadBlob(localFilePath, 'templates')
  console.log('Uploaded to blob:', blobName)

  const templateName = (name || file.originalname || 'Untitled').replace(/\.pdf$/i, '')
  const result = await prisma.pdfTemplate.create({
    data: {
      name: templateName,
      filePath: blobName,
      pageCount,
      assignedRoles: [],
      createdById: userId,
    },
    include: { fields: true },
  })
  console.log('Template created, id:', result.id)
  return result
}

export async function createCustomTemplate(
  userId: string,
  userRole: string,
  payload: {
    name?: string
    description?: string
    assignedRoles?: string[]
    assignedUserIds?: string[]
    fields?: Array<{ type?: string; label?: string; required?: boolean }>
  }
) {
  if (!isOwnerOrHr(userRole)) throw { status: 403, message: 'Only Owner or HR can create custom templates' }
  const trimmedName = String(payload?.name ?? '').trim()
  if (!trimmedName) throw { status: 400, message: 'Template name is required' }

  const created = await prisma.pdfTemplate.create({
    data: {
      name: trimmedName,
      description: payload?.description ? String(payload.description).trim() : undefined,
      filePath: `${CUSTOM_TEMPLATE_PREFIX}${Date.now()}-${Math.round(Math.random() * 1e9)}`,
      pageCount: 1,
      assignedRoles: Array.isArray(payload?.assignedRoles) ? payload.assignedRoles.map((r) => String(r)) : [],
      assignedUserIds: Array.isArray(payload?.assignedUserIds) ? payload.assignedUserIds.map((id) => String(id)) : [],
      createdById: userId,
      fields: {
        create: normalizeCustomFields(payload?.fields),
      },
    },
    include: { fields: true },
  })
  return created
}

export async function listTemplates(userId: string, userRole: string) {
  if (isOwnerOrHr(userRole)) {
    // Owner/HR see all active templates
    const list = await prisma.pdfTemplate.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      include: { fields: true },
    })
    return list.map(formatTemplate)
  }

  // Other users see templates assigned to their role or their userId
  const list = await prisma.pdfTemplate.findMany({
    where: {
      isActive: true,
      OR: [
        { assignedRoles: { has: userRole } },
        { assignedUserIds: { has: userId } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    include: { fields: true },
  })
  return list.map(formatTemplate)
}

function formatTemplate(t: any) {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    filePath: t.filePath,
    pageCount: t.pageCount,
    assignedRoles: t.assignedRoles,
    assignedUserIds: t.assignedUserIds,
    isActive: t.isActive,
    createdAt: t.createdAt.toISOString(),
  }
}

export async function getTemplateById(id: string, userId: string, userRole: string) {
  const t = await prisma.pdfTemplate.findUnique({
    where: { id },
    include: { fields: true },
  })
  if (!t) throw { status: 404, message: 'Template not found' }

  // Non-owner/HR users can only view templates assigned to them
  if (!isOwnerOrHr(userRole)) {
    const assignedByRole = (t.assignedRoles as string[]).includes(userRole)
    const assignedById = (t.assignedUserIds as string[]).includes(userId)
    if (!assignedByRole && !assignedById) {
      // Also allow access if user has a PdfFormAssignment for this template
      const hasAssignment = await prisma.pdfFormAssignment.findFirst({
        where: { templateId: id, assignedToId: userId },
      })
      if (!hasAssignment) {
        throw { status: 403, message: 'Forbidden' }
      }
    }
  }
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    filePath: t.filePath,
    pageCount: t.pageCount,
    assignedRoles: t.assignedRoles,
    assignedUserIds: t.assignedUserIds,
    isActive: t.isActive,
    createdAt: t.createdAt.toISOString(),
    fields: t.fields.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      page: f.page,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      required: f.required,
    })),
  }
}

export async function updateTemplate(
  id: string,
  userId: string,
  userRole: string,
  data: { name?: string; description?: string; assignedRoles?: string[]; assignedUserIds?: string[]; fields?: any[] }
) {
  if (!isOwnerOrHr(userRole)) throw { status: 403, message: 'Forbidden' }
  const template = await prisma.pdfTemplate.findUnique({ where: { id } })
  if (!template) throw { status: 404, message: 'Template not found' }

  if (data.fields != null) {
    const existingFields = await prisma.pdfField.findMany({
      where: { templateId: id },
      select: { id: true, type: true, label: true, page: true },
    })
    const keyOf = (f: { type?: string; label?: string; page?: number }) =>
      `${String(f.type ?? '').toUpperCase()}::${String(f.label ?? '')}::${Number(f.page ?? 1)}`
    const existingByKey = new Map<string, string[]>()
    for (const field of existingFields) {
      const key = keyOf(field)
      const bucket = existingByKey.get(key) ?? []
      bucket.push(field.id)
      existingByKey.set(key, bucket)
    }
    const preparedFields = data.fields.map((f: any) => {
      const key = keyOf({ type: f.type, label: f.label ?? '', page: f.page ?? 1 })
      const bucket = existingByKey.get(key) ?? []
      const preservedId = bucket.shift()
      existingByKey.set(key, bucket)
      return { ...f, preservedId }
    })

    await prisma.pdfField.deleteMany({ where: { templateId: id } })
    if (data.fields.length > 0) {
      await prisma.pdfField.createMany({
        data: preparedFields.map((f: any) => ({
          ...(f.preservedId ? { id: f.preservedId } : {}),
          templateId: id,
          type: f.type,
          label: f.label ?? '',
          page: f.page ?? 1,
          x: f.x ?? 0,
          y: f.y ?? 0,
          width: f.width ?? 0.1,
          height: f.height ?? 0.04,
          required: f.required ?? false,
        })),
      })
    }
  }

  const updated = await prisma.pdfTemplate.update({
    where: { id },
    data: {
      ...(data.name != null && { name: data.name }),
      ...(data.description != null && { description: data.description }),
      ...(data.assignedRoles != null && { assignedRoles: data.assignedRoles }),
      ...(data.assignedUserIds != null && { assignedUserIds: data.assignedUserIds }),
    },
    include: { fields: true },
  })
  return updated
}

export async function deleteTemplate(
  id: string,
  userId: string,
  userRole: string
) {
  if (!isOwnerOrHr(userRole)) throw { status: 403, message: 'Forbidden' }
  const template = await prisma.pdfTemplate.findUnique({
    where: { id },
    select: { id: true, filePath: true },
  })
  if (!template) throw { status: 404, message: 'Template not found' }

  await prisma.pdfTemplate.update({
    where: { id },
    data: { isActive: false },
  })

  // Delete blob from Azure (non-blocking — failure won't affect DB result)
  if (template.filePath) {
    await deleteBlob(template.filePath)
  }

  return { message: 'Template deleted' }
}
