"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAlerts = listAlerts;
exports.getAlertById = getAlertById;
exports.createAlert = createAlert;
exports.updateAlert = updateAlert;
exports.deleteAlert = deleteAlert;
exports.markAlertRead = markAlertRead;
exports.acknowledgeAlert = acknowledgeAlert;
const prisma_1 = require("../lib/prisma");
const ROLES = ['owner', 'hr'];
function canManage(role) {
    if (!ROLES.includes(role))
        throw { status: 403, message: 'Only Owner or HR can manage alerts' };
}
function normalizeUserActions(raw) {
    if (!Array.isArray(raw))
        return [];
    const seen = new Set();
    const out = [];
    for (const item of raw) {
        let action = null;
        if (typeof item === 'string')
            action = { userId: item, at: '' };
        else if (item && typeof item === 'object' && 'userId' in item) {
            const o = item;
            action = { userId: String(o.userId), at: o.at ?? '' };
        }
        if (!action?.userId || seen.has(action.userId))
            continue;
        seen.add(action.userId);
        out.push(action);
    }
    return out;
}
/** Ensure every acknowledged user also appears in readBy (fixes legacy ack-without-read rows). */
function ensureReadCoversAcknowledgements(readBy, acknowledgedBy) {
    const read = [...readBy];
    const readIds = new Set(read.map((r) => r.userId));
    for (const a of acknowledgedBy) {
        if (readIds.has(a.userId))
            continue;
        read.push({ userId: a.userId, at: a.at || new Date().toISOString() });
        readIds.add(a.userId);
    }
    return read;
}
function map(r) {
    const acknowledgedBy = normalizeUserActions(r.acknowledgedBy);
    const readBy = ensureReadCoversAcknowledgements(normalizeUserActions(r.readBy), acknowledgedBy);
    return {
        id: r.id,
        title: r.title,
        body: r.body,
        siteNames: Array.isArray(r.siteNames) ? r.siteNames : [],
        roles: Array.isArray(r.roles) ? r.roles : [],
        publishedAt: r.publishedAt?.toISOString?.() ?? undefined,
        expiresAt: r.expiresAt ?? undefined,
        acknowledgedBy,
        readBy,
    };
}
async function listAlerts(role, query) {
    const where = {};
    if (query.activeOnly === 'true') {
        where.OR = [{ expiresAt: null }, { expiresAt: { gte: new Date().toISOString().slice(0, 10) } }];
    }
    const list = await prisma_1.prisma.safetyAlert.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
    });
    return list.map(map);
}
async function getAlertById(id) {
    const r = await prisma_1.prisma.safetyAlert.findUnique({ where: { id } });
    if (!r)
        throw { status: 404, message: 'Alert not found' };
    return map(r);
}
async function createAlert(userId, role, data) {
    canManage(role);
    const r = await prisma_1.prisma.safetyAlert.create({
        data: {
            title: (data.title || '').trim(),
            body: (data.body || '').trim(),
            siteNames: Array.isArray(data.siteNames) ? data.siteNames : [],
            roles: Array.isArray(data.roles) ? data.roles : [],
            publishedById: userId,
            expiresAt: data.expiresAt?.trim() || null,
        },
    });
    return map(r);
}
async function updateAlert(id, role, data) {
    canManage(role);
    const existing = await prisma_1.prisma.safetyAlert.findUnique({ where: { id } });
    if (!existing)
        throw { status: 404, message: 'Alert not found' };
    const r = await prisma_1.prisma.safetyAlert.update({
        where: { id },
        data: {
            ...(data.title !== undefined && { title: data.title.trim() }),
            ...(data.body !== undefined && { body: data.body.trim() }),
            ...(data.siteNames !== undefined && { siteNames: Array.isArray(data.siteNames) ? data.siteNames : existing.siteNames }),
            ...(data.roles !== undefined && { roles: Array.isArray(data.roles) ? data.roles : existing.roles }),
            ...(data.expiresAt !== undefined && { expiresAt: data.expiresAt?.trim() || null }),
        },
    });
    return map(r);
}
async function deleteAlert(id, role) {
    canManage(role);
    await prisma_1.prisma.safetyAlert.delete({ where: { id } }).catch(() => {
        throw { status: 404, message: 'Alert not found' };
    });
    return { message: 'Deleted' };
}
async function markAlertRead(id, userId) {
    const r = await prisma_1.prisma.safetyAlert.findUnique({ where: { id } });
    if (!r)
        throw { status: 404, message: 'Alert not found' };
    const ack = normalizeUserActions(r.acknowledgedBy);
    const read = normalizeUserActions(r.readBy);
    if (read.some((x) => x.userId === userId)) {
        const healedRead = ensureReadCoversAcknowledgements(read, ack);
        if (healedRead.length !== read.length) {
            const updated = await prisma_1.prisma.safetyAlert.update({
                where: { id },
                data: { readBy: healedRead, acknowledgedBy: ack },
            });
            return map(updated);
        }
        return map(r);
    }
    const readUpdated = ensureReadCoversAcknowledgements([...read, { userId, at: new Date().toISOString() }], ack);
    const updated = await prisma_1.prisma.safetyAlert.update({
        where: { id },
        data: { readBy: readUpdated, acknowledgedBy: ack },
    });
    return map(updated);
}
async function acknowledgeAlert(id, userId) {
    const r = await prisma_1.prisma.safetyAlert.findUnique({ where: { id } });
    if (!r)
        throw { status: 404, message: 'Alert not found' };
    const ack = normalizeUserActions(r.acknowledgedBy);
    const read = normalizeUserActions(r.readBy);
    if (ack.some((x) => x.userId === userId)) {
        const healedRead = ensureReadCoversAcknowledgements(read, ack);
        if (healedRead.length !== read.length) {
            const updated = await prisma_1.prisma.safetyAlert.update({
                where: { id },
                data: { readBy: healedRead, acknowledgedBy: ack },
            });
            return map(updated);
        }
        return map(r);
    }
    const at = new Date().toISOString();
    const ackUpdated = [...ack, { userId, at }];
    const readUpdated = ensureReadCoversAcknowledgements(read.some((x) => x.userId === userId) ? read : [...read, { userId, at }], ackUpdated);
    const updated = await prisma_1.prisma.safetyAlert.update({
        where: { id },
        data: {
            acknowledgedBy: ackUpdated,
            readBy: readUpdated,
        },
    });
    return map(updated);
}
