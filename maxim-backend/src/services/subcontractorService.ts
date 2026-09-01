import { prisma } from '../lib/prisma'

const EXPIRING_DAYS = 30
const WSIB_OPTIONAL_MARKER = '[WSIB_OPTIONAL]'
const WSIB_CLEARANCE_OPTIONAL_MARKER = '[WSIB_CLEARANCE_OPTIONAL]'
const FORM1000_OPTIONAL_MARKER = '[FORM1000_OPTIONAL]'

function isWsibReportOptionalFromNotes(notes: string | null | undefined) {
    return String(notes ?? '').includes(WSIB_OPTIONAL_MARKER)
}

function isWsibClearanceOptionalFromNotes(notes: string | null | undefined) {
    return String(notes ?? '').includes(WSIB_CLEARANCE_OPTIONAL_MARKER)
}

function isForm1000OptionalFromNotes(notes: string | null | undefined) {
    return String(notes ?? '').includes(FORM1000_OPTIONAL_MARKER)
}

function stripOptionalNoteMarkers(notes: string | null | undefined) {
    return String(notes ?? '')
        .split(WSIB_OPTIONAL_MARKER).join(' ')
        .split(WSIB_CLEARANCE_OPTIONAL_MARKER).join(' ')
        .split(FORM1000_OPTIONAL_MARKER).join(' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function buildNotesWithOptionalMarkers(
    userNotes: string,
    reportOptional: boolean,
    clearanceOptional: boolean,
    form1000Optional: boolean
): string | null {
    const base = userNotes
    const parts = [base, reportOptional && WSIB_OPTIONAL_MARKER, clearanceOptional && WSIB_CLEARANCE_OPTIONAL_MARKER, form1000Optional && FORM1000_OPTIONAL_MARKER].filter(Boolean) as string[]
    const joined = parts.join(' ').replace(/\s+/g, ' ').trim()
    return joined || null
}

function certStatus(expiresAt: string): 'current' | 'expiring-soon' | 'expired' {
    const today = new Date().toISOString().slice(0, 10)
    const in30 = new Date(Date.now() + EXPIRING_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    if (expiresAt < today) return 'expired'
    if (expiresAt <= in30) return 'expiring-soon'
    return 'current'
}

function calculateCompliance(
    subcontractor: any,
    certifications: { name: string; status: string; expiresAt?: string | null }[],
    contracts: any[],
    insurances: { type: string; expiresAt?: string | null }[]
) {
    const missing: string[] = []
    const expiringSoon: string[] = []
    let mandatoryCount = 7
    let validCount = 0

    if (contracts.length > 0) validCount++; else missing.push('Signed Contract')

    const coi = insurances.find(i => i.type === 'COI')
    if (coi) validCount++; else missing.push('COI')

    const wsibClearanceOptional = isWsibClearanceOptionalFromNotes(subcontractor.notes)
    const wsibIn = insurances.find(i => i.type === 'WSIB')
    if (wsibClearanceOptional) {
        mandatoryCount--
    } else if (wsibIn) {
        validCount++
    } else {
        missing.push('WSIB Insurance')
    }

    const wsibReportOptional = isWsibReportOptionalFromNotes(subcontractor.notes)
    if (wsibReportOptional) {
        mandatoryCount--
    } else if (subcontractor.wsibInjuryReportPath) {
        validCount++
    } else {
        missing.push('WSIB Injury Summary Report')
    }
    if (subcontractor.hrSafetyAgreementPath) validCount++; else missing.push('Sub-Contractor H&R Safety Agreement')
    if (subcontractor.usingMaximHSManual || subcontractor.hsPdfFilePath) validCount++; else missing.push('Health & Safety Manual')
    const form1000Optional = isForm1000OptionalFromNotes(subcontractor.notes)
    if (form1000Optional) {
        mandatoryCount--
    } else if (subcontractor.form1000Path) {
        validCount++
    } else {
        missing.push('FORM 1000')
    }

    certifications.forEach(c => {
        if (c.status === 'expired') missing.push(`${c.name} (Expired)`)
        else if (c.status === 'expiring-soon') expiringSoon.push(c.name)
    })

    insurances.forEach(ins => {
        if (ins.type === 'WSIB' && wsibClearanceOptional) return
        if (ins.expiresAt) {
            const today = new Date().toISOString().slice(0, 10)
            const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
            if (ins.expiresAt < today) {
                if (!missing.includes(`${ins.type} Insurance (Expired)`)) missing.push(`${ins.type} Insurance (Expired)`)
            } else if (ins.expiresAt <= in30) {
                if (!expiringSoon.includes(`${ins.type} Insurance`)) expiringSoon.push(`${ins.type} Insurance`)
            }
        }
    })

    const hasExpired = certifications.some(c => c.status === 'expired') ||
        insurances.some(ins => ins.expiresAt && ins.expiresAt < new Date().toISOString().slice(0, 10) &&
            !(ins.type === 'WSIB' && wsibClearanceOptional))

    let score = Math.round((validCount / mandatoryCount) * 100)
    if (hasExpired && score > 80) score = 80

    let status = 'Compliant'
    if (score < 100 || missing.length > 0 || hasExpired) status = 'Non-compliant'
    else if (expiringSoon.length > 0) status = 'Attention needed'

    return { score, status, missing, expiringSoon }
}

/** List + PATCH responses include compliance so the subcontractor list stays in sync with detail. */
async function getSubcontractorMapWithCompliance(id: string) {
    const s = await prisma.subcontractor.findUnique({
        where: { id },
        include: {
            insurances: { select: { type: true, expiresAt: true } },
            contracts: { select: { id: true } },
            certifications: { select: { name: true, status: true, expiresAt: true } },
            personnel: {
                select: {
                    certifications: { select: { name: true, status: true, expiresAt: true } }
                }
            }
        }
    })
    if (!s) return null
    const allCerts = [
        ...s.certifications,
        ...s.personnel.flatMap(p => p.certifications)
    ]
    const compliance = calculateCompliance(s, allCerts, s.contracts, s.insurances)
    return {
        ...mapSub(s),
        compliance: { score: compliance.score, status: compliance.status }
    }
}

function mapSub(s: any) {
    return {
        id: s.id,
        companyName: s.companyName,
        officeContactName: s.officeContactName,
        officeContactEmail: s.officeContactEmail,
        officeContactPhone: s.officeContactPhone ?? undefined,
        siteContactName: s.siteContactName ?? undefined,
        siteContactEmail: s.siteContactEmail ?? undefined,
        siteContactPhone: s.siteContactPhone ?? undefined,
        status: s.status,
        notes: s.notes ?? undefined,
        usingMaximHSManual: s.usingMaximHSManual ?? false,
        hsPdfFilePath: s.hsPdfFilePath ?? undefined,
        hsPdfOriginalName: s.hsPdfOriginalName ?? undefined,
        wsibInjuryReportOptional: isWsibReportOptionalFromNotes(s.notes),
        wsibClearanceOptional: isWsibClearanceOptionalFromNotes(s.notes),
        form1000Optional: isForm1000OptionalFromNotes(s.notes),
        wsibInjuryReportPath: s.wsibInjuryReportPath ?? undefined,
        wsibInjuryReportOriginalName: s.wsibInjuryReportOriginalName ?? undefined,
        hrSafetyAgreementPath: s.hrSafetyAgreementPath ?? undefined,
        hrSafetyAgreementOriginalName: s.hrSafetyAgreementOriginalName ?? undefined,
        form1000Path: s.form1000Path ?? undefined,
        form1000OriginalName: s.form1000OriginalName ?? undefined,
    }
}

function mapInsurance(i: any) {
    return {
        id: i.id,
        subcontractorId: i.subcontractorId,
        type: i.type,
        policyNumber: i.policyNumber ?? undefined,
        expiresAt: i.expiresAt ?? undefined,
        status: i.status,
        filePath: i.filePath ?? undefined,
        originalName: i.originalName ?? undefined,
        uploadedAt: i.uploadedAt?.toISOString?.() ?? undefined,
    }
}

function mapContract(c: any) {
    return {
        id: c.id,
        subcontractorId: c.subcontractorId,
        personnelId: c.personnelId ?? undefined,
        startDate: c.startDate,
        endDate: c.endDate ?? undefined,
        filePath: c.filePath,
        originalName: c.originalName,
        uploadedAt: c.uploadedAt?.toISOString?.() ?? undefined,
    }
}

function mapCert(c: any) {
    return {
        id: c.id,
        subcontractorId: c.subcontractorId,
        name: c.name,
        issuedAt: c.issuedAt,
        expiresAt: c.expiresAt,
        status: c.status,
        fileName: c.fileName ?? undefined,
        filePath: c.filePath ?? undefined,
    }
}

export async function listSubcontractors(userId: string, userRole: string) {
    if (userRole === 'owner' || userRole === 'hr') {
        const list = await prisma.subcontractor.findMany({
            orderBy: [{ status: 'asc' }, { companyName: 'asc' }],
            include: { 
                jobAssignments: true,
                insurances: { select: { id: true, type: true, policyNumber: true, expiresAt: true, filePath: true, originalName: true } },
                contracts: { select: { id: true } },
                certifications: { select: { name: true, status: true, expiresAt: true } },
                personnel: {
                    select: {
                        certifications: { select: { name: true, status: true, expiresAt: true } }
                    }
                }
            }
        })
        return list.map((s) => {
            const allCerts = [
                ...s.certifications,
                ...s.personnel.flatMap(p => p.certifications)
            ]
            const compliance = calculateCompliance(s, allCerts, s.contracts, s.insurances)

            return {
                id: s.id,
                companyName: s.companyName,
                officeContactName: s.officeContactName,
                officeContactEmail: s.officeContactEmail,
                officeContactPhone: s.officeContactPhone ?? undefined,
                siteContactName: s.siteContactName ?? undefined,
                siteContactEmail: s.siteContactEmail ?? undefined,
                siteContactPhone: s.siteContactPhone ?? undefined,
                status: s.status,
                wsibInjuryReportOptional: isWsibReportOptionalFromNotes(s.notes),
                wsibClearanceOptional: isWsibClearanceOptionalFromNotes(s.notes),
                form1000Optional: isForm1000OptionalFromNotes(s.notes),
                jobAssignments: s.jobAssignments,
                insurances: s.insurances,
                compliance: { score: compliance.score, status: compliance.status }
            }
        })
    }

    if (userRole === 'supervisor') {
        // Find jobs supervised by this user
        const assignments = await prisma.subcontractorJobAssignment.findMany({
            where: { job: { supervisors: { some: { userId } } } },
            include: { subcontractor: true }
        })

        // Extract unique subcontractors
        const uniqueSubs = new Map<string, any>()
        for (const a of assignments) {
            uniqueSubs.set(a.subcontractor.id, a.subcontractor)
        }

        const list = Array.from(uniqueSubs.values()).sort((a, b) => {
            if (a.status !== b.status) return a.status.localeCompare(b.status)
            return a.companyName.localeCompare(b.companyName)
        })

        // For supervisor view, we might need basic compliance too. 
        // We handle this by making a second query to get minimal compliance fields,
        // or just re-run findMany with the ids to get the full includes.
        const listWithCompliance = await prisma.subcontractor.findMany({
            where: { id: { in: list.map(s => s.id) } },
            include: {
                insurances: { select: { id: true, type: true, policyNumber: true, expiresAt: true, filePath: true, originalName: true } },
                contracts: { select: { id: true } },
                certifications: { select: { name: true, status: true, expiresAt: true } },
                personnel: {
                    select: {
                        certifications: { select: { name: true, status: true, expiresAt: true } }
                    }
                }
            }
        })
        const subMap = new Map<string, any>(listWithCompliance.map(s => [s.id, s]))

        return list.map((s: any) => {
            const fullS = subMap.get(s.id)!
            const allCerts = [
                ...(fullS.certifications || []),
                ...(fullS.personnel?.flatMap((p: any) => p.certifications) || [])
            ]
            const compliance = calculateCompliance(fullS, allCerts, fullS.contracts || [], fullS.insurances || [])

            return {
                id: s.id,
                companyName: s.companyName,
                officeContactName: s.officeContactName,
                officeContactEmail: s.officeContactEmail,
                officeContactPhone: s.officeContactPhone ?? undefined,
                siteContactName: s.siteContactName ?? undefined,
                siteContactEmail: s.siteContactEmail ?? undefined,
                siteContactPhone: s.siteContactPhone ?? undefined,
                status: s.status,
                wsibInjuryReportOptional: isWsibReportOptionalFromNotes(fullS.notes),
                wsibClearanceOptional: isWsibClearanceOptionalFromNotes(fullS.notes),
                form1000Optional: isForm1000OptionalFromNotes(fullS.notes),
                jobAssignments: s.jobAssignments || [],
                insurances: fullS.insurances || [],
                compliance: { score: compliance.score, status: compliance.status }
            }
        })
    }

    throw { status: 403, message: 'Forbidden' }
}

export async function listAllSubcontractorCertifications(userId: string, userRole: string) {
    if (userRole !== 'owner' && userRole !== 'hr' && userRole !== 'supervisor') {
        throw { status: 403, message: 'Forbidden' }
    }

    let subFilter = {};
    if (userRole === 'supervisor') {
        const assignments = await prisma.subcontractorJobAssignment.findMany({
            where: { job: { supervisors: { some: { userId } } } },
            select: { subcontractorId: true }
        })
        subFilter = {
            subcontractorId: { in: assignments.map(a => a.subcontractorId) }
        }
    }

    const companyCertifications = await prisma.subcontractorCertification.findMany({
        where: subFilter
    })

    let personnelSubFilter = {};
    if (userRole === 'supervisor') {
        personnelSubFilter = {
            personnel: {
                subcontractorId: { in: (subFilter as any).subcontractorId.in }
            }
        }
    }

    const personnelCertifications = await prisma.subcontractorPersonnelCertification.findMany({
        where: {
            ...personnelSubFilter,
            personnel: {
                ...(personnelSubFilter as any).personnel,
                status: { not: 'terminated' },
            },
        },
        include: { personnel: { select: { subcontractorId: true } } }
    })

    return {
        companyCertifications: companyCertifications.map(mapCert),
        personnelCertifications: personnelCertifications.map(c => ({
            id: c.id,
            personnelId: c.personnelId,
            subcontractorId: c.personnel.subcontractorId,
            name: c.name,
            issuedAt: c.issuedAt,
            expiresAt: c.expiresAt,
            status: c.status,
            fileName: c.fileName ?? undefined,
            filePath: c.filePath ?? undefined,
        }))
    }
}

export async function getSubcontractorById(id: string, userId: string, userRole: string) {
    if (userRole !== 'owner' && userRole !== 'hr' && userRole !== 'supervisor') {
        throw { status: 403, message: 'Forbidden' }
    }
    const sub = await prisma.subcontractor.findUnique({
        where: { id },
        include: {
            contracts: true,
            certifications: true,
            insurances: { orderBy: { uploadedAt: 'desc' } },
            jobAssignments: {
                include: {
                    job: {
                        include: { supervisors: { select: { userId: true } }, site: { select: { name: true } } }
                    },
                },
            },
        },
    })
    if (!sub) throw { status: 404, message: 'Subcontractor not found' }

    if (userRole === 'supervisor') {
        // Confirm the supervisor manages at least one job this sub is on
        const isManager = sub.jobAssignments.some(a =>
            a.job.supervisors && a.job.supervisors.some(s => s.userId === userId)
        )
        if (!isManager) {
            throw { status: 403, message: 'Forbidden' }
        }
    }
    const jobs = sub.jobAssignments.map((a) => ({
        id: a.id,
        jobId: a.jobId,
        jobTitle: a.job?.title,
        jobStatus: a.job?.status,
        siteId: (a.job as any)?.site?.name || a.job?.siteId,
        assignedAt: a.assignedAt?.toISOString?.() ?? undefined,
    }))
    const injuries = await prisma.injuryReport.findMany({
        where: { subcontractorId: id },
        orderBy: { reportedAt: 'desc' },
    })
    return {
        ...mapSub(sub),
        contracts: sub.contracts.map(mapContract),
        certifications: sub.certifications.map(mapCert),
        insurances: (sub as any).insurances?.map(mapInsurance) ?? [],
        jobAssignments: jobs,
        injuryReports: injuries.map((r) => ({
            id: r.id,
            siteName: r.siteName,
            reportedAt: r.reportedAt?.toISOString?.(),
            status: r.status,
            severity: r.severity,
            description: r.description?.slice(0, 100),
        })),
    }
}

export async function createSubcontractor(userId: string, userRole: string, data: {
    companyName: string
    officeContactName: string
    officeContactEmail: string
    officeContactPhone?: string
    siteContactName?: string
    siteContactEmail?: string
    siteContactPhone?: string
    status?: string
    notes?: string
}) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can create subcontractors' }
    const sub = await prisma.subcontractor.create({
        data: {
            companyName: data.companyName.trim(),
            officeContactName: data.officeContactName.trim(),
            officeContactEmail: data.officeContactEmail.trim(),
            officeContactPhone: data.officeContactPhone?.trim(),
            siteContactName: data.siteContactName?.trim(),
            siteContactEmail: data.siteContactEmail?.trim(),
            siteContactPhone: data.siteContactPhone?.trim(),
            status: data.status || 'active',
            notes: data.notes?.trim(),
        },
    })
    return mapSub(sub)
}

export async function updateSubcontractor(id: string, userRole: string, data: Partial<{
    companyName: string
    officeContactName: string
    officeContactEmail: string
    officeContactPhone: string
    siteContactName: string
    siteContactEmail: string
    siteContactPhone: string
    status: string
    notes: string
    usingMaximHSManual: boolean
    wsibInjuryReportOptional: boolean
    wsibClearanceOptional: boolean
    form1000Optional: boolean
}>) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can update subcontractors' }
    const existing = await prisma.subcontractor.findUnique({
        where: { id },
        select: { notes: true },
    })
    if (!existing) throw { status: 404, message: 'Subcontractor not found' }
    const targetReportOptional =
        data.wsibInjuryReportOptional !== undefined
            ? data.wsibInjuryReportOptional
            : isWsibReportOptionalFromNotes(existing.notes)
    const targetClearanceOptional =
        data.wsibClearanceOptional !== undefined
            ? data.wsibClearanceOptional
            : isWsibClearanceOptionalFromNotes(existing.notes)
    const targetForm1000Optional =
        data.form1000Optional !== undefined
            ? data.form1000Optional
            : isForm1000OptionalFromNotes(existing.notes)
    const userNotes = stripOptionalNoteMarkers(
        data.notes !== undefined ? data.notes : existing.notes
    )
    const resolvedNotes = buildNotesWithOptionalMarkers(
        userNotes,
        targetReportOptional,
        targetClearanceOptional,
        targetForm1000Optional
    )
    const shouldUpdateNotes = data.notes !== undefined
        || data.wsibInjuryReportOptional !== undefined
        || data.wsibClearanceOptional !== undefined
        || data.form1000Optional !== undefined
    await prisma.subcontractor.update({
        where: { id },
        data: {
            ...(data.companyName !== undefined && { companyName: data.companyName.trim() }),
            ...(data.officeContactName !== undefined && { officeContactName: data.officeContactName.trim() }),
            ...(data.officeContactEmail !== undefined && { officeContactEmail: data.officeContactEmail.trim() }),
            ...(data.officeContactPhone !== undefined && { officeContactPhone: data.officeContactPhone?.trim() || null }),
            ...(data.siteContactName !== undefined && { siteContactName: data.siteContactName?.trim() || null }),
            ...(data.siteContactEmail !== undefined && { siteContactEmail: data.siteContactEmail?.trim() || null }),
            ...(data.siteContactPhone !== undefined && { siteContactPhone: data.siteContactPhone?.trim() || null }),
            ...(data.status !== undefined && { status: data.status }),
            ...(shouldUpdateNotes && { notes: resolvedNotes }),
            ...(data.usingMaximHSManual !== undefined && { usingMaximHSManual: data.usingMaximHSManual }),
        },
    })
    const withCompliance = await getSubcontractorMapWithCompliance(id)
    if (!withCompliance) throw { status: 404, message: 'Subcontractor not found' }
    return withCompliance
}

