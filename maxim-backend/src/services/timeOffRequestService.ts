import { prisma } from '../lib/prisma'
import {
  TIME_OFF_REASONS,
  countOntarioWorkdays,
  createTimeOffEntry,
  parseDateOnly,
} from './timeOffService'
import { createNotification } from './notificationService'

const REQUESTABLE_REASONS = TIME_OFF_REASONS.filter((r) => r !== 'Unauthorized absence')

function canApprove(role: string) {
  return role === 'owner' || role === 'hr'
}

function normalizeCompensation(value: unknown): 'paid' | 'unpaid' {
  return String(value || '').trim().toLowerCase() === 'unpaid' ? 'unpaid' : 'paid'
}

function isoDate(value: Date | string | null | undefined) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function displayName(user: { firstName?: string | null; lastName?: string | null; id: string }) {
  return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.id
}

function mapRequest(row: {
  id: string
  requesterId: string
  reason: string
  compensation: string
  startDate: Date
  endDate: Date
  totalDays: number
  notes: string | null
  status: string
  reviewedById: string | null
  reviewedAt: Date | null
  reviewNotes: string | null
  timeOffEntryId: string | null
  createdAt: Date
  updatedAt: Date
  requester?: { firstName: string; lastName: string; id: string } | null
  reviewedBy?: { firstName: string; lastName: string; id: string } | null
}) {
  return {
    id: row.id,
    requesterId: row.requesterId,
    requesterName: row.requester ? displayName(row.requester) : row.requesterId,
    reason: row.reason,
    compensation: normalizeCompensation(row.compensation),
    startDate: isoDate(row.startDate),
    endDate: isoDate(row.endDate),
    totalDays: row.totalDays,
    notes: row.notes,
    status: row.status,
    reviewedById: row.reviewedById,
    reviewedByName: row.reviewedBy ? displayName(row.reviewedBy) : null,
    reviewedAt: row.reviewedAt?.toISOString?.() ?? (row.reviewedAt ? new Date(row.reviewedAt).toISOString() : null),
    reviewNotes: row.reviewNotes,
    timeOffEntryId: row.timeOffEntryId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function notifyHrAndOwners(title: string, body: string, linkTo: string) {
  const recipients = await prisma.user.findMany({
    where: { isActive: true, role: { in: ['owner', 'hr'] } },
    select: { id: true },
  })
  await Promise.all(
    recipients.map((u) =>
      createNotification({
        userId: u.id,
        title,
        body,
        type: 'alert',
        linkTo,
        emailPreferenceKey: 'announcements',
      }).catch(() => {}),
    ),
  )
}

export function listRequestableReasons() {
  return [...REQUESTABLE_REASONS]
}

export async function createTimeOffRequest(
  actorUserId: string,
  input: {
    reason?: string
    compensation?: string
    startDate?: string
    endDate?: string
    notes?: string
  },
) {
  const reason = String(input.reason || '').trim()
  const compensation = normalizeCompensation(input.compensation)
  const start = parseDateOnly(input.startDate, 'startDate')
  const end = parseDateOnly(input.endDate, 'endDate')
  const notes = String(input.notes || '').trim()

  if (!REQUESTABLE_REASONS.includes(reason as (typeof REQUESTABLE_REASONS)[number])) {
    throw { status: 400, message: 'Please choose a valid time-off reason.' }
  }
  if (end < start) throw { status: 400, message: 'endDate cannot be before startDate.' }

  const requester = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { id: true, firstName: true, lastName: true, isActive: true },
  })
  if (!requester?.isActive) throw { status: 403, message: 'Your account cannot request time off.' }

  const totalDays = countOntarioWorkdays(start, end)
  if (totalDays < 1) {
    throw { status: 400, message: 'Selected dates include no working days (weekends/holidays excluded).' }
  }

  const created = await prisma.timeOffRequest.create({
    data: {
      requesterId: actorUserId,
      reason,
      compensation,
      startDate: start,
      endDate: end,
      totalDays,
      notes: notes || null,
      status: 'pending',
    },
    include: {
      requester: { select: { id: true, firstName: true, lastName: true } },
      reviewedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  })

  const name = displayName(requester)
  const range = `${isoDate(start)} to ${isoDate(end)}`
  await notifyHrAndOwners(
    'Time off request',
    `${name} requested ${reason.toLowerCase()} (${totalDays} day${totalDays === 1 ? '' : 's'}, ${range}). Open Time Off to approve or deny.`,
    '/hr/time-off?tab=requests',
  )

  return mapRequest(created)
}

export async function listTimeOffRequests(
  actorUserId: string,
  actorRole: string,
  query: { status?: string; mine?: boolean | string },
) {
  const statusFilter = String(query.status || '').trim().toLowerCase()
  const where: { requesterId?: string; status?: string } = {}
  const mineOnly =
    query.mine === true ||
    String(query.mine || '')
      .trim()
      .toLowerCase() === 'true' ||
    String(query.mine || '').trim() === '1'

  // Approvers normally see everyone's requests; "mine" keeps self-service pages scoped to the actor.
  if (mineOnly || !canApprove(actorRole)) {
    where.requesterId = actorUserId
  }

  if (statusFilter && ['pending', 'approved', 'denied', 'cancelled'].includes(statusFilter)) {
    where.status = statusFilter
  } else if (canApprove(actorRole) && !statusFilter) {
    // HR default: show pending first in UI; still return all unless filtered
  }

  const rows = await prisma.timeOffRequest.findMany({
    where,
    include: {
      requester: { select: { id: true, firstName: true, lastName: true } },
      reviewedBy: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 200,
  })

  // Put pending first, then newest
  const mapped = rows.map(mapRequest)
  mapped.sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1
    if (b.status === 'pending' && a.status !== 'pending') return 1
    return (b.createdAt || '').localeCompare(a.createdAt || '')
  })

  return {
    requests: mapped,
    reasons: listRequestableReasons(),
    canApprove: canApprove(actorRole),
  }
}

