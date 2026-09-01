import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'

const POLICY_ID = 'fleet-default'

function assertRole(role: string) {
    if (!['owner', 'hr', 'supervisor'].includes(role)) {
        throw Object.assign(new Error('Forbidden'), { status: 403 })
    }
}

function dec(v: unknown): Prisma.Decimal | null | undefined {
    if (v === undefined) return undefined
    if (v === null || v === '') return null
    const n = typeof v === 'number' ? v : Number(v)
    if (!Number.isFinite(n)) return null
    return new Prisma.Decimal(n)
}

function serializeVehicle(v: Record<string, unknown>) {
    for (const k of [
        'newCostIncludingEquipment',
        'liabilityBodilyInjuryPrem',
        'liabilityPropertyDamagePrem',
        'basicAccidentBenefitsPrem',
        'uninsuredAutomobilePrem',
    ]) {
        if (v[k] != null) v[k] = Number(v[k] as Prisma.Decimal)
    }
    return v
}

function serializePolicy(p: Record<string, unknown>) {
    if (p.premium != null) p.premium = Number(p.premium as Prisma.Decimal)
    const vehicles = Array.isArray(p.vehicles) ? p.vehicles.map((v) => serializeVehicle({ ...(v as Record<string, unknown>) })) : []
    return { ...p, vehicles }
}

async function ensurePolicy() {
    return prisma.fleetCarInsurancePolicy.upsert({
        where: { id: POLICY_ID },
        create: { id: POLICY_ID },
        update: {},
        include: { vehicles: { orderBy: [{ sortOrder: 'asc' }, { autoNo: 'asc' }] } },
    })
}

export async function getFleetCarInsurance(role: string) {
    assertRole(role)
    const policy = await ensurePolicy()
    return serializePolicy(policy as unknown as Record<string, unknown>)
}

export async function updateFleetCarInsurancePolicy(
    role: string,
    data: {
        insurerName?: string | null
        policyNumber?: string | null
        transactionType?: string | null
        effectiveDate?: string | null
        periodStart?: string | null
        periodEnd?: string | null
        numberOfAutomobiles?: number | null
        premium?: number | null
        paymentMethod?: string | null
        insuredName?: string | null
        insuredAddress?: string | null
        brokerName?: string | null
        brokerId?: string | null
        brokerAddress?: string | null
        brokerPhone?: string | null
        remarks?: string | null
        liabilityLimit?: string | null
    }
) {
    assertRole(role)
    await ensurePolicy()

    const patch: Prisma.FleetCarInsurancePolicyUpdateInput = {}
    const str = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null)

    if (data.insurerName !== undefined) patch.insurerName = str(data.insurerName)
    if (data.policyNumber !== undefined) patch.policyNumber = str(data.policyNumber)
    if (data.transactionType !== undefined) patch.transactionType = str(data.transactionType)
    if (data.effectiveDate !== undefined) patch.effectiveDate = str(data.effectiveDate)
    if (data.periodStart !== undefined) patch.periodStart = str(data.periodStart)
    if (data.periodEnd !== undefined) patch.periodEnd = str(data.periodEnd)
    if (data.numberOfAutomobiles !== undefined) {
        patch.numberOfAutomobiles = data.numberOfAutomobiles == null ? null : Number(data.numberOfAutomobiles)
    }
    if (data.premium !== undefined) patch.premium = dec(data.premium)
    if (data.paymentMethod !== undefined) patch.paymentMethod = str(data.paymentMethod)
    if (data.insuredName !== undefined) patch.insuredName = str(data.insuredName)
    if (data.insuredAddress !== undefined) patch.insuredAddress = str(data.insuredAddress)
    if (data.brokerName !== undefined) patch.brokerName = str(data.brokerName)
    if (data.brokerId !== undefined) patch.brokerId = str(data.brokerId)
    if (data.brokerAddress !== undefined) patch.brokerAddress = str(data.brokerAddress)
    if (data.brokerPhone !== undefined) patch.brokerPhone = str(data.brokerPhone)
    if (data.remarks !== undefined) patch.remarks = str(data.remarks)
    if (data.liabilityLimit !== undefined) patch.liabilityLimit = str(data.liabilityLimit)

    const updated = await prisma.fleetCarInsurancePolicy.update({
        where: { id: POLICY_ID },
        data: patch,
        include: { vehicles: { orderBy: [{ sortOrder: 'asc' }, { autoNo: 'asc' }] } },
    })
    return serializePolicy(updated as unknown as Record<string, unknown>)
}