export async function upsertSubcontractorHSManualPdf(
    subcontractorId: string,
    userRole: string,
    data: { filePath: string; originalName: string }
) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can manage H&S Manual PDFs' }
    const existing = await prisma.subcontractor.findUnique({ where: { id: subcontractorId } })
    if (!existing) throw { status: 404, message: 'Subcontractor not found' }
    const oldFilePath = existing.hsPdfFilePath ?? undefined
    const updated = await prisma.subcontractor.update({
        where: { id: subcontractorId },
        data: {
            hsPdfFilePath: data.filePath,
            hsPdfOriginalName: data.originalName,
        },
    })
    return { sub: mapSub(updated), oldFilePath }
}

export async function upsertSubcontractorWsibPdf(
    subcontractorId: string,
    userRole: string,
    data: { filePath: string; originalName: string }
) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can manage WSIB documents' }
    const existing = await prisma.subcontractor.findUnique({ where: { id: subcontractorId } })
    if (!existing) throw { status: 404, message: 'Subcontractor not found' }
    const oldFilePath = existing.wsibInjuryReportPath ?? undefined
    const updated = await prisma.subcontractor.update({
        where: { id: subcontractorId },
        data: {
            wsibInjuryReportPath: data.filePath,
            wsibInjuryReportOriginalName: data.originalName,
        },
    })
    return { sub: mapSub(updated), oldFilePath }
}

