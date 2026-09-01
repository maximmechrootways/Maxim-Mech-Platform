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
    return raw
        .map((item) => {
        if (typeof item === 'string')
            return { userId: item, at: '' };
        if (item && typeof item === 'object' && 'userId' in item) {
            const o = item;
            return { userId: String(o.userId), at: o.at ?? '' };
        }
        return null;
    })
        .filter((x) => x != null);
}
function map(r) {
    return {
        id: r.id,
        title: r.title,
        body: r.body,
        siteNames: Array.isArray(r.siteNames) ? r.siteNames : [],
        roles: Array.isArray(r.roles) ? r.roles : [],
        publishedAt: r.publishedAt?.toISOString?.() ?? undefined,
        expiresAt: r.expiresAt ?? undefined,
        acknowledgedBy: normalizeUserActions(r.acknowledgedBy),
        readBy: normalizeUserActions(r.readBy),
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
    const read = normalizeUserActions(r.readBy);
    if (read.some((x) => x.userId === userId))
        return map(r);
    const updated = await prisma_1.prisma.safetyAlert.update({
        where: { id },
        data: { readBy: [...read, { userId, at: new Date().toISOString() }] },
    });
    return map(updated);
}
async function acknowledgeAlert(id, userId) {
    const r = await prisma_1.prisma.safetyAlert.findUnique({ where: { id } });
    if (!r)
        throw { status: 404, message: 'Alert not found' };
    const ack = normalizeUserActions(r.acknowledgedBy);
    if (ack.some((x) => x.userId === userId))
        return map(r);
    const read = normalizeUserActions(r.readBy);
    const readUpdated = read.some((x) => x.userId === userId)
        ? read
        : [...read, { userId, at: new Date().toISOString() }];
    const updated = await prisma_1.prisma.safetyAlert.update({
        where: { id },
        data: {
            acknowledgedBy: [...ack, { userId, at: new Date().toISOString() }],
            readBy: readUpdated,
        },
    });
    return map(updated);
}
