import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { deleteBlob, uploadBlob } from './blobStorageService'

const SCHEDULES = new Set(['daily', 'weekly', 'monthly', 'quarterly', 'annual', 'before_use'])

function assertRole(role: string) {
    if (!['owner', 'hr', 'supervisor'].includes(role)) {
        const err: { status: number; message: string } = { status: 403, message: 'Forbidden' }
        throw err
    }
}

function dec(v: unknown): Prisma.Decimal | null | undefined {
    if (v === undefined) return undefined
    if (v === null) return null
    const n = typeof v === 'number' ? v : Number(v)
    if (!Number.isFinite(n)) return null
    return new Prisma.Decimal(n)
}

function serializeEquipment(e: Record<string, unknown> | null) {
    if (!e) return e
    if (e.costAtPurchase != null) e.costAtPurchase = Number(e.costAtPurchase as Prisma.Decimal)
    return e
}

function serializeNested(rec: Record<string, unknown>) {
    for (const k of ['hoursAtLastMaintenance', 'mileage', 'labourCost', 'materialCost', 'totalCost', 'costAtPurchase']) {
        if (rec[k] != null) rec[k] = Number(rec[k] as Prisma.Decimal)
    }
    return rec
}

export async function listEquipment(_userId: string, role: string) {
    assertRole(role)
    const rows = await prisma.equipment.findMany({
        orderBy: { name: 'asc' },
        include: { site: { select: { id: true, name: true } } },
    })
    return rows.map((r) => serializeEquipment(r as any) as typeof r)
}

export async function getEquipmentById(id: string, role: string) {
    assertRole(role)
    const e = await prisma.equipment.findUnique({
        where: { id },
        include: {
            site: { select: { id: true, name: true, address: true } },
            maintenanceRecords: { orderBy: { dateMaintenanceRequired: 'desc' } },
            costEntries: { orderBy: { createdAt: 'desc' } },
            insurancePolicies: { orderBy: { createdAt: 'desc' } },
        },
    })
    if (!e) {
        const err: { status: number; message: string } = { status: 404, message: 'Equipment not found' }
        throw err
    }
    const out = serializeEquipment(e as any) as Record<string, unknown>
    out.maintenanceRecords = (e.maintenanceRecords as any[]).map((m) => serializeNested({ ...m }))
    out.costEntries = (e.costEntries as any[]).map((c) => serializeNested({ ...c }))
    return out
}

export async function createEquipment(
    role: string,
    data: {
        name: string
        modelNumber?: string | null
        serialNumber?: string | null
        tag?: string | null
        manufacturer?: string | null
        siteId?: string | null
        maintenanceSchedule?: string
        costAtPurchase?: number | null
        dateOfPurchase?: string | null
    }
) {
    assertRole(role)
    const name = (data.name || '').trim()
    if (!name) {
        const err: { status: number; message: string } = { status: 400, message: 'Name is required' }
        throw err
    }
    const maintenanceSchedule = (data.maintenanceSchedule || 'monthly').toLowerCase()
    if (!SCHEDULES.has(maintenanceSchedule)) {
        const err: { status: number; message: string } = { status: 400, message: 'Invalid maintenance schedule' }
        throw err
    }
    const siteIdTrimmed = data.siteId?.trim() || null
    if (siteIdTrimmed) {
        const site = await prisma.site.findFirst({
            where: { id: siteIdTrimmed, active: true },
            select: { id: true },
        })
        if (!site) {
            const err: { status: number; message: string } = {
                status: 400,
                message: 'Choose a valid job site from the list.',
            }
            throw err
        }
    }
    let dateOfPurchase: Date | null = null
    if (data.dateOfPurchase) {
        const d = new Date(data.dateOfPurchase)
        if (!Number.isNaN(d.getTime())) dateOfPurchase = d
    }
    const created = await prisma.equipment.create({
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
    })
    return serializeEquipment(created as any)
}