export async function upsertSubcontractorHrSafetyPdf(
    subcontractorId: string,
    userRole: string,
    data: { filePath: string; originalName: string }
) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can manage HR Safety documents' }
    const existing = await prisma.subcontractor.findUnique({ where: { id: subcontractorId } })
    if (!existing) throw { status: 404, message: 'Subcontractor not found' }
    const oldFilePath = existing.hrSafetyAgreementPath ?? undefined
    const updated = await prisma.subcontractor.update({
        where: { id: subcontractorId },
        data: {
            hrSafetyAgreementPath: data.filePath,
            hrSafetyAgreementOriginalName: data.originalName,
        },
    })
    return { sub: mapSub(updated), oldFilePath }
}

export async function upsertSubcontractorForm1000Pdf(
    subcontractorId: string,
    userRole: string,
    data: { filePath: string; originalName: string }
) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can manage FORM 1000 documents' }
    const existing = await prisma.subcontractor.findUnique({ where: { id: subcontractorId } })
    if (!existing) throw { status: 404, message: 'Subcontractor not found' }
    const oldFilePath = existing.form1000Path ?? undefined
    const updated = await prisma.subcontractor.update({
        where: { id: subcontractorId },
        data: {
            form1000Path: data.filePath,
            form1000OriginalName: data.originalName,
        },
    })
    return { sub: mapSub(updated), oldFilePath }
}