export async function addFleetCarInsuranceVehicle(
    role: string,
    data: {
        autoNo: number
        modelYear?: number | null
        make?: string | null
        model?: string | null
        newCostIncludingEquipment?: number | null
        vin?: string | null
        location?: string | null
        ratingClass?: string | null
        rateGroupAb?: string | null
        rateGroupCompSp?: string | null
        rateGroupDcPd?: string | null
        rateGroupColAp?: string | null
        liabilityBodilyInjuryPrem?: number | null
        liabilityPropertyDamagePrem?: number | null
        basicAccidentBenefitsPrem?: number | null
        uninsuredAutomobilePrem?: number | null
        sortOrder?: number | null
    }
) {
    assertRole(role)
    await ensurePolicy()

    const autoNo = Number(data.autoNo)
    if (!Number.isFinite(autoNo) || autoNo < 1) {
        throw Object.assign(new Error('Auto number is required'), { status: 400 })
    }

    const created = await prisma.fleetCarInsuranceVehicle.create({
        data: {
            policyId: POLICY_ID,
            autoNo,
            modelYear: data.modelYear == null ? null : Number(data.modelYear),
            make: data.make?.trim() || null,
            model: data.model?.trim() || null,
            newCostIncludingEquipment: dec(data.newCostIncludingEquipment) ?? null,
            vin: data.vin?.trim() || null,
            location: data.location?.trim() || null,
            ratingClass: data.ratingClass?.trim() || null,
            rateGroupAb: data.rateGroupAb?.trim() || null,
            rateGroupCompSp: data.rateGroupCompSp?.trim() || null,
            rateGroupDcPd: data.rateGroupDcPd?.trim() || null,
            rateGroupColAp: data.rateGroupColAp?.trim() || null,
            liabilityBodilyInjuryPrem: dec(data.liabilityBodilyInjuryPrem) ?? null,
            liabilityPropertyDamagePrem: dec(data.liabilityPropertyDamagePrem) ?? null,
            basicAccidentBenefitsPrem: dec(data.basicAccidentBenefitsPrem) ?? null,
            uninsuredAutomobilePrem: dec(data.uninsuredAutomobilePrem) ?? null,
            sortOrder: data.sortOrder == null ? autoNo : Number(data.sortOrder),
        },
    })
    return serializeVehicle(created as unknown as Record<string, unknown>)
}

export async function updateFleetCarInsuranceVehicle(
    role: string,
    vehicleId: string,
    data: {
        autoNo?: number
        modelYear?: number | null
        make?: string | null
        model?: string | null
        newCostIncludingEquipment?: number | null
        vin?: string | null
        location?: string | null
        ratingClass?: string | null
        rateGroupAb?: string | null
        rateGroupCompSp?: string | null
        rateGroupDcPd?: string | null
        rateGroupColAp?: string | null
        liabilityBodilyInjuryPrem?: number | null
        liabilityPropertyDamagePrem?: number | null
        basicAccidentBenefitsPrem?: number | null
        uninsuredAutomobilePrem?: number | null
        sortOrder?: number | null
    }
) {
    assertRole(role)
    const existing = await prisma.fleetCarInsuranceVehicle.findFirst({
        where: { id: vehicleId, policyId: POLICY_ID },
    })
    if (!existing) throw Object.assign(new Error('Vehicle not found'), { status: 404 })

    const patch: Prisma.FleetCarInsuranceVehicleUpdateInput = {}
    if (data.autoNo !== undefined) patch.autoNo = Number(data.autoNo)
    if (data.modelYear !== undefined) patch.modelYear = data.modelYear == null ? null : Number(data.modelYear)
    if (data.make !== undefined) patch.make = data.make?.trim() || null
    if (data.model !== undefined) patch.model = data.model?.trim() || null
    if (data.newCostIncludingEquipment !== undefined) patch.newCostIncludingEquipment = dec(data.newCostIncludingEquipment)
    if (data.vin !== undefined) patch.vin = data.vin?.trim() || null
    if (data.location !== undefined) patch.location = data.location?.trim() || null
    if (data.ratingClass !== undefined) patch.ratingClass = data.ratingClass?.trim() || null
    if (data.rateGroupAb !== undefined) patch.rateGroupAb = data.rateGroupAb?.trim() || null
    if (data.rateGroupCompSp !== undefined) patch.rateGroupCompSp = data.rateGroupCompSp?.trim() || null
    if (data.rateGroupDcPd !== undefined) patch.rateGroupDcPd = data.rateGroupDcPd?.trim() || null
    if (data.rateGroupColAp !== undefined) patch.rateGroupColAp = data.rateGroupColAp?.trim() || null
    if (data.liabilityBodilyInjuryPrem !== undefined) patch.liabilityBodilyInjuryPrem = dec(data.liabilityBodilyInjuryPrem)
    if (data.liabilityPropertyDamagePrem !== undefined) patch.liabilityPropertyDamagePrem = dec(data.liabilityPropertyDamagePrem)
    if (data.basicAccidentBenefitsPrem !== undefined) patch.basicAccidentBenefitsPrem = dec(data.basicAccidentBenefitsPrem)
    if (data.uninsuredAutomobilePrem !== undefined) patch.uninsuredAutomobilePrem = dec(data.uninsuredAutomobilePrem)
    if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder == null ? 0 : Number(data.sortOrder)

    const updated = await prisma.fleetCarInsuranceVehicle.update({
        where: { id: vehicleId },
        data: patch,
    })
    return serializeVehicle(updated as unknown as Record<string, unknown>)
}

export async function deleteFleetCarInsuranceVehicle(role: string, vehicleId: string) {
    assertRole(role)
    const existing = await prisma.fleetCarInsuranceVehicle.findFirst({
        where: { id: vehicleId, policyId: POLICY_ID },
    })
    if (!existing) throw Object.assign(new Error('Vehicle not found'), { status: 404 })
    await prisma.fleetCarInsuranceVehicle.delete({ where: { id: vehicleId } })
}