export async function updateEquipment(
    id: string,
    role: string,
    data: Partial<{
        name: string
        modelNumber: string | null
        serialNumber: string | null
        tag: string | null
        manufacturer: string | null
        siteId: string | null
        maintenanceSchedule: string
        costAtPurchase: number | null
        dateOfPurchase: string | null
        inspectionSubmissionIds: string[]
    }>
) {
    assertRole(role)
    const existing = await prisma.equipment.findUnique({ where: { id } })
    if (!existing) {
        const err: { status: number; message: string } = { status: 404, message: 'Equipment not found' }
        throw err
    }
    const patch: Prisma.EquipmentUpdateInput = {}
    if (data.name !== undefined) patch.name = data.name.trim()
    if (data.modelNumber !== undefined) patch.modelNumber = data.modelNumber?.trim() || null
    if (data.serialNumber !== undefined) patch.serialNumber = data.serialNumber?.trim() || null
    if (data.tag !== undefined) patch.tag = data.tag?.trim() || null
    if (data.manufacturer !== undefined) patch.manufacturer = data.manufacturer?.trim() || null
    if (data.siteId !== undefined) patch.site = data.siteId ? { connect: { id: data.siteId } } : { disconnect: true }
    if (data.maintenanceSchedule !== undefined) {
        const m = data.maintenanceSchedule.toLowerCase()
        if (!SCHEDULES.has(m)) {
            const err: { status: number; message: string } = { status: 400, message: 'Invalid maintenance schedule' }
            throw err
        }
        patch.maintenanceSchedule = m
    }
    if (data.costAtPurchase !== undefined) patch.costAtPurchase = dec(data.costAtPurchase) ?? null
    if (data.dateOfPurchase !== undefined) {
        patch.dateOfPurchase =
            data.dateOfPurchase && data.dateOfPurchase.trim()
                ? new Date(data.dateOfPurchase)
                : null
    }
    if (data.inspectionSubmissionIds !== undefined) {
        patch.inspectionSubmissionIds = data.inspectionSubmissionIds
    }
    const updated = await prisma.equipment.update({
        where: { id },
        data: patch,
        include: { site: { select: { id: true, name: true } } },
    })
    return serializeEquipment(updated as any)
}

export async function deleteEquipment(id: string, role: string) {
    assertRole(role)
    const e = await prisma.equipment.findUnique({
        where: { id },
        include: { costEntries: true, insurancePolicies: true },
    })
    if (!e) {
        const err: { status: number; message: string } = { status: 404, message: 'Equipment not found' }
        throw err
    }
    for (const c of e.costEntries) {
        if (c.invoiceFilePath) await deleteBlob(c.invoiceFilePath).catch(() => {})
    }
    for (const i of e.insurancePolicies) {
        if (i.policyFilePath) await deleteBlob(i.policyFilePath).catch(() => {})
    }
    await prisma.equipment.delete({ where: { id } })
}

// --- Maintenance records ---

export async function addMaintenanceRecord(
    equipmentId: string,
    role: string,
    data: {
        hoursAtLastMaintenance?: number | null
        mileage?: number | null
        descriptionOfWork?: string | null
        partsReplacedOrRepaired?: string | null
        technicianNameOrNumber?: string | null
        maintenanceCompany?: string | null
        dateMaintenanceRequired?: string | null
    }
) {
    assertRole(role)
    const eq = await prisma.equipment.findUnique({ where: { id: equipmentId } })
    if (!eq) {
        const err: { status: number; message: string } = { status: 404, message: 'Equipment not found' }
        throw err
    }
    let dateMaintenanceRequired: Date | null = null
    if (data.dateMaintenanceRequired) {
        const d = new Date(data.dateMaintenanceRequired)
        if (!Number.isNaN(d.getTime())) dateMaintenanceRequired = d
    }
    const row = await prisma.equipmentMaintenanceRecord.create({
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
    })
    return serializeNested(row as any)
}

export async function updateMaintenanceRecord(
    equipmentId: string,
    recordId: string,
    role: string,
    data: Partial<{
        hoursAtLastMaintenance: number | null
        mileage: number | null
        descriptionOfWork: string | null
        partsReplacedOrRepaired: string | null
        technicianNameOrNumber: string | null
        maintenanceCompany: string | null
        dateMaintenanceRequired: string | null
    }>
) {
    assertRole(role)
    const row = await prisma.equipmentMaintenanceRecord.findFirst({
        where: { id: recordId, equipmentId },
    })
    if (!row) {
        const err: { status: number; message: string } = { status: 404, message: 'Record not found' }
        throw err
    }
    const patch: Prisma.EquipmentMaintenanceRecordUpdateInput = {}
    if (data.hoursAtLastMaintenance !== undefined) patch.hoursAtLastMaintenance = dec(data.hoursAtLastMaintenance) ?? null
    if (data.mileage !== undefined) patch.mileage = dec(data.mileage) ?? null
    if (data.descriptionOfWork !== undefined) patch.descriptionOfWork = data.descriptionOfWork?.trim() || null
    if (data.partsReplacedOrRepaired !== undefined) patch.partsReplacedOrRepaired = data.partsReplacedOrRepaired?.trim() || null
    if (data.technicianNameOrNumber !== undefined) patch.technicianNameOrNumber = data.technicianNameOrNumber?.trim() || null
    if (data.maintenanceCompany !== undefined) patch.maintenanceCompany = data.maintenanceCompany?.trim() || null
    if (data.dateMaintenanceRequired !== undefined) {
        patch.dateMaintenanceRequired =
            data.dateMaintenanceRequired && data.dateMaintenanceRequired.trim()
                ? new Date(data.dateMaintenanceRequired)
                : null
    }
    const updated = await prisma.equipmentMaintenanceRecord.update({
        where: { id: recordId },
        data: patch,
    })
    return serializeNested(updated as any)
}