export async function addSubcontractorInsurance(
    subcontractorId: string,
    userRole: string,
    data: { type: string; policyNumber?: string; expiresAt?: string; filePath?: string; originalName?: string }
) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can manage insurances' }
    const sub = await prisma.subcontractor.findUnique({ where: { id: subcontractorId } })
    if (!sub) throw { status: 404, message: 'Subcontractor not found' }

    // Determine status based on expiry
    let status = 'active'
    if (data.expiresAt) {
        const today = new Date().toISOString().slice(0, 10)
        if (data.expiresAt < today) status = 'expired'
    }

    const insurance = await prisma.subcontractorInsurance.create({
        data: {
            subcontractorId,
            type: data.type.trim(),
            policyNumber: data.policyNumber?.trim() || null,
            expiresAt: data.expiresAt?.trim() || null,
            status,
            filePath: data.filePath?.trim() || null,
            originalName: data.originalName?.trim() || null,
        },
    })
    return mapInsurance(insurance)
}

export async function deleteSubcontractorInsurance(insuranceId: string, userRole: string) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can manage insurances' }
    const existing = await prisma.subcontractorInsurance.findUnique({ where: { id: insuranceId } })
    if (!existing) throw { status: 404, message: 'Insurance not found' }
    await prisma.subcontractorInsurance.delete({ where: { id: insuranceId } })
    return existing // return so router can unlink file if needed
}