export async function cancelTimeOffRequest(actorUserId: string, requestId: string) {
  const id = String(requestId || '').trim()
  if (!id) throw { status: 400, message: 'Request id is required.' }

  const existing = await prisma.timeOffRequest.findUnique({ where: { id } })
  if (!existing) throw { status: 404, message: 'Time off request not found.' }
  if (existing.requesterId !== actorUserId) {
    throw { status: 403, message: 'You can only cancel your own requests.' }
  }
  if (existing.status !== 'pending') {
    throw { status: 400, message: 'Only pending requests can be cancelled.' }
  }

  const updated = await prisma.timeOffRequest.update({
    where: { id },
    data: { status: 'cancelled' },
    include: {
      requester: { select: { id: true, firstName: true, lastName: true } },
      reviewedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  })
  return mapRequest(updated)
}

export async function approveTimeOffRequest(
  actorUserId: string,
  actorRole: string,
  requestId: string,
  input: { compensation?: string; reviewNotes?: string } = {},
) {
  if (!canApprove(actorRole)) throw { status: 403, message: 'Only Owner or HR can approve time off requests.' }

  const id = String(requestId || '').trim()
  if (!id) throw { status: 400, message: 'Request id is required.' }

  const existing = await prisma.timeOffRequest.findUnique({
    where: { id },
    include: { requester: { select: { id: true, firstName: true, lastName: true } } },
  })
  if (!existing) throw { status: 404, message: 'Time off request not found.' }
  if (existing.status !== 'pending') throw { status: 400, message: 'Only pending requests can be approved.' }

  const compensation = input.compensation != null ? normalizeCompensation(input.compensation) : normalizeCompensation(existing.compensation)
  const reviewNotes = String(input.reviewNotes || '').trim()
  const startIso = isoDate(existing.startDate)!
  const endIso = isoDate(existing.endDate)!

  const entry = await createTimeOffEntry(actorUserId, actorRole, {
    labourerId: existing.requesterId,
    reason: existing.reason,
    compensation,
    startDate: startIso,
    endDate: endIso,
    notes: [existing.notes, reviewNotes ? `HR note: ${reviewNotes}` : ''].filter(Boolean).join('\n') || undefined,
  })

  const updated = await prisma.timeOffRequest.update({
    where: { id },
    data: {
      status: 'approved',
      compensation,
      reviewedById: actorUserId,
      reviewedAt: new Date(),
      reviewNotes: reviewNotes || null,
      timeOffEntryId: entry.id,
    },
    include: {
      requester: { select: { id: true, firstName: true, lastName: true } },
      reviewedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  })

  await createNotification({
    userId: existing.requesterId,
    title: 'Time off approved',
    body: `Your ${existing.reason.toLowerCase()} request (${startIso} to ${endIso}) was approved.`,
    type: 'info',
    linkTo: '/my-time-off',
    emailPreferenceKey: 'announcements',
  }).catch(() => {})

  return mapRequest(updated)
}

export async function denyTimeOffRequest(
  actorUserId: string,
  actorRole: string,
  requestId: string,
  input: { reviewNotes?: string } = {},
) {
  if (!canApprove(actorRole)) throw { status: 403, message: 'Only Owner or HR can deny time off requests.' }

  const id = String(requestId || '').trim()
  if (!id) throw { status: 400, message: 'Request id is required.' }

  const existing = await prisma.timeOffRequest.findUnique({ where: { id } })
  if (!existing) throw { status: 404, message: 'Time off request not found.' }
  if (existing.status !== 'pending') throw { status: 400, message: 'Only pending requests can be denied.' }

  const reviewNotes = String(input.reviewNotes || '').trim()
  const updated = await prisma.timeOffRequest.update({
    where: { id },
    data: {
      status: 'denied',
      reviewedById: actorUserId,
      reviewedAt: new Date(),
      reviewNotes: reviewNotes || null,
    },
    include: {
      requester: { select: { id: true, firstName: true, lastName: true } },
      reviewedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  })

  const startIso = isoDate(existing.startDate)
  const endIso = isoDate(existing.endDate)
  await createNotification({
    userId: existing.requesterId,
    title: 'Time off denied',
    body: reviewNotes
      ? `Your ${existing.reason.toLowerCase()} request (${startIso} to ${endIso}) was denied: ${reviewNotes}`
      : `Your ${existing.reason.toLowerCase()} request (${startIso} to ${endIso}) was denied.`,
    type: 'alert',
    linkTo: '/my-time-off',
    emailPreferenceKey: 'announcements',
  }).catch(() => {})

  return mapRequest(updated)
}