export async function deleteMaintenanceRecord(equipmentId: string, recordId: string, role: string) {
    assertRole(role)
    const row = await prisma.equipmentMaintenanceRecord.findFirst({
        where: { id: recordId, equipmentId },
    })
    if (!row) {
        const err: { status: number; message: string } = { status: 404, message: 'Record not found' }
        throw err
    }
    await prisma.equipmentMaintenanceRecord.delete({ where: { id: recordId } })
}

// --- Cost entries ---

export async function addCostEntry(
    equipmentId: string,
    role: string,
    data: {
        maintenancePerformed?: string | null
        labourCost?: number | null
        materialCost?: number | null
        warrantyCovered?: boolean
        totalCost?: number | null
    }
) {
    assertRole(role)
    const eq = await prisma.equipment.findUnique({ where: { id: equipmentId } })
    if (!eq) {
        const err: { status: number; message: string } = { status: 404, message: 'Equipment not found' }
        throw err
    }
    const row = await prisma.equipmentCostEntry.create({
        data: {
            equipmentId,
            maintenancePerformed: data.maintenancePerformed?.trim() || null,
            labourCost: dec(data.labourCost) ?? null,
            materialCost: dec(data.materialCost) ?? null,
            warrantyCovered: data.warrantyCovered ?? false,
            totalCost: dec(data.totalCost) ?? null,
        },
    })
    return serializeNested(row as any)
}

export async function updateCostEntry(
    equipmentId: string,
    costId: string,
    role: string,
    data: Partial<{
        maintenancePerformed: string | null
        labourCost: number | null
        materialCost: number | null
        warrantyCovered: boolean
        totalCost: number | null
    }>
) {
    assertRole(role)
    const row = await prisma.equipmentCostEntry.findFirst({ where: { id: costId, equipmentId } })
    if (!row) {
        const err: { status: number; message: string } = { status: 404, message: 'Record not found' }
        throw err
    }
    const patch: Prisma.EquipmentCostEntryUpdateInput = {}
    if (data.maintenancePerformed !== undefined) patch.maintenancePerformed = data.maintenancePerformed?.trim() || null
    if (data.labourCost !== undefined) patch.labourCost = dec(data.labourCost) ?? null
    if (data.materialCost !== undefined) patch.materialCost = dec(data.materialCost) ?? null
    if (data.warrantyCovered !== undefined) patch.warrantyCovered = data.warrantyCovered
    if (data.totalCost !== undefined) patch.totalCost = dec(data.totalCost) ?? null
    const updated = await prisma.equipmentCostEntry.update({ where: { id: costId }, data: patch })
    return serializeNested(updated as any)
}

export async function uploadCostInvoice(
    equipmentId: string,
    costId: string,
    role: string,
    file: { path: string; originalname: string; mimetype: string }
) {
    assertRole(role)
    const row = await prisma.equipmentCostEntry.findFirst({ where: { id: costId, equipmentId } })
    if (!row) {
        const err: { status: number; message: string } = { status: 404, message: 'Record not found' }
        throw err
    }
    const blobName = await uploadBlob(file.path, 'equipment')
    if (row.invoiceFilePath) await deleteBlob(row.invoiceFilePath).catch(() => {})
    const updated = await prisma.equipmentCostEntry.update({
        where: { id: costId },
        data: {
            invoiceFilePath: blobName,
            invoiceOriginalName: file.originalname,
            invoiceMimeType: file.mimetype,
        },
    })
    return serializeNested(updated as any)
}