export async function deleteSubcontractor(id: string, userRole: string) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can delete subcontractors' }
    await prisma.subcontractor.delete({ where: { id } }).catch(() => {
        throw { status: 404, message: 'Subcontractor not found' }
    })
    return { message: 'Deleted' }
}

export async function addSubcontractorCertification(subcontractorId: string, userRole: string, data: {
    name: string
    issuedAt: string
    expiresAt: string
    fileName?: string
    filePath?: string
}, uploaderId: string, uploaderName: string) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can manage subcontractor certifications' }
    const sub = await prisma.subcontractor.findUnique({ where: { id: subcontractorId } })
    if (!sub) throw { status: 404, message: 'Subcontractor not found' }
    const status = certStatus(data.expiresAt)
    const cert = await prisma.subcontractorCertification.create({
        data: {
            subcontractorId,
            name: data.name.trim(),
            issuedAt: data.issuedAt.trim(),
            expiresAt: data.expiresAt.trim(),
            status,
            fileName: data.fileName?.trim(),
            filePath: data.filePath?.trim(),
        },
    })

    // Auto-create a Certificate record so it shows on the main Certificates page
    try {
        await prisma.certificate.create({
            data: {
                name: data.name.trim(),
                holderName: sub.companyName,
                holderUserId: null, // Subcontractor company doesn't have a user ID
                issueDate: data.issuedAt.trim() || null,
                expirationDate: data.expiresAt.trim(),
                uploadedById: uploaderId,
                uploadedBy: uploaderName || sub.companyName,
                fileName: data.fileName?.trim() || null,
                filePath: data.filePath?.trim() || null,
            } as any,
        })
    } catch (e) {
        console.error('[subcontractorService] Failed to auto-create Certificate record:', e)
    }

    return mapCert(cert)
}

