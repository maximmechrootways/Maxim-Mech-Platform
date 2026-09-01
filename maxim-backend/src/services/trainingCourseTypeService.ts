import { prisma } from '../lib/prisma'

function httpError(message: string, status: number) {
  const err = new Error(message) as Error & { status: number; statusCode: number }
  err.status = status
  err.statusCode = status
  return err
}

const TRAINING_META_PREFIX = '__training_meta__:'

/** Seed defaults — also used if catalog is empty. */
export const DEFAULT_PRIMARY_TRAINING_COURSES = [
  'Worker Health and Safety Awareness in 4 Steps',
  'Supervisor Health and Safety Awareness in 5 Steps',
  'WHMIS',
  'First Aid',
  'Aerial Work Platform, On/Off Slabs',
  'Buttcon Safety Orientation',
  'Confined Space Entry/Monitor',
  'eRailSafe_VIA',
  'eRailSave_CN',
  'TSSA',
  'Personal Track Safety (PTS)',
] as const

export type TrainingCourseTypeRecord = {
  id: string
  name: string
  isPrimary: boolean
  sortOrder: number
  isActive: boolean
  usageCount: number
  createdAt: string
  updatedAt: string
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

function namesEqual(a: string, b: string): boolean {
  return normalizeName(a).toLowerCase() === normalizeName(b).toLowerCase()
}

function decodeCourseName(displayName: string | null | undefined, fallback = ''): string {
  const raw = displayName?.trim() || ''
  if (raw.startsWith(TRAINING_META_PREFIX)) {
    try {
      const parsed = JSON.parse(raw.slice(TRAINING_META_PREFIX.length)) as { courseName?: string }
      return parsed.courseName?.trim() || fallback
    } catch {
      return fallback
    }
  }
  return raw || fallback
}

function encodeCourseName(
  courseName: string,
  hoursCompleted?: number,
  trainingFacility?: string,
  previousDisplayName?: string | null,
): string {
  let hours = hoursCompleted
  let facility = trainingFacility
  const prev = previousDisplayName?.trim() || ''
  if (prev.startsWith(TRAINING_META_PREFIX)) {
    try {
      const parsed = JSON.parse(prev.slice(TRAINING_META_PREFIX.length)) as {
        hoursCompleted?: number
        trainingFacility?: string
      }
      if (hours === undefined) hours = parsed.hoursCompleted
      if (facility === undefined) facility = parsed.trainingFacility
    } catch {
      /* ignore */
    }
  }
  return `${TRAINING_META_PREFIX}${JSON.stringify({
    courseName: courseName.trim(),
    hoursCompleted: typeof hours === 'number' && Number.isFinite(hours) ? hours : undefined,
    trainingFacility: facility?.trim() || undefined,
  })}`
}

async function buildUsageCountMap(): Promise<Map<string, number>> {
  const usage = new Map<string, number>()
  const bump = (name: string, by = 1) => {
    const key = normalizeName(name).toLowerCase()
    if (!key) return
    usage.set(key, (usage.get(key) ?? 0) + by)
  }

  const certGroups = await prisma.certificate.groupBy({
    by: ['name'],
    _count: { _all: true },
  })
  for (const row of certGroups) bump(row.name, row._count._all)

  const orphanDocs = await prisma.employeeDocument.findMany({
    where: { category: 'training', certificateId: null },
    select: { displayName: true, originalName: true },
  })
  for (const doc of orphanDocs) {
    bump(decodeCourseName(doc.displayName, doc.originalName))
  }
  return usage
}

async function countUsageByName(name: string, usageMap?: Map<string, number>): Promise<number> {
  if (usageMap) return usageMap.get(normalizeName(name).toLowerCase()) ?? 0
  const map = await buildUsageCountMap()
  return map.get(normalizeName(name).toLowerCase()) ?? 0
}

async function rewriteCourseNameEverywhere(fromName: string, toName: string): Promise<{
  certificatesUpdated: number
  documentsUpdated: number
}> {
  const from = normalizeName(fromName)
  const to = normalizeName(toName)
  if (!from || !to || namesEqual(from, to)) {
    return { certificatesUpdated: 0, documentsUpdated: 0 }
  }

  const certResult = await prisma.certificate.updateMany({
    where: { name: { equals: from, mode: 'insensitive' } },
    data: { name: to },
  })

  const docs = await prisma.employeeDocument.findMany({
    where: { category: 'training' },
    select: {
      id: true,
      displayName: true,
      originalName: true,
      hoursCompleted: true,
      trainingFacility: true,
    },
  })

  let documentsUpdated = 0
  for (const doc of docs) {
    const current = decodeCourseName(doc.displayName, doc.originalName)
    if (!namesEqual(current, from)) continue
    const nextDisplay = encodeCourseName(to, doc.hoursCompleted ?? undefined, doc.trainingFacility ?? undefined, doc.displayName)
    await prisma.employeeDocument.update({
      where: { id: doc.id },
      data: { displayName: nextDisplay },
    })
    documentsUpdated += 1
  }

  return { certificatesUpdated: certResult.count, documentsUpdated }
}

function mapRow(
  row: {
    id: string
    name: string
    isPrimary: boolean
    sortOrder: number
    isActive: boolean
    createdAt: Date
    updatedAt: Date
  },
  usageCount: number,
): TrainingCourseTypeRecord {
  return {
    id: row.id,
    name: row.name,
    isPrimary: row.isPrimary,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    usageCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Seed only the hardcoded primary defaults (cheap; safe on every list). */
export async function ensurePrimaryTrainingCourseSeeds(): Promise<void> {
  const existing = await prisma.trainingCourseType.findMany({ select: { name: true } })
  const existingKeys = new Set(existing.map((r) => r.name.trim().toLowerCase()))
  let sortOrder = 0
  for (const name of DEFAULT_PRIMARY_TRAINING_COURSES) {
    const key = name.toLowerCase()
    if (existingKeys.has(key)) continue
    await prisma.trainingCourseType.create({
      data: {
        name,
        isPrimary: true,
        sortOrder: sortOrder++,
        isActive: true,
      },
    })
    existingKeys.add(key)
  }
}

/** Discover orphan names from certificates / training docs and add as non-primary options. */
export async function discoverOrphanTrainingCourses(): Promise<number> {
  const existing = await prisma.trainingCourseType.findMany({ select: { name: true } })
  const existingKeys = new Set(existing.map((r) => r.name.trim().toLowerCase()))

  const certNames = await prisma.certificate.findMany({
    select: { name: true },
    distinct: ['name'],
  })
  const orphanDocs = await prisma.employeeDocument.findMany({
    where: { category: 'training', certificateId: null },
    select: { displayName: true, originalName: true },
  })

  const discovered = new Set<string>()
  for (const c of certNames) {
    const n = normalizeName(c.name)
    if (n) discovered.add(n)
  }
  for (const d of orphanDocs) {
    const n = normalizeName(decodeCourseName(d.displayName, d.originalName))
    if (!n || /\.(pdf|png|jpe?g|gif|webp)$/i.test(n)) continue
    discovered.add(n)
  }

  const maxSort = await prisma.trainingCourseType.aggregate({ _max: { sortOrder: true } })
  let nextSort = (maxSort._max.sortOrder ?? 0) + 1
  let created = 0
  for (const name of [...discovered].sort((a, b) => a.localeCompare(b))) {
    if (existingKeys.has(name.toLowerCase())) continue
    await prisma.trainingCourseType.create({
      data: {
        name,
        isPrimary: false,
        sortOrder: nextSort++,
        isActive: true,
      },
    })
    existingKeys.add(name.toLowerCase())
    created += 1
  }
  return created
}

/** Ensure primary defaults exist and discover orphan names from live certificate data. */
export async function ensureTrainingCourseCatalog(): Promise<void> {
  await ensurePrimaryTrainingCourseSeeds()
  await discoverOrphanTrainingCourses()
}

export async function listTrainingCourseTypes(options?: {
  includeInactive?: boolean
}): Promise<TrainingCourseTypeRecord[]> {
  // Keep list fast: only seed missing primaries. Full discovery is on startup + /ensure.
  await ensurePrimaryTrainingCourseSeeds()
  const rows = await prisma.trainingCourseType.findMany({
    where: options?.includeInactive ? undefined : { isActive: true },
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  })

  const usageMap = await buildUsageCountMap()
  return rows.map((row) => mapRow(row, usageMap.get(normalizeName(row.name).toLowerCase()) ?? 0))
}

export async function createTrainingCourseType(input: {
  name: string
  isPrimary?: boolean
}): Promise<TrainingCourseTypeRecord> {
  const name = normalizeName(input.name)
  if (!name) throw httpError('Course name is required', 400)

  const clash = await prisma.trainingCourseType.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
  })
  if (clash) {
    if (!clash.isActive) {
      const revived = await prisma.trainingCourseType.update({
        where: { id: clash.id },
        data: {
          name,
          isActive: true,
          isPrimary: input.isPrimary ?? clash.isPrimary,
        },
      })
      return mapRow(revived, await countUsageByName(revived.name))
    }
    throw httpError(`A course named "${clash.name}" already exists`, 409)
  }

  const maxSort = await prisma.trainingCourseType.aggregate({ _max: { sortOrder: true } })
  const created = await prisma.trainingCourseType.create({
    data: {
      name,
      isPrimary: !!input.isPrimary,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      isActive: true,
    },
  })
  return mapRow(created, 0)
}

export async function updateTrainingCourseType(
  id: string,
  input: { name?: string; isPrimary?: boolean; sortOrder?: number; isActive?: boolean },
): Promise<TrainingCourseTypeRecord & { certificatesUpdated?: number; documentsUpdated?: number }> {
  const existing = await prisma.trainingCourseType.findUnique({ where: { id } })
  if (!existing) throw httpError('Course type not found', 404)

  const nextName = input.name !== undefined ? normalizeName(input.name) : existing.name
  if (!nextName) throw httpError('Course name is required', 400)

  if (!namesEqual(nextName, existing.name)) {
    const clash = await prisma.trainingCourseType.findFirst({
      where: {
        id: { not: id },
        name: { equals: nextName, mode: 'insensitive' },
      },
    })
    if (clash) throw httpError(`A course named "${clash.name}" already exists`, 409)
  }

  let rewrite: { certificatesUpdated: number; documentsUpdated: number } | undefined
  if (!namesEqual(nextName, existing.name)) {
    rewrite = await rewriteCourseNameEverywhere(existing.name, nextName)
  }

  const updated = await prisma.trainingCourseType.update({
    where: { id },
    data: {
      name: nextName,
      ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  })

  return {
    ...mapRow(updated, await countUsageByName(updated.name)),
    ...rewrite,
  }
}

export async function mergeTrainingCourseType(input: {
  fromId?: string
  fromName?: string
  intoId: string
}): Promise<{
  into: TrainingCourseTypeRecord
  certificatesUpdated: number
  documentsUpdated: number
  removedId?: string
}> {
  const into = await prisma.trainingCourseType.findUnique({ where: { id: input.intoId } })
  if (!into || !into.isActive) throw httpError('Target course type not found', 404)

  let fromName = input.fromName ? normalizeName(input.fromName) : ''
  let fromId = input.fromId
  let fromRow = fromId
    ? await prisma.trainingCourseType.findUnique({ where: { id: fromId } })
    : null

  if (fromRow) {
    fromName = fromRow.name
    fromId = fromRow.id
  } else if (fromName) {
    fromRow = await prisma.trainingCourseType.findFirst({
      where: { name: { equals: fromName, mode: 'insensitive' } },
    })
    fromId = fromRow?.id
  }

  if (!fromName) throw httpError('Source course to merge is required', 400)
  if (fromId && fromId === into.id) throw httpError('Cannot merge a course into itself', 400)
  if (namesEqual(fromName, into.name)) {
    if (fromId && fromId !== into.id) {
      await prisma.trainingCourseType.delete({ where: { id: fromId } })
    }
    return {
      into: mapRow(into, await countUsageByName(into.name)),
      certificatesUpdated: 0,
      documentsUpdated: 0,
      removedId: fromId,
    }
  }

  const rewrite = await rewriteCourseNameEverywhere(fromName, into.name)

  if (fromId && fromId !== into.id) {
    await prisma.trainingCourseType.delete({ where: { id: fromId } })
  }

  // If source was only a free-text name with no catalog row, nothing else to delete
  return {
    into: mapRow(into, await countUsageByName(into.name)),
    certificatesUpdated: rewrite.certificatesUpdated,
    documentsUpdated: rewrite.documentsUpdated,
    removedId: fromId,
  }
}

export async function deleteTrainingCourseType(
  id: string,
  options?: { mergeIntoId?: string },
): Promise<{ deleted: true; certificatesUpdated?: number; documentsUpdated?: number; mergedInto?: TrainingCourseTypeRecord }> {
  const existing = await prisma.trainingCourseType.findUnique({ where: { id } })
  if (!existing) throw httpError('Course type not found', 404)

  const usage = await countUsageByName(existing.name)
  if (usage > 0) {
    if (!options?.mergeIntoId) {
      throw httpError(
        `Cannot delete "${existing.name}" while ${usage} record(s) still use it. Merge into another course first.`,
        400,
      )
    }
    const merged = await mergeTrainingCourseType({ fromId: id, intoId: options.mergeIntoId })
    return {
      deleted: true,
      certificatesUpdated: merged.certificatesUpdated,
      documentsUpdated: merged.documentsUpdated,
      mergedInto: merged.into,
    }
  }

  await prisma.trainingCourseType.delete({ where: { id } })
  return { deleted: true }
}
