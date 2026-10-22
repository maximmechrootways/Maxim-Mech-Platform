"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PRIMARY_TRAINING_COURSES = void 0;
exports.ensurePrimaryTrainingCourseSeeds = ensurePrimaryTrainingCourseSeeds;
exports.discoverOrphanTrainingCourses = discoverOrphanTrainingCourses;
exports.ensureTrainingCourseCatalog = ensureTrainingCourseCatalog;
exports.listTrainingCourseTypes = listTrainingCourseTypes;
exports.createTrainingCourseType = createTrainingCourseType;
exports.updateTrainingCourseType = updateTrainingCourseType;
exports.mergeTrainingCourseType = mergeTrainingCourseType;
exports.deleteTrainingCourseType = deleteTrainingCourseType;
const prisma_1 = require("../lib/prisma");
function httpError(message, status) {
    const err = new Error(message);
    err.status = status;
    err.statusCode = status;
    return err;
}
const TRAINING_META_PREFIX = '__training_meta__:';
/** Seed defaults — also used if catalog is empty. */
exports.DEFAULT_PRIMARY_TRAINING_COURSES = [
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
];
function normalizeName(name) {
    return name.trim().replace(/\s+/g, ' ');
}
function namesEqual(a, b) {
    return normalizeName(a).toLowerCase() === normalizeName(b).toLowerCase();
}
function decodeCourseName(displayName, fallback = '') {
    const raw = displayName?.trim() || '';
    if (raw.startsWith(TRAINING_META_PREFIX)) {
        try {
            const parsed = JSON.parse(raw.slice(TRAINING_META_PREFIX.length));
            return parsed.courseName?.trim() || fallback;
        }
        catch {
            return fallback;
        }
    }
    return raw || fallback;
}
function encodeCourseName(courseName, hoursCompleted, trainingFacility, previousDisplayName) {
    let hours = hoursCompleted;
    let facility = trainingFacility;
    const prev = previousDisplayName?.trim() || '';
    if (prev.startsWith(TRAINING_META_PREFIX)) {
        try {
            const parsed = JSON.parse(prev.slice(TRAINING_META_PREFIX.length));
            if (hours === undefined)
                hours = parsed.hoursCompleted;
            if (facility === undefined)
                facility = parsed.trainingFacility;
        }
        catch {
            /* ignore */
        }
    }
    return `${TRAINING_META_PREFIX}${JSON.stringify({
        courseName: courseName.trim(),
        hoursCompleted: typeof hours === 'number' && Number.isFinite(hours) ? hours : undefined,
        trainingFacility: facility?.trim() || undefined,
    })}`;
}
async function buildUsageCountMap() {
    const usage = new Map();
    const bump = (name, by = 1) => {
        const key = normalizeName(name).toLowerCase();
        if (!key)
            return;
        usage.set(key, (usage.get(key) ?? 0) + by);
    };
    const certGroups = await prisma_1.prisma.certificate.groupBy({
        by: ['name'],
        _count: { _all: true },
    });
    for (const row of certGroups)
        bump(row.name, row._count._all);
    const orphanDocs = await prisma_1.prisma.employeeDocument.findMany({
        where: { category: 'training', certificateId: null },
        select: { displayName: true, originalName: true },
    });
    for (const doc of orphanDocs) {
        bump(decodeCourseName(doc.displayName, doc.originalName));
    }
    return usage;
}
async function countUsageByName(name, usageMap) {
    if (usageMap)
        return usageMap.get(normalizeName(name).toLowerCase()) ?? 0;
    const map = await buildUsageCountMap();
    return map.get(normalizeName(name).toLowerCase()) ?? 0;
}
async function rewriteCourseNameEverywhere(fromName, toName) {
    const from = normalizeName(fromName);
    const to = normalizeName(toName);
    if (!from || !to || namesEqual(from, to)) {
        return { certificatesUpdated: 0, documentsUpdated: 0 };
    }
    const certResult = await prisma_1.prisma.certificate.updateMany({
        where: { name: { equals: from, mode: 'insensitive' } },
        data: { name: to },
    });
    const docs = await prisma_1.prisma.employeeDocument.findMany({
        where: { category: 'training' },
        select: {
            id: true,
            displayName: true,
            originalName: true,
            hoursCompleted: true,
            trainingFacility: true,
        },
    });
    let documentsUpdated = 0;
    for (const doc of docs) {
        const current = decodeCourseName(doc.displayName, doc.originalName);
        if (!namesEqual(current, from))
            continue;
        const nextDisplay = encodeCourseName(to, doc.hoursCompleted ?? undefined, doc.trainingFacility ?? undefined, doc.displayName);
        await prisma_1.prisma.employeeDocument.update({
            where: { id: doc.id },
            data: { displayName: nextDisplay },
        });
        documentsUpdated += 1;
    }
    return { certificatesUpdated: certResult.count, documentsUpdated };
}
function mapRow(row, usageCount) {
    return {
        id: row.id,
        name: row.name,
        isPrimary: row.isPrimary,
        sortOrder: row.sortOrder,
        isActive: row.isActive,
        usageCount,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}
/** Seed only the hardcoded primary defaults (cheap; safe on every list). */
async function ensurePrimaryTrainingCourseSeeds() {
    const existing = await prisma_1.prisma.trainingCourseType.findMany({ select: { name: true } });
    const existingKeys = new Set(existing.map((r) => r.name.trim().toLowerCase()));
    let sortOrder = 0;
    for (const name of exports.DEFAULT_PRIMARY_TRAINING_COURSES) {
        const key = name.toLowerCase();
        if (existingKeys.has(key))
            continue;
        await prisma_1.prisma.trainingCourseType.create({
            data: {
                name,
                isPrimary: true,
                sortOrder: sortOrder++,
                isActive: true,
            },
        });
        existingKeys.add(key);
    }
}
/** Discover orphan names from certificates / training docs and add as non-primary options. */
async function discoverOrphanTrainingCourses() {
    const existing = await prisma_1.prisma.trainingCourseType.findMany({ select: { name: true } });
    const existingKeys = new Set(existing.map((r) => r.name.trim().toLowerCase()));
    const certNames = await prisma_1.prisma.certificate.findMany({
        select: { name: true },
        distinct: ['name'],
    });
    const orphanDocs = await prisma_1.prisma.employeeDocument.findMany({
        where: { category: 'training', certificateId: null },
        select: { displayName: true, originalName: true },
    });
    const discovered = new Set();
    for (const c of certNames) {
        const n = normalizeName(c.name);
        if (n)
            discovered.add(n);
    }
    for (const d of orphanDocs) {
        const n = normalizeName(decodeCourseName(d.displayName, d.originalName));
        if (!n || /\.(pdf|png|jpe?g|gif|webp)$/i.test(n))
            continue;
        discovered.add(n);
    }
    const maxSort = await prisma_1.prisma.trainingCourseType.aggregate({ _max: { sortOrder: true } });
    let nextSort = (maxSort._max.sortOrder ?? 0) + 1;
    let created = 0;
    for (const name of [...discovered].sort((a, b) => a.localeCompare(b))) {
        if (existingKeys.has(name.toLowerCase()))
            continue;
        await prisma_1.prisma.trainingCourseType.create({
            data: {
                name,
                isPrimary: false,
                sortOrder: nextSort++,
                isActive: true,
            },
        });
        existingKeys.add(name.toLowerCase());
        created += 1;
    }
    return created;
}
/** Ensure primary defaults exist and discover orphan names from live certificate data. */
async function ensureTrainingCourseCatalog() {
    await ensurePrimaryTrainingCourseSeeds();
    await discoverOrphanTrainingCourses();
}
async function listTrainingCourseTypes(options) {
    // Keep list fast: only seed missing primaries. Full discovery is on startup + /ensure.
    await ensurePrimaryTrainingCourseSeeds();
    const rows = await prisma_1.prisma.trainingCourseType.findMany({
        where: options?.includeInactive ? undefined : { isActive: true },
        orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    const usageMap = await buildUsageCountMap();
    return rows.map((row) => mapRow(row, usageMap.get(normalizeName(row.name).toLowerCase()) ?? 0));
}
async function createTrainingCourseType(input) {
    const name = normalizeName(input.name);
    if (!name)
        throw httpError('Course name is required', 400);
    const clash = await prisma_1.prisma.trainingCourseType.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (clash) {
        if (!clash.isActive) {
            const revived = await prisma_1.prisma.trainingCourseType.update({
                where: { id: clash.id },
                data: {
                    name,
                    isActive: true,
                    isPrimary: input.isPrimary ?? clash.isPrimary,
                },
            });
            return mapRow(revived, await countUsageByName(revived.name));
        }
        throw httpError(`A course named "${clash.name}" already exists`, 409);
    }
    const maxSort = await prisma_1.prisma.trainingCourseType.aggregate({ _max: { sortOrder: true } });
    const created = await prisma_1.prisma.trainingCourseType.create({
        data: {
            name,
            isPrimary: !!input.isPrimary,
            sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
            isActive: true,
        },
    });
    return mapRow(created, 0);
}
async function updateTrainingCourseType(id, input) {
    const existing = await prisma_1.prisma.trainingCourseType.findUnique({ where: { id } });
    if (!existing)
        throw httpError('Course type not found', 404);
    const nextName = input.name !== undefined ? normalizeName(input.name) : existing.name;
    if (!nextName)
        throw httpError('Course name is required', 400);
    if (!namesEqual(nextName, existing.name)) {
        const clash = await prisma_1.prisma.trainingCourseType.findFirst({
            where: {
                id: { not: id },
                name: { equals: nextName, mode: 'insensitive' },
            },
        });
        if (clash)
            throw httpError(`A course named "${clash.name}" already exists`, 409);
    }
    let rewrite;
    if (!namesEqual(nextName, existing.name)) {
        rewrite = await rewriteCourseNameEverywhere(existing.name, nextName);
    }
    const updated = await prisma_1.prisma.trainingCourseType.update({
        where: { id },
        data: {
            name: nextName,
            ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
            ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
            ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
    });
    return {
        ...mapRow(updated, await countUsageByName(updated.name)),
        ...rewrite,
    };
}
async function mergeTrainingCourseType(input) {
    const into = await prisma_1.prisma.trainingCourseType.findUnique({ where: { id: input.intoId } });
    if (!into || !into.isActive)
        throw httpError('Target course type not found', 404);
    let fromName = input.fromName ? normalizeName(input.fromName) : '';
    let fromId = input.fromId;
    let fromRow = fromId
        ? await prisma_1.prisma.trainingCourseType.findUnique({ where: { id: fromId } })
        : null;
    if (fromRow) {
        fromName = fromRow.name;
        fromId = fromRow.id;
    }
    else if (fromName) {
        fromRow = await prisma_1.prisma.trainingCourseType.findFirst({
            where: { name: { equals: fromName, mode: 'insensitive' } },
        });
        fromId = fromRow?.id;
    }
    if (!fromName)
        throw httpError('Source course to merge is required', 400);
    if (fromId && fromId === into.id)
        throw httpError('Cannot merge a course into itself', 400);
    if (namesEqual(fromName, into.name)) {
        if (fromId && fromId !== into.id) {
            await prisma_1.prisma.trainingCourseType.delete({ where: { id: fromId } });
        }
        return {
            into: mapRow(into, await countUsageByName(into.name)),
            certificatesUpdated: 0,
            documentsUpdated: 0,
            removedId: fromId,
        };
    }
    const rewrite = await rewriteCourseNameEverywhere(fromName, into.name);
    if (fromId && fromId !== into.id) {
        await prisma_1.prisma.trainingCourseType.delete({ where: { id: fromId } });
    }
    // If source was only a free-text name with no catalog row, nothing else to delete
    return {
        into: mapRow(into, await countUsageByName(into.name)),
        certificatesUpdated: rewrite.certificatesUpdated,
        documentsUpdated: rewrite.documentsUpdated,
        removedId: fromId,
    };
}
async function deleteTrainingCourseType(id, options) {
    const existing = await prisma_1.prisma.trainingCourseType.findUnique({ where: { id } });
    if (!existing)
        throw httpError('Course type not found', 404);
    const usage = await countUsageByName(existing.name);
    if (usage > 0) {
        if (!options?.mergeIntoId) {
            throw httpError(`Cannot delete "${existing.name}" while ${usage} record(s) still use it. Merge into another course first.`, 400);
        }
        const merged = await mergeTrainingCourseType({ fromId: id, intoId: options.mergeIntoId });
        return {
            deleted: true,
            certificatesUpdated: merged.certificatesUpdated,
            documentsUpdated: merged.documentsUpdated,
            mergedInto: merged.into,
        };
    }
    await prisma_1.prisma.trainingCourseType.delete({ where: { id } });
    return { deleted: true };
}