export async function updateSubcontractorCertification(id: string, userRole: string, data: Partial<{ name: string; issuedAt: string; expiresAt: string; fileName: string; filePath: string }>) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can update subcontractor certifications' }
    const existing = await prisma.subcontractorCertification.findUnique({ where: { id } })
    if (!existing) throw { status: 404, message: 'Certification not found' }
    const expiresAt = data.expiresAt ?? existing.expiresAt
    const status = certStatus(expiresAt)
    const cert = await prisma.subcontractorCertification.update({
        where: { id },
        data: {
            ...(data.name !== undefined && { name: data.name.trim() }),
            ...(data.issuedAt !== undefined && { issuedAt: data.issuedAt.trim() }),
            ...(data.expiresAt !== undefined && { expiresAt: data.expiresAt.trim() }),
            status,
            ...(data.fileName !== undefined && { fileName: data.fileName?.trim() || null }),
            ...(data.filePath !== undefined && { filePath: data.filePath?.trim() || null }),
        },
    })

    // Auto-update associated Certificate record
    try {
        const updateData: any = {}
        if (data.name !== undefined) updateData.name = data.name.trim()
        if (data.issuedAt !== undefined) updateData.issueDate = data.issuedAt.trim() || null
        if (data.expiresAt !== undefined) updateData.expirationDate = data.expiresAt.trim()

        if (Object.keys(updateData).length > 0) {
            if (existing.filePath) {
                await prisma.certificate.updateMany({
                    where: { filePath: existing.filePath } as any,
                    data: updateData
                })
            } else {
                await prisma.certificate.updateMany({
                    where: { name: existing.name } as any,
                    data: updateData
                })
            }
        }
    } catch (e) {
        console.error('[subcontractorService] Failed to auto-update Certificate record:', e)
    }

    return mapCert(cert)
}

export async function removeSubcontractorCertification(id: string, userRole: string) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can remove subcontractor certifications' }
    const existing = await prisma.subcontractorCertification.findUnique({ where: { id } })
    if (!existing) throw { status: 404, message: 'Certification not found' }

    await prisma.subcontractorCertification.delete({ where: { id } })

    // Auto-delete associated Certificate record using the filePath if available, or just name and holder combination
    if (existing.filePath) {
        await prisma.certificate.deleteMany({
            where: { filePath: existing.filePath } as any
        })
    } else {
        await prisma.certificate.deleteMany({
            where: { name: existing.name } as any
        })
    }

    return { message: 'Deleted' }
}

export async function addSubcontractorContract(
    subcontractorId: string,
    userRole: string,
    data: { startDate: string; endDate?: string; personnelId?: string; filePath: string; originalName: string }
) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can manage contracts' }

    // Convert generic null-like strings from FormData if applicable
    const personnelId = data.personnelId && data.personnelId.trim() !== '' && data.personnelId !== 'null' && data.personnelId !== 'undefined'
        ? data.personnelId.trim()
        : null

    const contract = await prisma.subcontractorContract.create({
        data: {
            subcontractorId,
            personnelId,
            startDate: data.startDate.trim(),
            endDate: data.endDate?.trim() || null,
            filePath: data.filePath,
            originalName: data.originalName,
        },
    })
    return mapContract(contract)
}

export async function removeSubcontractorContract(contractId: string, userRole: string) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can manage contracts' }
    const contract = await prisma.subcontractorContract.findUnique({ where: { id: contractId } })
    if (!contract) throw { status: 404, message: 'Contract not found' }
    await prisma.subcontractorContract.delete({ where: { id: contractId } })
    return contract // Returning contract to let router know if physical file needs to be unlinked
}

// ================= Personnel =================

export async function listSubcontractorPersonnel(subcontractorId: string, userRole: string) {
    if (userRole !== 'owner' && userRole !== 'hr' && userRole !== 'supervisor') throw { status: 403, message: 'Forbidden' }
    const personnel = await prisma.subcontractorPersonnel.findMany({
        where: { subcontractorId },
        include: { certifications: true, jobAssignments: true, documents: true }
    })
    return personnel
}

export async function addSubcontractorPersonnel(subcontractorId: string, userRole: string, data: { name: string; email?: string; isSupervisor?: boolean }) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can manage personnel' }
    const sub = await prisma.subcontractor.findUnique({ where: { id: subcontractorId } })
    if (!sub) throw { status: 404, message: 'Subcontractor not found' }
    return await prisma.subcontractorPersonnel.create({
        data: {
            subcontractorId,
            name: data.name.trim(),
            email: data.email?.trim() || null,
            isSupervisor: data.isSupervisor || false,
        },
        include: { certifications: true, jobAssignments: true, documents: true }
    })
}

