"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listEquipment = listEquipment;
exports.getEquipmentById = getEquipmentById;
exports.createEquipment = createEquipment;
exports.updateEquipment = updateEquipment;
exports.deleteEquipment = deleteEquipment;
exports.addMaintenanceRecord = addMaintenanceRecord;
exports.updateMaintenanceRecord = updateMaintenanceRecord;
exports.deleteMaintenanceRecord = deleteMaintenanceRecord;
exports.addCostEntry = addCostEntry;
exports.updateCostEntry = updateCostEntry;
exports.uploadCostInvoice = uploadCostInvoice;
exports.deleteCostEntry = deleteCostEntry;
exports.addInsurance = addInsurance;
exports.updateInsurance = updateInsurance;
exports.uploadInsurancePolicy = uploadInsurancePolicy;
exports.deleteInsurance = deleteInsurance;
exports.addInspectionSubmission = addInspectionSubmission;
exports.removeInspectionSubmission = removeInspectionSubmission;
const client_1 = require("@prisma/client");
const prisma_1 = require("../lib/prisma");
const blobStorageService_1 = require("./blobStorageService");
const SCHEDULES = new Set(['daily', 'weekly', 'monthly', 'quarterly', 'annual', 'before_use']);
function assertRole(role) {
    if (!['owner', 'hr', 'supervisor'].includes(role)) {
        const err = { status: 403, message: 'Forbidden' };
        throw err;
    }
}
function dec(v) {
    if (v === undefined)
        return undefined;
    if (v === null)
        return null;
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n))
        return null;
    return new client_1.Prisma.Decimal(n);
}
function serializeEquipment(e) {
    if (!e)
        return e;
    if (e.costAtPurchase != null)
        e.costAtPurchase = Number(e.costAtPurchase);
    return e;
}
function serializeNested(rec) {
    for (const k of ['hoursAtLastMaintenance', 'mileage', 'labourCost', 'materialCost', 'totalCost', 'costAtPurchase']) {
        if (rec[k] != null)
            rec[k] = Number(rec[k]);
    }
    return rec;
}
async function listEquipment(_userId, role) {
    assertRole(role);
    const rows = await prisma_1.prisma.equipment.findMany({
        orderBy: { name: 'asc' },
        include: { site: { select: { id: true, name: true } } },
    });
    return rows.map((r) => serializeEquipment(r));
}
async function getEquipmentById(id, role) {
    assertRole(role);
    const e = await prisma_1.prisma.equipment.findUnique({
        where: { id },
        include: {
            site: { select: { id: true, name: true, address: true } },
            maintenanceRecords: { orderBy: { dateMaintenanceRequired: 'desc' } },
            costEntries: { orderBy: { createdAt: 'desc' } },
            insurancePolicies: { orderBy: { createdAt: 'desc' } },
        },
    });
    if (!e) {
        const err = { status: 404, message: 'Equipment not found' };
        throw err;
    }
    const out = serializeEquipment(e);
    out.maintenanceRecords = e.maintenanceRecords.map((m) => serializeNested({ ...m }));
    out.costEntries = e.costEntries.map((c) => serializeNested({ ...c }));
    return out;
}
async function createEquipment(role, data) {
    assertRole(role);
    const name = (data.name || '').trim();
    if (!name) {
        const err = { status: 400, message: 'Name is required' };
        throw err;
    }
    const maintenanceSchedule = (data.maintenanceSchedule || 'monthly').toLowerCase();
    if (!SCHEDULES.has(maintenanceSchedule)) {
        const err = { status: 400, message: 'Invalid maintenance schedule' };
        throw err;
    }
    const siteIdTrimmed = data.siteId?.trim() || null;
    if (siteIdTrimmed) {
        const site = await prisma_1.prisma.site.findFirst({
            where: { id: siteIdTrimmed, active: true },
            select: { id: true },
        });
        if (!site) {
            const err = {
                status: 400,
                message: 'Choose a valid job site from the list.',
            };
            throw err;
        }
    }
    let dateOfPurchase = null;
    if (data.dateOfPurchase) {
        const d = new Date(data.dateOfPurchase);
        if (!Number.isNaN(d.getTime()))
            dateOfPurchase = d;
    }
    const created = await prisma_1.prisma.equipment.create({
        data: {
            name,
            modelNumber: data.modelNumber?.trim() || null,
            serialNumber: data.serialNumber?.trim() || null,
            tag: data.tag?.trim() || null,
            manufacturer: data.manufacturer?.trim() || null,
            siteId: siteIdTrimmed,
            maintenanceSchedule,
            costAtPurchase: dec(data.costAtPurchase) ?? null,
            dateOfPurchase,
        },
        include: { site: { select: { id: true, name: true } } },
    });
    return serializeEquipment(created);
}
async function updateEquipment(id, role, data) {
    assertRole(role);
    const existing = await prisma_1.prisma.equipment.findUnique({ where: { id } });
    if (!existing) {
        const err = { status: 404, message: 'Equipment not found' };
        throw err;
    }
    const patch = {};
    if (data.name !== undefined)
        patch.name = data.name.trim();
    if (data.modelNumber !== undefined)
        patch.modelNumber = data.modelNumber?.trim() || null;
    if (data.serialNumber !== undefined)
        patch.serialNumber = data.serialNumber?.trim() || null;
    if (data.tag !== undefined)
        patch.tag = data.tag?.trim() || null;
    if (data.manufacturer !== undefined)
        patch.manufacturer = data.manufacturer?.trim() || null;
    if (data.siteId !== undefined)
        patch.site = data.siteId ? { connect: { id: data.siteId } } : { disconnect: true };
    if (data.maintenanceSchedule !== undefined) {
        const m = data.maintenanceSchedule.toLowerCase();
        if (!SCHEDULES.has(m)) {
            const err = { status: 400, message: 'Invalid maintenance schedule' };
            throw err;
        }
        patch.maintenanceSchedule = m;
    }
    if (data.costAtPurchase !== undefined)
        patch.costAtPurchase = dec(data.costAtPurchase) ?? null;
    if (data.dateOfPurchase !== undefined) {
        patch.dateOfPurchase =
            data.dateOfPurchase && data.dateOfPurchase.trim()
                ? new Date(data.dateOfPurchase)
                : null;
    }
    if (data.inspectionSubmissionIds !== undefined) {
        patch.inspectionSubmissionIds = data.inspectionSubmissionIds;
    }
    const updated = await prisma_1.prisma.equipment.update({
        where: { id },
        data: patch,
        include: { site: { select: { id: true, name: true } } },
    });
    return serializeEquipment(updated);
}
async function deleteEquipment(id, role) {
    assertRole(role);
    const e = await prisma_1.prisma.equipment.findUnique({
        where: { id },
        include: { costEntries: true, insurancePolicies: true },
    });
    if (!e) {
        const err = { status: 404, message: 'Equipment not found' };
        throw err;
    }
    for (const c of e.costEntries) {
        if (c.invoiceFilePath)
            await (0, blobStorageService_1.deleteBlob)(c.invoiceFilePath).catch(() => { });
    }
    for (const i of e.insurancePolicies) {
        if (i.policyFilePath)
            await (0, blobStorageService_1.deleteBlob)(i.policyFilePath).catch(() => { });
    }
    await prisma_1.prisma.equipment.delete({ where: { id } });
}
// --- Maintenance records ---
async function addMaintenanceRecord(equipmentId, role, data) {
    assertRole(role);
    const eq = await prisma_1.prisma.equipment.findUnique({ where: { id: equipmentId } });
    if (!eq) {
        const err = { status: 404, message: 'Equipment not found' };
        throw err;
    }
    let dateMaintenanceRequired = null;
    if (data.dateMaintenanceRequired) {
        const d = new Date(data.dateMaintenanceRequired);
        if (!Number.isNaN(d.getTime()))
            dateMaintenanceRequired = d;
    }
    const row = await prisma_1.prisma.equipmentMaintenanceRecord.create({
        data: {
            equipmentId,
            hoursAtLastMaintenance: dec(data.hoursAtLastMaintenance) ?? null,
            mileage: dec(data.mileage) ?? null,
            descriptionOfWork: data.descriptionOfWork?.trim() || null,
            partsReplacedOrRepaired: data.partsReplacedOrRepaired?.trim() || null,
            technicianNameOrNumber: data.technicianNameOrNumber?.trim() || null,
            maintenanceCompany: data.maintenanceCompany?.trim() || null,
            dateMaintenanceRequired,
        },
    });
    return serializeNested(row);
}
async function updateMaintenanceRecord(equipmentId, recordId, role, data) {
    assertRole(role);
    const row = await prisma_1.prisma.equipmentMaintenanceRecord.findFirst({
        where: { id: recordId, equipmentId },
    });
    if (!row) {
        const err = { status: 404, message: 'Record not found' };
        throw err;
    }
    const patch = {};
    if (data.hoursAtLastMaintenance !== undefined)
        patch.hoursAtLastMaintenance = dec(data.hoursAtLastMaintenance) ?? null;
    if (data.mileage !== undefined)
        patch.mileage = dec(data.mileage) ?? null;
    if (data.descriptionOfWork !== undefined)
        patch.descriptionOfWork = data.descriptionOfWork?.trim() || null;
    if (data.partsReplacedOrRepaired !== undefined)
        patch.partsReplacedOrRepaired = data.partsReplacedOrRepaired?.trim() || null;
    if (data.technicianNameOrNumber !== undefined)
        patch.technicianNameOrNumber = data.technicianNameOrNumber?.trim() || null;
    if (data.maintenanceCompany !== undefined)
        patch.maintenanceCompany = data.maintenanceCompany?.trim() || null;
    if (data.dateMaintenanceRequired !== undefined) {
        patch.dateMaintenanceRequired =
            data.dateMaintenanceRequired && data.dateMaintenanceRequired.trim()
                ? new Date(data.dateMaintenanceRequired)
                : null;
    }
    const updated = await prisma_1.prisma.equipmentMaintenanceRecord.update({
        where: { id: recordId },
        data: patch,
    });
    return serializeNested(updated);
}
async function deleteMaintenanceRecord(equipmentId, recordId, role) {
    assertRole(role);
    const row = await prisma_1.prisma.equipmentMaintenanceRecord.findFirst({
        where: { id: recordId, equipmentId },
    });
    if (!row) {
        const err = { status: 404, message: 'Record not found' };
        throw err;
    }
    await prisma_1.prisma.equipmentMaintenanceRecord.delete({ where: { id: recordId } });
}
// --- Cost entries ---
async function addCostEntry(equipmentId, role, data) {
    assertRole(role);
    const eq = await prisma_1.prisma.equipment.findUnique({ where: { id: equipmentId } });
    if (!eq) {
        const err = { status: 404, message: 'Equipment not found' };
        throw err;
    }
    const row = await prisma_1.prisma.equipmentCostEntry.create({
        data: {
            equipmentId,
            maintenancePerformed: data.maintenancePerformed?.trim() || null,
            labourCost: dec(data.labourCost) ?? null,
            materialCost: dec(data.materialCost) ?? null,
            warrantyCovered: data.warrantyCovered ?? false,
            totalCost: dec(data.totalCost) ?? null,
        },
    });
    return serializeNested(row);
}
async function updateCostEntry(equipmentId, costId, role, data) {
    assertRole(role);
    const row = await prisma_1.prisma.equipmentCostEntry.findFirst({ where: { id: costId, equipmentId } });
    if (!row) {
        const err = { status: 404, message: 'Record not found' };
        throw err;
    }
    const patch = {};
    if (data.maintenancePerformed !== undefined)
        patch.maintenancePerformed = data.maintenancePerformed?.trim() || null;
    if (data.labourCost !== undefined)
        patch.labourCost = dec(data.labourCost) ?? null;
    if (data.materialCost !== undefined)
        patch.materialCost = dec(data.materialCost) ?? null;
    if (data.warrantyCovered !== undefined)
        patch.warrantyCovered = data.warrantyCovered;
    if (data.totalCost !== undefined)
        patch.totalCost = dec(data.totalCost) ?? null;
    const updated = await prisma_1.prisma.equipmentCostEntry.update({ where: { id: costId }, data: patch });
    return serializeNested(updated);
}
async function uploadCostInvoice(equipmentId, costId, role, file) {
    assertRole(role);
    const row = await prisma_1.prisma.equipmentCostEntry.findFirst({ where: { id: costId, equipmentId } });
    if (!row) {
        const err = { status: 404, message: 'Record not found' };
        throw err;
    }
    const blobName = await (0, blobStorageService_1.uploadBlob)(file.path, 'equipment');
    if (row.invoiceFilePath)
        await (0, blobStorageService_1.deleteBlob)(row.invoiceFilePath).catch(() => { });
    const updated = await prisma_1.prisma.equipmentCostEntry.update({
        where: { id: costId },
        data: {
            invoiceFilePath: blobName,
            invoiceOriginalName: file.originalname,
            invoiceMimeType: file.mimetype,
        },
    });
    return serializeNested(updated);
}
async function deleteCostEntry(equipmentId, costId, role) {
    assertRole(role);
    const row = await prisma_1.prisma.equipmentCostEntry.findFirst({ where: { id: costId, equipmentId } });
    if (!row) {
        const err = { status: 404, message: 'Record not found' };
        throw err;
    }
    if (row.invoiceFilePath)
        await (0, blobStorageService_1.deleteBlob)(row.invoiceFilePath).catch(() => { });
    await prisma_1.prisma.equipmentCostEntry.delete({ where: { id: costId } });
}
// --- Insurance ---
async function addInsurance(equipmentId, role, data) {
    assertRole(role);
    const eq = await prisma_1.prisma.equipment.findUnique({ where: { id: equipmentId } });
    if (!eq) {
        const err = { status: 404, message: 'Equipment not found' };
        throw err;
    }
    const row = await prisma_1.prisma.equipmentInsurance.create({
        data: {
            equipmentId,
            policyOrCertificate: data.policyOrCertificate?.trim() || null,
            expiryDate: data.expiryDate?.trim() || null,
        },
    });
    return row;
}
async function updateInsurance(equipmentId, insuranceId, role, data) {
    assertRole(role);
    const row = await prisma_1.prisma.equipmentInsurance.findFirst({
        where: { id: insuranceId, equipmentId },
    });
    if (!row) {
        const err = { status: 404, message: 'Not found' };
        throw err;
    }
    const patch = {};
    if (data.policyOrCertificate !== undefined)
        patch.policyOrCertificate = data.policyOrCertificate?.trim() || null;
    if (data.expiryDate !== undefined)
        patch.expiryDate = data.expiryDate?.trim() || null;
    return prisma_1.prisma.equipmentInsurance.update({ where: { id: insuranceId }, data: patch });
}
async function uploadInsurancePolicy(equipmentId, insuranceId, role, file) {
    assertRole(role);
    const row = await prisma_1.prisma.equipmentInsurance.findFirst({
        where: { id: insuranceId, equipmentId },
    });
    if (!row) {
        const err = { status: 404, message: 'Not found' };
        throw err;
    }
    const blobName = await (0, blobStorageService_1.uploadBlob)(file.path, 'equipment');
    if (row.policyFilePath)
        await (0, blobStorageService_1.deleteBlob)(row.policyFilePath).catch(() => { });
    return prisma_1.prisma.equipmentInsurance.update({
        where: { id: insuranceId },
        data: {
            policyFilePath: blobName,
            policyOriginalName: file.originalname,
            policyMimeType: file.mimetype,
        },
    });
}
async function deleteInsurance(equipmentId, insuranceId, role) {
    assertRole(role);
    const row = await prisma_1.prisma.equipmentInsurance.findFirst({
        where: { id: insuranceId, equipmentId },
    });
    if (!row) {
        const err = { status: 404, message: 'Not found' };
        throw err;
    }
    if (row.policyFilePath)
        await (0, blobStorageService_1.deleteBlob)(row.policyFilePath).catch(() => { });
    await prisma_1.prisma.equipmentInsurance.delete({ where: { id: insuranceId } });
}
// --- Inspection submission links ---
async function addInspectionSubmission(equipmentId, role, submissionId) {
    assertRole(role);
    const eq = await prisma_1.prisma.equipment.findUnique({ where: { id: equipmentId } });
    if (!eq) {
        const err = { status: 404, message: 'Equipment not found' };
        throw err;
    }
    const sid = submissionId.trim();
    if (!sid) {
        const err = { status: 400, message: 'submissionId required' };
        throw err;
    }
    if (eq.inspectionSubmissionIds.includes(sid))
        return getEquipmentById(equipmentId, role);
    await prisma_1.prisma.equipment.update({
        where: { id: equipmentId },
        data: { inspectionSubmissionIds: [...eq.inspectionSubmissionIds, sid] },
    });
    return getEquipmentById(equipmentId, role);
}
async function removeInspectionSubmission(equipmentId, role, submissionId) {
    assertRole(role);
    const eq = await prisma_1.prisma.equipment.findUnique({ where: { id: equipmentId } });
    if (!eq) {
        const err = { status: 404, message: 'Equipment not found' };
        throw err;
    }
    const next = eq.inspectionSubmissionIds.filter((id) => id !== submissionId);
    await prisma_1.prisma.equipment.update({
        where: { id: equipmentId },
        data: { inspectionSubmissionIds: { set: next } },
    });
    return getEquipmentById(equipmentId, role);
}