export async function deleteCostEntry(equipmentId: string, costId: string, role: string) {
    assertRole(role)
    const row = await prisma.equipmentCostEntry.findFirst({ where: { id: costId, equipmentId } })
    if (!row) {
        const err: { status: number; message: string } = { status: 404, message: 'Record not found' }
        throw err
    }
    if (row.invoiceFilePath) await deleteBlob(row.invoiceFilePath).catch(() => {})
    await prisma.equipmentCostEntry.delete({ where: { id: costId } })
}

// --- Insurance ---

export async function addInsurance(
    equipmentId: string,
    role: string,
    data: { policyOrCertificate?: string | null; expiryDate?: string | null }
) {
    assertRole(role)
    const eq = await prisma.equipment.findUnique({ where: { id: equipmentId } })
    if (!eq) {
        const err: { status: number; message: string } = { status: 404, message: 'Equipment not found' }
        throw err
    }
    const row = await prisma.equipmentInsurance.create({
        data: {
            equipmentId,
            policyOrCertificate: data.policyOrCertificate?.trim() || null,
            expiryDate: data.expiryDate?.trim() || null,
        },
    })
    return row
}

export async function updateInsurance(
    equipmentId: string,
    insuranceId: string,
    role: string,
    data: Partial<{ policyOrCertificate: string | null; expiryDate: string | null }>
) {
    assertRole(role)
    const row = await prisma.equipmentInsurance.findFirst({
        where: { id: insuranceId, equipmentId },
    })
    if (!row) {
        const err: { status: number; message: string } = { status: 404, message: 'Not found' }
        throw err
    }
    const patch: Prisma.EquipmentInsuranceUpdateInput = {}
    if (data.policyOrCertificate !== undefined) patch.policyOrCertificate = data.policyOrCertificate?.trim() || null
    if (data.expiryDate !== undefined) patch.expiryDate = data.expiryDate?.trim() || null
    return prisma.equipmentInsurance.update({ where: { id: insuranceId }, data: patch })
}

export async function uploadInsurancePolicy(
    equipmentId: string,
    insuranceId: string,
    role: string,
    file: { path: string; originalname: string; mimetype: string }
) {
    assertRole(role)
    const row = await prisma.equipmentInsurance.findFirst({
        where: { id: insuranceId, equipmentId },
    })
    if (!row) {
        const err: { status: number; message: string } = { status: 404, message: 'Not found' }
        throw err
    }
    const blobName = await uploadBlob(file.path, 'equipment')
    if (row.policyFilePath) await deleteBlob(row.policyFilePath).catch(() => {})
    return prisma.equipmentInsurance.update({
        where: { id: insuranceId },
        data: {
            policyFilePath: blobName,
            policyOriginalName: file.originalname,
            policyMimeType: file.mimetype,
        },
    })
}

export async function deleteInsurance(equipmentId: string, insuranceId: string, role: string) {
    assertRole(role)
    const row = await prisma.equipmentInsurance.findFirst({
        where: { id: insuranceId, equipmentId },
    })
    if (!row) {
        const err: { status: number; message: string } = { status: 404, message: 'Not found' }
        throw err
    }
    if (row.policyFilePath) await deleteBlob(row.policyFilePath).catch(() => {})
    await prisma.equipmentInsurance.delete({ where: { id: insuranceId } })
}

// --- Inspection submission links ---

export async function addInspectionSubmission(equipmentId: string, role: string, submissionId: string) {
    assertRole(role)
    const eq = await prisma.equipment.findUnique({ where: { id: equipmentId } })
    if (!eq) {
        const err: { status: number; message: string } = { status: 404, message: 'Equipment not found' }
        throw err
    }
    const sid = submissionId.trim()
    if (!sid) {
        const err: { status: number; message: string } = { status: 400, message: 'submissionId required' }
        throw err
    }
    if (eq.inspectionSubmissionIds.includes(sid)) return getEquipmentById(equipmentId, role)
    await prisma.equipment.update({
        where: { id: equipmentId },
        data: { inspectionSubmissionIds: [...eq.inspectionSubmissionIds, sid] },
    })
    return getEquipmentById(equipmentId, role)
}

export async function removeInspectionSubmission(equipmentId: string, role: string, submissionId: string) {
    assertRole(role)
    const eq = await prisma.equipment.findUnique({ where: { id: equipmentId } })
    if (!eq) {
        const err: { status: number; message: string } = { status: 404, message: 'Equipment not found' }
        throw err
    }
    const next = eq.inspectionSubmissionIds.filter((id) => id !== submissionId)
    await prisma.equipment.update({
        where: { id: equipmentId },
        data: { inspectionSubmissionIds: { set: next } },
    })
    return getEquipmentById(equipmentId, role)
}