export async function updateSubcontractorPersonnel(id: string, userRole: string, data: Partial<{ name: string; email: string; isSupervisor: boolean; orientationCompletedAt: string | null; orientationLocation: string | null; status: string }>) {
    if (userRole !== 'owner' && userRole !== 'hr' && userRole !== 'supervisor') throw { status: 403, message: 'Only Owner, HR, or Supervisor can update personnel' }
    return await prisma.subcontractorPersonnel.update({
        where: { id },
        data: {
            ...(data.name !== undefined && { name: data.name.trim() }),
            ...(data.email !== undefined && { email: data.email?.trim() || null }),
            ...(data.isSupervisor !== undefined && { isSupervisor: data.isSupervisor }),
            ...(data.orientationCompletedAt !== undefined && { orientationCompletedAt: data.orientationCompletedAt ? new Date(data.orientationCompletedAt) : null }),
            ...(data.orientationLocation !== undefined && { orientationLocation: data.orientationLocation?.trim() || null }),
            ...(data.status !== undefined && { status: data.status }),
        },
        include: { certifications: true, jobAssignments: true, documents: true }
    })
}

export async function removeSubcontractorPersonnel(id: string, userRole: string) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can remove personnel' }
    await prisma.subcontractorPersonnel.delete({ where: { id } })
    return { message: 'Deleted' }
}

export async function addPersonnelJobAssignment(
    subcontractorId: string,
    personnelId: string,
    jobId: string,
    userId: string,
    userRole: string
) {
    if (userRole !== 'owner' && userRole !== 'hr' && userRole !== 'supervisor') {
        throw { status: 403, message: 'Only Owner, HR, or assigned Supervisor can assign jobs' }
    }

    const personnel = await prisma.subcontractorPersonnel.findUnique({
        where: { id: personnelId },
        select: { id: true, subcontractorId: true },
    })
    if (!personnel) throw { status: 404, message: 'Personnel not found' }
    if (personnel.subcontractorId !== subcontractorId) {
        throw { status: 400, message: 'Personnel does not belong to this subcontractor' }
    }

    const subJob = await prisma.subcontractorJobAssignment.findUnique({
        where: { jobId_subcontractorId: { jobId, subcontractorId } },
        select: { id: true },
    })
    if (!subJob) {
        throw { status: 400, message: 'This subcontractor is not assigned to the selected job' }
    }

    if (userRole === 'supervisor') {
        const managed = await prisma.jobSupervisor.findFirst({
            where: { jobId, userId },
            select: { id: true },
        })
        if (!managed) throw { status: 403, message: 'Only assigned supervisors can manage this job workforce' }
    }

    const existing = await prisma.subcontractorPersonnelJobAssignment.findFirst({
        where: { personnelId, jobId },
    })
    if (existing) return existing

    return await prisma.subcontractorPersonnelJobAssignment.create({
        data: { personnelId, jobId }
    })
}

export async function updatePersonnelJobAssignment(id: string, userRole: string, data: { orientationCompletedAt?: string }) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Forbidden' }
    const updated = await prisma.subcontractorPersonnelJobAssignment.update({
        where: { id },
        data: { orientationCompletedAt: data.orientationCompletedAt ? new Date(data.orientationCompletedAt) : null }
    })
    // Sync orientation status to parent personnel record so it reflects on the Contractor Personnel list
    if (data.orientationCompletedAt) {
        await prisma.subcontractorPersonnel.update({
            where: { id: updated.personnelId },
            data: { orientationCompletedAt: new Date(data.orientationCompletedAt) }
        })
    }
    return updated
}

export async function removePersonnelJobAssignment(id: string, userRole: string) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Forbidden' }
    await prisma.subcontractorPersonnelJobAssignment.delete({ where: { id } })
    return { message: 'Deleted' }
}

export async function addPersonnelCertification(personnelId: string, userRole: string, data: { name: string; issuedAt: string; expiresAt: string; fileName?: string; filePath?: string }, uploaderId: string, uploaderName: string) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Forbidden' }
    const personnel = await prisma.subcontractorPersonnel.findUnique({ where: { id: personnelId } })
    if (!personnel) throw { status: 404, message: 'Personnel not found' }
    const status = certStatus(data.expiresAt)
    const cert = await prisma.subcontractorPersonnelCertification.create({
        data: {
            personnelId,
            name: data.name.trim(),
            issuedAt: data.issuedAt.trim(),
            expiresAt: data.expiresAt.trim(),
            status,
            fileName: data.fileName?.trim(),
            filePath: data.filePath?.trim(),
        }
    })

    // Auto-create a Certificate record so it shows on the main Certificates page
    try {
        await prisma.certificate.create({
            data: {
                name: data.name.trim(),
                holderName: personnel.name,
                holderUserId: null, // Personnel doesn't normally have a system User ID
                issueDate: data.issuedAt.trim() || null,
                expirationDate: data.expiresAt.trim(),
                uploadedById: uploaderId,
                uploadedBy: uploaderName || personnel.name,
                fileName: data.fileName?.trim() || null,
                filePath: data.filePath?.trim() || null,
            } as any,
        })
    } catch (e) {
        console.error('[subcontractorService] Failed to auto-create Certificate record for personnel:', e)
    }

    return cert
}

