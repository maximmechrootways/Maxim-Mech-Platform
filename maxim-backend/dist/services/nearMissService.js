"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildNearMissSummaryPdfBuffer = buildNearMissSummaryPdfBuffer;
exports.getNearMissPdfBuffer = getNearMissPdfBuffer;
exports.listNearMisses = listNearMisses;
exports.getNearMissById = getNearMissById;
exports.createNearMiss = createNearMiss;
exports.updateNearMiss = updateNearMiss;
exports.deleteNearMiss = deleteNearMiss;
const prisma_1 = require("../lib/prisma");
const pdf_lib_1 = require("pdf-lib");
const jobService = __importStar(require("./jobService"));
const ROLES = ['owner', 'hr', 'supervisor'];
function canAccess(role) {
    if (!ROLES.includes(role))
        throw { status: 403, message: 'Insufficient role for near-miss reports' };
}
function isOwnerOrHr(role) {
    return role === 'owner' || role === 'hr';
}
const WIN_ANSI_REPLACEMENTS = {
    '–': '-',
    '—': '-',
    '−': '-',
    '…': '...',
    '•': '*',
};
function toWinAnsiSafeText(value) {
    const raw = String(value ?? '');
    const replaced = raw.replace(/[–—−…•]/g, (char) => WIN_ANSI_REPLACEMENTS[char] ?? char);
    const normalized = replaced.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    return normalized.replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '?');
}
function wrapPdfText(text, maxWidth, font, fontSize) {
    const raw = toWinAnsiSafeText(text).replace(/\r/g, '');
    const inputLines = raw.split('\n');
    const output = [];
    for (const line of inputLines) {
        const words = line.split(/\s+/).filter(Boolean);
        if (words.length === 0) {
            output.push('');
            continue;
        }
        let current = words[0];
        for (let i = 1; i < words.length; i++) {
            const next = `${current} ${words[i]}`;
            if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
                current = next;
            }
            else {
                output.push(current);
                current = words[i];
            }
        }
        output.push(current);
    }
    return output;
}
async function buildNearMissSummaryPdfBuffer(record) {
    const doc = await pdf_lib_1.PDFDocument.create();
    const regular = await doc.embedFont(pdf_lib_1.StandardFonts.Helvetica);
    const bold = await doc.embedFont(pdf_lib_1.StandardFonts.HelveticaBold);
    const margin = 40;
    const titleSize = 14;
    const textSize = 11;
    const lineHeight = 16;
    let page = doc.addPage();
    let { width, height } = page.getSize();
    let y = height - margin;
    const ensureSpace = (needed = lineHeight) => {
        if (y - needed < margin) {
            page = doc.addPage();
            ({ width, height } = page.getSize());
            y = height - margin;
        }
    };
    const drawLine = (line, options) => {
        const size = options?.size ?? textSize;
        ensureSpace(lineHeight + 2);
        page.drawText(toWinAnsiSafeText(line), {
            x: margin,
            y,
            size,
            font: options?.isBold ? bold : regular,
        });
        y -= lineHeight;
    };
    const drawParagraph = (label, text) => {
        drawLine(label, { isBold: true });
        const lines = wrapPdfText(text || '—', width - margin * 2, regular, textSize);
        for (const line of lines)
            drawLine(line);
        y -= 4;
    };
    drawLine('Near Miss Report', { isBold: true, size: titleSize });
    drawLine(`Site: ${record.siteName ?? '—'}`);
    drawLine(`Reported by: ${record.reportedBy ?? '—'}`);
    drawLine(`Reported at: ${record.reportedAt ? new Date(record.reportedAt).toLocaleString() : '—'}`);
    drawLine(`Status: ${record.status ?? 'open'}`);
    y -= 4;
    drawParagraph('Description:', record.description ?? '—');
    if (record.correctiveAction) {
        drawParagraph('Corrective action to be taken:', record.correctiveAction);
    }
    if (record.correctiveActionDate) {
        drawLine(`Date of corrective action: ${new Date(record.correctiveActionDate).toLocaleDateString()}`);
    }
    if (record.reportCompletedBy) {
        drawLine(`Report completed by: ${record.reportCompletedBy}`);
    }
    if (record.followUpNotes) {
        drawParagraph('Follow-up notes:', record.followUpNotes);
    }
    const bytes = await doc.save();
    return Buffer.from(bytes);
}
async function getNearMissPdfBuffer(id, userId, role) {
    canAccess(role);
    const r = await prisma_1.prisma.nearMiss.findUnique({ where: { id } });
    if (!r)
        throw { status: 404, message: 'Near-miss report not found' };
    if (!isOwnerOrHr(role)) {
        if (role === 'supervisor') {
            const labourerIds = await jobService.getLabourerIdsSupervisedBy(userId);
            const canView = r.reportedById === userId || (r.reportedById != null && labourerIds.includes(r.reportedById));
            if (!canView)
                throw { status: 403, message: 'Forbidden' };
        }
        else if (r.reportedById !== userId) {
            throw { status: 403, message: 'Forbidden' };
        }
    }
    return buildNearMissSummaryPdfBuffer(r);
}
function map(r) {
    return {
        id: r.id,
        siteId: r.siteId ?? undefined,
        siteName: r.siteName,
        reportedBy: r.reportedBy,
        reportedById: r.reportedById ?? undefined,
        reportedAt: r.reportedAt?.toISOString?.() ?? undefined,
        description: r.description,
        status: r.status,
        followUpNotes: r.followUpNotes ?? undefined,
        correctiveAction: r.correctiveAction ?? undefined,
        correctiveActionDate: r.correctiveActionDate?.toISOString?.() ?? undefined,
        reportCompletedBy: r.reportCompletedBy ?? undefined,
    };
}
async function listNearMisses(role, query) {
    canAccess(role);
    const where = {};
    if (query.status)
        where.status = query.status;
    if (query.siteId)
        where.siteId = query.siteId;
    const list = await prisma_1.prisma.nearMiss.findMany({
        where,
        orderBy: { reportedAt: 'desc' },
    });
    return list.map(map);
}
async function getNearMissById(id, role) {
    canAccess(role);
    const r = await prisma_1.prisma.nearMiss.findUnique({ where: { id } });
    if (!r)
        throw { status: 404, message: 'Near-miss report not found' };
    return map(r);
}
async function createNearMiss(userId, role, userName, data) {
    canAccess(role);
    const correctiveActionDate = data.correctiveActionDate != null && String(data.correctiveActionDate).trim() !== ''
        ? new Date(data.correctiveActionDate)
        : null;
    const r = await prisma_1.prisma.nearMiss.create({
        data: {
            siteId: data.siteId?.trim() || null,
            siteName: (data.siteName || '').trim(),
            reportedBy: data.reportedBy?.trim() || userName,
            reportedById: userId,
            description: (data.description || '').trim(),
            status: data.status || 'open',
            followUpNotes: data.followUpNotes?.trim() || null,
            correctiveAction: data.correctiveAction?.trim() || null,
            correctiveActionDate: Number.isNaN(correctiveActionDate?.getTime()) ? null : correctiveActionDate,
            reportCompletedBy: data.reportCompletedBy?.trim() || null,
        },
    });
    return map(r);
}
async function updateNearMiss(id, role, data) {
    canAccess(role);
    const existing = await prisma_1.prisma.nearMiss.findUnique({ where: { id } });
    if (!existing)
        throw { status: 404, message: 'Near-miss report not found' };
    let correctiveActionDateUpdate;
    if (data.correctiveActionDate !== undefined) {
        if (data.correctiveActionDate == null || String(data.correctiveActionDate).trim() === '') {
            correctiveActionDateUpdate = null;
        }
        else {
            const d = new Date(data.correctiveActionDate);
            correctiveActionDateUpdate = Number.isNaN(d.getTime()) ? null : d;
        }
    }
    const r = await prisma_1.prisma.nearMiss.update({
        where: { id },
        data: {
            ...(data.siteName !== undefined && { siteName: data.siteName.trim() }),
            ...(data.siteId !== undefined && { siteId: data.siteId?.trim() || null }),
            ...(data.reportedBy !== undefined && { reportedBy: data.reportedBy.trim() }),
            ...(data.description !== undefined && { description: data.description.trim() }),
            ...(data.status !== undefined && { status: data.status }),
            ...(data.followUpNotes !== undefined && { followUpNotes: data.followUpNotes?.trim() || null }),
            ...(data.correctiveAction !== undefined && { correctiveAction: data.correctiveAction?.trim() || null }),
            ...(correctiveActionDateUpdate !== undefined && { correctiveActionDate: correctiveActionDateUpdate }),
            ...(data.reportCompletedBy !== undefined && { reportCompletedBy: data.reportCompletedBy?.trim() || null }),
        },
    });
    return map(r);
}
async function deleteNearMiss(id, role) {
    canAccess(role);
    await prisma_1.prisma.nearMiss.delete({ where: { id } }).catch(() => {
        throw { status: 404, message: 'Near-miss report not found' };
    });
    return { message: 'Deleted' };
}
