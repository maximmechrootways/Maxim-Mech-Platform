"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIME_OFF_REASONS = void 0;
exports.listVisibleLabourersForTimeOff = listVisibleLabourersForTimeOff;
exports.createTimeOffEntry = createTimeOffEntry;
exports.listTimeOffEntries = listTimeOffEntries;
exports.updateTimeOffEntry = updateTimeOffEntry;
exports.deleteTimeOffEntry = deleteTimeOffEntry;
const prisma_1 = require("../lib/prisma");
const crypto_1 = require("crypto");
const date_holidays_1 = __importDefault(require("date-holidays"));
const jobService_1 = require("./jobService");
exports.TIME_OFF_REASONS = [
    'Vacation',
    'Sickness',
    'Other',
    'Medical appointment',
    'Bereavement leave',
    'Compassionate leave',
    'Dental appointment',
    'Family responsibility leave',
    'Leave of Absence',
    'Parental leave',
    'Pregnancy/maternity leave',
    'Time off in lieu',
    'Training/events',
    'Unauthorized absence',
];
const SUPERVISOR_VISIBLE_TIME_OFF_REASON = 'Vacation';
function isSupervisor(role) {
    return role === 'supervisor';
}
function canManage(role) {
    return role === 'owner' || role === 'hr' || role === 'supervisor';
}
function canEditOrDelete(role) {
    return role === 'owner' || role === 'hr';
}
function normalizeCompensation(value) {
    return String(value || '').trim().toLowerCase() === 'unpaid' ? 'unpaid' : 'paid';
}
function parseDateOnly(value, fieldName) {
    const raw = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        throw { status: 400, message: `${fieldName} must be YYYY-MM-DD` };
    }
    const date = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()))
        throw { status: 400, message: `${fieldName} is invalid` };
    return date;
}
const ontarioHolidayCalendar = new date_holidays_1.default('CA', 'ON');
const holidayListCache = new Map();
const holidaySetCache = new Map();
let timeOffCompensationColumnExistsCache = null;
async function timeOffCompensationColumnExists() {
    if (timeOffCompensationColumnExistsCache != null)
        return timeOffCompensationColumnExistsCache;
    const rows = await prisma_1.prisma.$queryRaw `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'TimeOffEntry'
        AND column_name = 'compensation'
    ) AS "exists"
  `;
    const exists = Boolean(rows?.[0]?.exists);
    timeOffCompensationColumnExistsCache = exists;
    return exists;
}
function toIsoDateUtc(date) {
    return date.toISOString().slice(0, 10);
}
function addUtcDays(date, days) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}
function makeUtcDate(year, monthIndex, day) {
    return new Date(Date.UTC(year, monthIndex, day));
}
function isWeekendUtc(date) {
    const day = date.getUTCDay();
    return day === 0 || day === 6;
}
function extractHolidayIsoDate(holiday) {
    const dateText = String(holiday?.date || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(dateText))
        return dateText.slice(0, 10);
    if (holiday?.start instanceof Date)
        return toIsoDateUtc(holiday.start);
    return null;
}
function getOntarioStatHolidayList(year) {
    const cached = holidayListCache.get(year);
    if (cached)
        return cached;
    const raw = ontarioHolidayCalendar.getHolidays(year);
    const statutoryNameMatchers = [
        /New Year's Day/i,
        /Family Day/i,
        /Good Friday/i,
        /Victoria Day/i,
        /Canada Day/i,
        /Labour Day/i,
        /Thanksgiving/i,
        /Christmas Day/i,
        /Boxing Day/i,
    ];
    const byDate = new Map();
    for (const holiday of raw) {
        const types = Array.isArray(holiday?.type) ? holiday.type : [holiday?.type];
        if (!types.includes('public'))
            continue;
        const name = String(holiday?.name || '').trim();
        if (!statutoryNameMatchers.some((matcher) => matcher.test(name)))
            continue;
        const iso = extractHolidayIsoDate(holiday);
        if (!iso)
            continue;
        const displayName = name || 'Stat holiday';
        if (!byDate.has(iso)) {
            byDate.set(iso, { date: iso, name: displayName });
        }
        else {
            const existing = byDate.get(iso);
            if (!existing.name.includes(displayName)) {
                existing.name = `${existing.name} / ${displayName}`;
            }
        }
    }
    const list = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    holidayListCache.set(year, list);
    return list;
}
function getOntarioStatHolidayDateSet(year) {
    const cached = holidaySetCache.get(year);
    if (cached)
        return cached;
    const set = new Set(getOntarioStatHolidayList(year).map((x) => x.date));
    holidaySetCache.set(year, set);
    return set;
}
function countOntarioWorkdays(startUtc, endUtc) {
    if (endUtc < startUtc)
        return 0;
    let total = 0;
    for (let d = makeUtcDate(startUtc.getUTCFullYear(), startUtc.getUTCMonth(), startUtc.getUTCDate()); d <= endUtc; d = addUtcDays(d, 1)) {
        if (isWeekendUtc(d))
            continue;
        const yearHolidays = getOntarioStatHolidayDateSet(d.getUTCFullYear());
        if (yearHolidays.has(toIsoDateUtc(d)))
            continue;
        total += 1;
    }
    return total;
}
function isoDate(value) {
    if (!value)
        return null;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime()))
        return null;
    return d.toISOString().slice(0, 10);
}
async function getVisibleLabourers(actorUserId, actorRole) {
    if (!canManage(actorRole))
        throw { status: 403, message: 'Only Owner, HR, or supervisors can manage time off.' };
    if (isSupervisor(actorRole)) {
        const ids = await (0, jobService_1.getLabourerIdsSupervisedBy)(actorUserId);
        if (ids.length === 0)
            return [];
        const users = await prisma_1.prisma.user.findMany({
            where: { id: { in: ids }, isActive: true },
            select: { id: true, firstName: true, lastName: true },
            orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        });
        return users.map((u) => ({
            id: u.id,
            name: `${u.firstName} ${u.lastName}`.trim() || u.id,
        }));
    }
    // Time off can be recorded for any active user (not only labourers).
    // This supports HR managing mixed teams for payroll/audit tracking.
    const users = await prisma_1.prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    return users.map((u) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`.trim() || u.id,
    }));
}
function mapEntry(row) {
    const startIso = isoDate(row.startDate);
    const endIso = isoDate(row.endDate);
    const start = startIso ? new Date(`${startIso}T00:00:00.000Z`) : null;
    const end = endIso ? new Date(`${endIso}T00:00:00.000Z`) : null;
    return {
        id: row.id,
        labourerId: row.labourerId,
        labourerName: row.labourerName,
        createdById: row.createdById,
        createdByName: row.createdByName,
        reason: row.reason,
        compensation: normalizeCompensation(row.compensation),
        isPaid: normalizeCompensation(row.compensation) === 'paid',
        startDate: startIso,
        endDate: endIso,
        totalDays: start && end ? countOntarioWorkdays(start, end) : Number(row.totalDays) || 0,
        notes: row.notes ?? null,
        createdAt: row.createdAt?.toISOString?.() ?? new Date(row.createdAt).toISOString(),
    };
}
function clipDaysToYear(startDateIso, endDateIso, year) {
    if (!startDateIso || !endDateIso)
        return 0;
    const start = new Date(`${startDateIso}T00:00:00.000Z`);
    const end = new Date(`${endDateIso}T00:00:00.000Z`);
    const yStart = new Date(`${year}-01-01T00:00:00.000Z`);
    const yEnd = new Date(`${year}-12-31T00:00:00.000Z`);
    const from = start > yStart ? start : yStart;
    const to = end < yEnd ? end : yEnd;
    if (from > to)
        return 0;
    return countOntarioWorkdays(from, to);
}
async function listVisibleLabourersForTimeOff(actorUserId, actorRole) {
    return getVisibleLabourers(actorUserId, actorRole);
}
async function createTimeOffEntry(actorUserId, actorRole, input) {
    if (!canManage(actorRole))
        throw { status: 403, message: 'Only Owner, HR, or supervisors can add time off.' };
    const labourerId = String(input.labourerId || '').trim();
    const reason = String(input.reason || '').trim();
    const compensation = normalizeCompensation(input.compensation);
    const start = parseDateOnly(input.startDate, 'startDate');
    const end = parseDateOnly(input.endDate, 'endDate');
    const notes = String(input.notes || '').trim();
    if (!labourerId)
        throw { status: 400, message: 'labourerId is required' };
    if (!exports.TIME_OFF_REASONS.includes(reason)) {
        throw { status: 400, message: 'Please choose a valid time-off reason.' };
    }
    if (end < start)
        throw { status: 400, message: 'endDate cannot be before startDate.' };
    const visible = await getVisibleLabourers(actorUserId, actorRole);
    if (!visible.some((x) => x.id === labourerId)) {
        throw { status: 403, message: 'You can only add time off for users visible to your role.' };
    }
    const totalDays = countOntarioWorkdays(start, end);
    const hasCompensationColumn = await timeOffCompensationColumnExists();
    const rows = hasCompensationColumn
        ? await prisma_1.prisma.$queryRaw `
        INSERT INTO "TimeOffEntry"
          ("id", "labourerId", "createdById", "reason", "compensation", "startDate", "endDate", "totalDays", "notes", "createdAt")
        VALUES
          (${(0, crypto_1.randomUUID)()}, ${labourerId}, ${actorUserId}, ${reason}, ${compensation}, ${start}, ${end}, ${totalDays}, ${notes || null}, NOW())
        RETURNING "id", "labourerId", "createdById", "reason", "compensation", "startDate", "endDate", "totalDays", "notes", "createdAt"
      `
        : await prisma_1.prisma.$queryRaw `
        INSERT INTO "TimeOffEntry"
          ("id", "labourerId", "createdById", "reason", "startDate", "endDate", "totalDays", "notes", "createdAt")
        VALUES
          (${(0, crypto_1.randomUUID)()}, ${labourerId}, ${actorUserId}, ${reason}, ${start}, ${end}, ${totalDays}, ${notes || null}, NOW())
        RETURNING "id", "labourerId", "createdById", "reason", "startDate", "endDate", "totalDays", "notes", "createdAt"
      `;
    const row = rows[0];
    if (!row)
        throw new Error('Could not create time off entry');
    const labourer = visible.find((x) => x.id === row.labourerId);
    const actor = await prisma_1.prisma.user.findUnique({
        where: { id: actorUserId },
        select: { firstName: true, lastName: true },
    });
    return mapEntry({
        ...row,
        labourerName: labourer?.name || row.labourerId,
        createdByName: actor ? `${actor.firstName} ${actor.lastName}`.trim() : row.createdById,
    });
}
async function listTimeOffEntries(actorUserId, actorRole, query) {
    if (!canManage(actorRole))
        throw { status: 403, message: 'Only Owner, HR, or supervisors can view time off.' };
    const selectedYear = Number(query.year) || new Date().getUTCFullYear();
    const holidays = getOntarioStatHolidayList(selectedYear);
    const visible = await getVisibleLabourers(actorUserId, actorRole);
    const visibleIds = visible.map((x) => x.id);
    const reasons = [...exports.TIME_OFF_REASONS];
    if (visibleIds.length === 0) {
        return {
            entries: [],
            labourers: visible,
            reasons,
            year: selectedYear,
            holidays,
            yearlyTotals: [],
            yearlyTotalDays: 0,
        };
    }
    const yearStart = `${selectedYear}-01-01`;
    const yearEnd = `${selectedYear}-12-31`;
    const filterLabourerId = String(query.labourerId || '').trim();
    const hasCompensationColumn = await timeOffCompensationColumnExists();
    const whereLabourerIds = filterLabourerId ? visibleIds.filter((id) => id === filterLabourerId) : visibleIds;
    if (whereLabourerIds.length === 0) {
        return {
            entries: [],
            labourers: visible,
            reasons,
            year: selectedYear,
            holidays,
            yearlyTotals: [],
            yearlyTotalDays: 0,
        };
    }
    const supervisorReasonFilter = isSupervisor(actorRole) ? SUPERVISOR_VISIBLE_TIME_OFF_REASON : null;
    const rows = hasCompensationColumn
        ? isSupervisor(actorRole)
            ? await prisma_1.prisma.$queryRaw `
        SELECT
          t."id",
          t."labourerId",
          t."createdById",
          t."reason",
          t."compensation",
          t."startDate",
          t."endDate",
          t."totalDays",
          t."notes",
          t."createdAt",
          CONCAT(l."firstName", ' ', l."lastName") AS "labourerName",
          CONCAT(c."firstName", ' ', c."lastName") AS "createdByName"
        FROM "TimeOffEntry" t
        INNER JOIN "User" l ON l."id" = t."labourerId"
        INNER JOIN "User" c ON c."id" = t."createdById"
        WHERE
          t."labourerId" = ANY (${whereLabourerIds}::text[])
          AND t."startDate" <= ${new Date(`${yearEnd}T23:59:59.999Z`)}
          AND t."endDate" >= ${new Date(`${yearStart}T00:00:00.000Z`)}
          AND t."reason" = ${supervisorReasonFilter}
        ORDER BY t."startDate" DESC, t."createdAt" DESC
      `
            : await prisma_1.prisma.$queryRaw `
        SELECT
          t."id",
          t."labourerId",
          t."createdById",
          t."reason",
          t."compensation",
          t."startDate",
          t."endDate",
          t."totalDays",
          t."notes",
          t."createdAt",
          CONCAT(l."firstName", ' ', l."lastName") AS "labourerName",
          CONCAT(c."firstName", ' ', c."lastName") AS "createdByName"
        FROM "TimeOffEntry" t
        INNER JOIN "User" l ON l."id" = t."labourerId"
        INNER JOIN "User" c ON c."id" = t."createdById"
        WHERE
          t."labourerId" = ANY (${whereLabourerIds}::text[])
          AND t."startDate" <= ${new Date(`${yearEnd}T23:59:59.999Z`)}
          AND t."endDate" >= ${new Date(`${yearStart}T00:00:00.000Z`)}
        ORDER BY t."startDate" DESC, t."createdAt" DESC
      `
        : isSupervisor(actorRole)
            ? await prisma_1.prisma.$queryRaw `
        SELECT
          t."id",
          t."labourerId",
          t."createdById",
          t."reason",
          'paid'::text AS "compensation",
          t."startDate",
          t."endDate",
          t."totalDays",
          t."notes",
          t."createdAt",
          CONCAT(l."firstName", ' ', l."lastName") AS "labourerName",
          CONCAT(c."firstName", ' ', c."lastName") AS "createdByName"
        FROM "TimeOffEntry" t
        INNER JOIN "User" l ON l."id" = t."labourerId"
        INNER JOIN "User" c ON c."id" = t."createdById"
        WHERE
          t."labourerId" = ANY (${whereLabourerIds}::text[])
          AND t."startDate" <= ${new Date(`${yearEnd}T23:59:59.999Z`)}
          AND t."endDate" >= ${new Date(`${yearStart}T00:00:00.000Z`)}
          AND t."reason" = ${supervisorReasonFilter}
        ORDER BY t."startDate" DESC, t."createdAt" DESC
      `
            : await prisma_1.prisma.$queryRaw `
        SELECT
          t."id",
          t."labourerId",
          t."createdById",
          t."reason",
          'paid'::text AS "compensation",
          t."startDate",
          t."endDate",
          t."totalDays",
          t."notes",
          t."createdAt",
          CONCAT(l."firstName", ' ', l."lastName") AS "labourerName",
          CONCAT(c."firstName", ' ', c."lastName") AS "createdByName"
        FROM "TimeOffEntry" t
        INNER JOIN "User" l ON l."id" = t."labourerId"
        INNER JOIN "User" c ON c."id" = t."createdById"
        WHERE
          t."labourerId" = ANY (${whereLabourerIds}::text[])
          AND t."startDate" <= ${new Date(`${yearEnd}T23:59:59.999Z`)}
          AND t."endDate" >= ${new Date(`${yearStart}T00:00:00.000Z`)}
        ORDER BY t."startDate" DESC, t."createdAt" DESC
      `;
    const entries = rows.map(mapEntry).map((entry) => isSupervisor(actorRole) ? { ...entry, reason: SUPERVISOR_VISIBLE_TIME_OFF_REASON } : entry);
    const totalsMap = new Map();
    for (const entry of entries) {
        const clippedDays = clipDaysToYear(entry.startDate, entry.endDate, selectedYear);
        if (clippedDays <= 0)
            continue;
        const key = entry.labourerId;
        const existing = totalsMap.get(key);
        if (existing) {
            existing.totalDays += clippedDays;
        }
        else {
            totalsMap.set(key, {
                labourerId: entry.labourerId,
                labourerName: entry.labourerName,
                totalDays: clippedDays,
            });
        }
    }
    const yearlyTotals = Array.from(totalsMap.values()).sort((a, b) => b.totalDays - a.totalDays);
    const yearlyTotalDays = yearlyTotals.reduce((sum, x) => sum + x.totalDays, 0);
    return {
        entries,
        labourers: visible,
        reasons,
        year: selectedYear,
        holidays,
        yearlyTotals,
        yearlyTotalDays,
    };
}
async function updateTimeOffEntry(actorUserId, actorRole, entryId, input) {
    if (!canEditOrDelete(actorRole))
        throw { status: 403, message: 'Only Owner or HR can edit time off.' };
    const id = String(entryId || '').trim();
    if (!id)
        throw { status: 400, message: 'Entry id is required.' };
    const labourerId = String(input.labourerId || '').trim();
    const reason = String(input.reason || '').trim();
    const compensation = normalizeCompensation(input.compensation);
    const start = parseDateOnly(input.startDate, 'startDate');
    const end = parseDateOnly(input.endDate, 'endDate');
    const notes = String(input.notes || '').trim();
    if (!labourerId)
        throw { status: 400, message: 'labourerId is required' };
    if (!exports.TIME_OFF_REASONS.includes(reason)) {
        throw { status: 400, message: 'Please choose a valid time-off reason.' };
    }
    if (end < start)
        throw { status: 400, message: 'endDate cannot be before startDate.' };
    const visible = await getVisibleLabourers(actorUserId, actorRole);
    if (!visible.some((x) => x.id === labourerId)) {
        throw { status: 403, message: 'You can only assign time off for users visible to your role.' };
    }
    const existingRows = await prisma_1.prisma.$queryRaw `
    SELECT "id"
    FROM "TimeOffEntry"
    WHERE "id" = ${id}
    LIMIT 1
  `;
    if (!existingRows[0])
        throw { status: 404, message: 'Time off entry not found.' };
    const totalDays = countOntarioWorkdays(start, end);
    const hasCompensationColumn = await timeOffCompensationColumnExists();
    const rows = hasCompensationColumn
        ? await prisma_1.prisma.$queryRaw `
        UPDATE "TimeOffEntry"
        SET
          "labourerId" = ${labourerId},
          "reason" = ${reason},
          "compensation" = ${compensation},
          "startDate" = ${start},
          "endDate" = ${end},
          "totalDays" = ${totalDays},
          "notes" = ${notes || null}
        WHERE "id" = ${id}
        RETURNING "id", "labourerId", "createdById", "reason", "compensation", "startDate", "endDate", "totalDays", "notes", "createdAt"
      `
        : await prisma_1.prisma.$queryRaw `
        UPDATE "TimeOffEntry"
        SET
          "labourerId" = ${labourerId},
          "reason" = ${reason},
          "startDate" = ${start},
          "endDate" = ${end},
          "totalDays" = ${totalDays},
          "notes" = ${notes || null}
        WHERE "id" = ${id}
        RETURNING "id", "labourerId", "createdById", "reason", "startDate", "endDate", "totalDays", "notes", "createdAt"
      `;
    const row = rows[0];
    if (!row)
        throw { status: 404, message: 'Time off entry not found.' };
    const labourer = visible.find((x) => x.id === row.labourerId);
    const creator = await prisma_1.prisma.user.findUnique({
        where: { id: row.createdById },
        select: { firstName: true, lastName: true },
    });
    return mapEntry({
        ...row,
        labourerName: labourer?.name || row.labourerId,
        createdByName: creator ? `${creator.firstName} ${creator.lastName}`.trim() : row.createdById,
    });
}
async function deleteTimeOffEntry(actorUserId, actorRole, entryId) {
    if (!canEditOrDelete(actorRole))
        throw { status: 403, message: 'Only Owner or HR can delete time off.' };
    const id = String(entryId || '').trim();
    if (!id)
        throw { status: 400, message: 'Entry id is required.' };
    const visible = await getVisibleLabourers(actorUserId, actorRole);
    const visibleIds = visible.map((x) => x.id);
    if (visibleIds.length === 0)
        throw { status: 403, message: 'No users are visible to your role.' };
    const rows = await prisma_1.prisma.$queryRaw `
    DELETE FROM "TimeOffEntry"
    WHERE "id" = ${id}
      AND "labourerId" = ANY (${visibleIds}::text[])
    RETURNING "id"
  `;
    if (!rows[0])
        throw { status: 404, message: 'Time off entry not found.' };
    return { deleted: true };
}