export async function updatePersonnelCertification(id: string, userRole: string, data: Partial<{ name: string; issuedAt: string; expiresAt: string }>) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Forbidden' }
    const existing = await prisma.subcontractorPersonnelCertification.findUnique({ where: { id } })
    if (!existing) throw { status: 404, message: 'Not found' }
    const expiresAt = data.expiresAt ?? existing.expiresAt
    const status = certStatus(expiresAt)
    const updatedCert = await prisma.subcontractorPersonnelCertification.update({
        where: { id },
        data: {
            ...(data.name !== undefined && { name: data.name.trim() }),
            ...(data.issuedAt !== undefined && { issuedAt: data.issuedAt.trim() }),
            ...(data.expiresAt !== undefined && { expiresAt: data.expiresAt.trim() }),
            status
        }
    })

    // Auto-update associated Certificate record
    try {
        const updateData: any = {}
        if (data.name !== undefined) updateData.name = data.name.trim()
        if (data.issuedAt !== undefined) updateData.issueDate = data.issuedAt.trim() || null
        if (data.expiresAt !== undefined) updateData.expirationDate = data.expiresAt.trim()

        if (Object.keys(updateData).length > 0) {
            if (existing.filePath) {
                await prisma.certificate.updateMany({
                    where: { filePath: existing.filePath } as any,
                    data: updateData
                })
            } else {
                await prisma.certificate.updateMany({
                    where: { name: existing.name } as any,
                    data: updateData
                })
            }
        }
    } catch (e) {
        console.error('[subcontractorService] Failed to auto-update Certificate record for personnel:', e)
    }

    return updatedCert
}

export async function removePersonnelCertification(id: string, userRole: string) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Forbidden' }
    const existing = await prisma.subcontractorPersonnelCertification.findUnique({ where: { id } })
    if (!existing) throw { status: 404, message: 'Not found' }

    await prisma.subcontractorPersonnelCertification.delete({ where: { id } })

    // Auto-delete metadata
    if (existing.filePath) {
        await prisma.certificate.deleteMany({
            where: { filePath: existing.filePath } as any
        })
    } else {
        await prisma.certificate.deleteMany({
            where: { name: existing.name } as any
        })
    }

    return { message: 'Deleted' }
}

export async function addPersonnelDocument(personnelId: string, userRole: string, data: { name: string; category: string; filePath: string }) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Forbidden' }
    return await prisma.subcontractorPersonnelDocument.create({
        data: {
            personnelId,
            name: data.name,
            category: data.category || 'contract',
            filePath: data.filePath,
        }
    })
}

export async function removePersonnelDocument(id: string, userRole: string) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Forbidden' }
    const doc = await prisma.subcontractorPersonnelDocument.findUnique({ where: { id } })
    if (!doc) throw { status: 404, message: 'Not found' }
    await prisma.subcontractorPersonnelDocument.delete({ where: { id } })
    return doc // return to controller so it can fs.unlink the file
}

export async function checkInSubcontractorPersonnel(personnelId: string, jobId: string, date: string, userRole: string) {
    if (userRole !== 'owner' && userRole !== 'hr' && userRole !== 'supervisor') throw { status: 403, message: 'Forbidden' }

    // Check if assignment exists
    const assignment = await prisma.subcontractorPersonnelJobAssignment.findUnique({
        where: { personnelId_jobId: { personnelId, jobId } }
    })
    if (!assignment) throw { status: 400, message: 'Worker is not assigned to this job' }

    return await prisma.subcontractorPersonnelCheckIn.create({
        data: {
            personnelId,
            jobId,
            date,
            checkedInAt: new Date(),
            checkedOutAt: null,
        }
    })
}

export async function checkOutSubcontractorPersonnel(personnelId: string, jobId: string, date: string, userRole: string) {
    if (userRole !== 'owner' && userRole !== 'hr' && userRole !== 'supervisor') throw { status: 403, message: 'Forbidden' }

    const existing = await prisma.subcontractorPersonnelCheckIn.findFirst({
        where: { personnelId, jobId, date, checkedOutAt: null },
        orderBy: { checkedInAt: 'desc' }
    })
    if (!existing) throw { status: 404, message: 'Not checked in' }

    return await prisma.subcontractorPersonnelCheckIn.update({
        where: { id: existing.id },
        data: { checkedOutAt: new Date() }
    })
}

export async function listSubcontractorPersonnelCheckIns(subcontractorId: string, userRole: string) {
    if (userRole !== 'owner' && userRole !== 'hr' && userRole !== 'supervisor') throw { status: 403, message: 'Forbidden' }

    const personnel = await prisma.subcontractorPersonnel.findMany({
        where: { subcontractorId },
        select: { id: true }
    })

    if (!personnel.length) return []

    return await prisma.subcontractorPersonnelCheckIn.findMany({
        where: { personnelId: { in: personnel.map(p => p.id) } },
        orderBy: { checkedInAt: 'desc' }
    })
}
