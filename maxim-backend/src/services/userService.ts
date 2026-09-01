import { prisma } from '../lib/prisma'

function isMissingEmergencyContact2ColumnsError(err: unknown) {
    const msg = String((err as { message?: string })?.message ?? '')
    return msg.includes('emergencyContact2Name') || msg.includes('emergencyContact2Phone')
}

function isMissingEmergencyContactRelationshipColumnsError(err: unknown) {
    const msg = String((err as { message?: string })?.message ?? '')
    return msg.includes('emergencyContactRelationship') || msg.includes('emergencyContact2Relationship')
}

export async function listUsersForAssignment(userRole: string) {
    if (userRole !== 'owner' && userRole !== 'hr' && userRole !== 'supervisor' && userRole !== 'labourer') {
        throw { status: 403, message: 'Forbidden' }
    }
    const users = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, firstName: true, lastName: true, role: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })
    return users.map((u) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`,
        role: u.role,
    }))
}

export async function listSupervisors(userRole: string) {
    if (userRole !== 'owner' && userRole !== 'hr' && userRole !== 'supervisor' && userRole !== 'labourer') {
        throw { status: 403, message: 'Forbidden' }
    }
    const users = await prisma.user.findMany({
        where: {
            isActive: true,
            OR: [{ role: 'supervisor' }, { role: 'owner' }],
        },
        select: { id: true, firstName: true, lastName: true, role: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })
    return users.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`, role: u.role }))
}

/** Admin-only: list all users with id, email, name, role, isActive, createdAt */
export async function listAllUsersForAdmin(userRole: string) {
    if (userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can list all users' }
    let users: any[] = []
    try {
        users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                jobTitle: true,
                department: true,
                birthday: true,
                emergencyContactName: true,
                emergencyContactPhone: true,
                emergencyContactRelationship: true,
                emergencyContact2Name: true,
                emergencyContact2Phone: true,
                emergencyContact2Relationship: true,
                emergencyNotes: true,
                role: true,
                employmentStatus: true,
                onLeaveStartedAt: true,
                terminatedAt: true,
                isActive: true,
                hireDate: true,
                createdAt: true,
                lastLogin: true,
                // Needed by the frontend employee detail page to render current job assignments
                jobAssignments: {
                    select: {
                        id: true,
                        jobId: true,
                        job: {
                            select: {
                                title: true,
                                site: {
                                    select: { name: true },
                                },
                            },
                        },
                    },
                },
                jobSupervisorLinks: {
                    select: {
                        id: true,
                        jobId: true,
                        job: {
                            select: {
                                title: true,
                                site: {
                                    select: { name: true },
                                },
                            },
                        },
                    },
                },
            },
            orderBy: [{ isActive: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }],
        })
    } catch (err) {
        if (isMissingEmergencyContactRelationshipColumnsError(err)) {
            try {
                users = await prisma.user.findMany({
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        phone: true,
                        jobTitle: true,
                        department: true,
                        birthday: true,
                        emergencyContactName: true,
                        emergencyContactPhone: true,
                        emergencyContact2Name: true,
                        emergencyContact2Phone: true,
                        emergencyNotes: true,
                        role: true,
                        employmentStatus: true,
                        onLeaveStartedAt: true,
                        terminatedAt: true,
                        isActive: true,
                        hireDate: true,
                        createdAt: true,
                        lastLogin: true,
                        jobAssignments: {
                            select: {
                                id: true,
                                jobId: true,
                                job: {
                                    select: {
                                        title: true,
                                        site: {
                                            select: { name: true },
                                        },
                                    },
                                },
                            },
                        },
                        jobSupervisorLinks: {
                            select: {
                                id: true,
                                jobId: true,
                                job: {
                                    select: {
                                        title: true,
                                        site: {
                                            select: { name: true },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    orderBy: [{ isActive: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }],
                })
            } catch (err2) {
                if (!isMissingEmergencyContact2ColumnsError(err2)) throw err2
                users = await prisma.user.findMany({
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        phone: true,
                        jobTitle: true,
                        department: true,
                        birthday: true,
                        emergencyContactName: true,
                        emergencyContactPhone: true,
                        emergencyNotes: true,
                        role: true,
                        employmentStatus: true,
                        onLeaveStartedAt: true,
                        terminatedAt: true,
                        isActive: true,
                        hireDate: true,
                        createdAt: true,
                        lastLogin: true,
                        jobAssignments: {
                            select: {
                                id: true,
                                jobId: true,
                                job: {
                                    select: {
                                        title: true,
                                        site: {
                                            select: { name: true },
                                        },
                                    },
                                },
                            },
                        },
                        jobSupervisorLinks: {
                            select: {
                                id: true,
                                jobId: true,
                                job: {
                                    select: {
                                        title: true,
                                        site: {
                                            select: { name: true },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    orderBy: [{ isActive: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }],
                })
            }
        } else if (isMissingEmergencyContact2ColumnsError(err)) {
        // Compatibility fallback while DB migration is pending.
        users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                jobTitle: true,
                department: true,
                birthday: true,
                emergencyContactName: true,
                emergencyContactPhone: true,
                emergencyNotes: true,
                role: true,
                employmentStatus: true,
                onLeaveStartedAt: true,
                terminatedAt: true,
                isActive: true,
                hireDate: true,
                createdAt: true,
                lastLogin: true,
                jobAssignments: {
                    select: {
                        id: true,
                        jobId: true,
                        job: {
                            select: {
                                title: true,
                                site: {
                                    select: { name: true },
                                },
                            },
                        },
                    },
                },
                jobSupervisorLinks: {
                    select: {
                        id: true,
                        jobId: true,
                        job: {
                            select: {
                                title: true,
                                site: {
                                    select: { name: true },
                                },
                            },
                        },
                    },
                },
            },
            orderBy: [{ isActive: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }],
        })
        } else {
            throw err
        }
    }
    return users.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        name: `${u.firstName} ${u.lastName}`,
        phone: u.phone ?? undefined,
        jobTitle: u.jobTitle ?? undefined,
        department: u.department ?? undefined,
        birthday: u.birthday?.toISOString?.().slice(0, 10) ?? undefined,
        emergencyContact1Name: u.emergencyContactName ?? undefined,
        emergencyContact1Phone: u.emergencyContactPhone ?? undefined,
        emergencyContact1Relationship: u.emergencyContactRelationship ?? undefined,
        emergencyContact2Name: u.emergencyContact2Name ?? undefined,
        emergencyContact2Phone: u.emergencyContact2Phone ?? undefined,
        emergencyContact2Relationship: u.emergencyContact2Relationship ?? undefined,
        emergencyNotes: u.emergencyNotes ?? undefined,
        role: u.role,
        employmentStatus: u.employmentStatus ?? (u.isActive ? 'active' : 'terminated'),
        onLeaveStartedAt: u.onLeaveStartedAt?.toISOString?.() ?? undefined,
        terminatedAt: u.terminatedAt?.toISOString?.() ?? undefined,
        isActive: u.isActive,
        hireDate: u.hireDate?.toISOString?.() ?? null,
        createdAt: u.createdAt?.toISOString?.() ?? null,
        lastLogin: u.lastLogin?.toISOString?.() ?? null,
        jobAssignments: u.jobAssignments,
        jobSupervisorLinks: u.jobSupervisorLinks,
    }))
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Owner/HR: update employee (email, firstName, lastName, phone, jobTitle, department, role, employmentStatus, onLeaveStartedAt, terminatedAt, isActive) */
export async function updateUserForAdmin(adminRole: string, targetUserId: string, data: {
    email?: string
    firstName?: string
    lastName?: string
    phone?: string
    jobTitle?: string
    department?: string
    birthday?: string | null
    emergencyContact1Name?: string | null
    emergencyContact1Phone?: string | null
    emergencyContact1Relationship?: string | null
    emergencyContact2Name?: string | null
    emergencyContact2Phone?: string | null
    emergencyContact2Relationship?: string | null
    // Backward compatibility with older payload shape.
    emergencyContactName?: string | null
    emergencyContactPhone?: string | null
    emergencyNotes?: string | null
    role?: string
    employmentStatus?: string
    hireDate?: string | null
    onLeaveStartedAt?: string | null
    terminatedAt?: string | null
    isActive?: boolean
}) {
    if (adminRole !== 'owner' && adminRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can update employees' }
    const existing = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, role: true, email: true },
    })
    if (!existing) throw { status: 404, message: 'User not found' }
    if (existing.role === 'owner') {
        if (data.employmentStatus === 'terminated' || data.isActive === false) {
            throw { status: 400, message: 'The account owner cannot be deactivated' }
        }
    }
    const updateData: Record<string, unknown> = {}
    let nextEmail: string | null = null
    if (data.email !== undefined) {
        const normalized = data.email.trim().toLowerCase()
        if (!normalized || !EMAIL_RE.test(normalized) || normalized.length > 254) {
            throw { status: 400, message: 'Enter a valid email address' }
        }
        if (normalized !== existing.email.toLowerCase()) {
            const taken = await prisma.user.findUnique({
                where: { email: normalized },
                select: { id: true },
            })
            if (taken && taken.id !== targetUserId) {
                throw { status: 409, message: 'Another employee already uses that email' }
            }
            updateData.email = normalized
            nextEmail = normalized
        }
    }
    if (data.firstName !== undefined) updateData.firstName = data.firstName.trim()
    if (data.lastName !== undefined) updateData.lastName = data.lastName.trim()
    if (data.phone !== undefined) updateData.phone = data.phone?.trim() || null
    if (data.jobTitle !== undefined) updateData.jobTitle = data.jobTitle?.trim() || null
    if (data.department !== undefined) updateData.department = data.department?.trim() || null
    if (data.birthday !== undefined) {
        if (data.birthday == null || String(data.birthday).trim() === '') {
            updateData.birthday = null
        } else {
            const s = String(data.birthday).trim().slice(0, 10)
            if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
                throw { status: 400, message: 'birthday must be YYYY-MM-DD' }
            }
            updateData.birthday = new Date(`${s}T12:00:00.000Z`)
        }
    }
    const contact1Name = data.emergencyContact1Name ?? data.emergencyContactName
    const contact1Phone = data.emergencyContact1Phone ?? data.emergencyContactPhone
    if (contact1Name !== undefined) updateData.emergencyContactName = contact1Name?.trim() || null
    if (contact1Phone !== undefined) updateData.emergencyContactPhone = contact1Phone?.trim() || null
    if (data.emergencyContact2Name !== undefined) updateData.emergencyContact2Name = data.emergencyContact2Name?.trim() || null
    if (data.emergencyContact2Phone !== undefined) updateData.emergencyContact2Phone = data.emergencyContact2Phone?.trim() || null
    if (data.emergencyContact1Relationship !== undefined) {
        updateData.emergencyContactRelationship = data.emergencyContact1Relationship?.trim() || null
    }
    if (data.emergencyContact2Relationship !== undefined) {
        updateData.emergencyContact2Relationship = data.emergencyContact2Relationship?.trim() || null
    }
    if (data.emergencyNotes !== undefined) updateData.emergencyNotes = data.emergencyNotes?.trim() || null
    if (data.role !== undefined && existing.role !== 'owner') {
        const r = data.role.toLowerCase()
        if (r !== 'labourer' && r !== 'supervisor' && r !== 'hr') throw { status: 400, message: 'Role can only be set to Labourer, Supervisor, or HR' }
        updateData.role = r
    }
    if (data.employmentStatus !== undefined) {
        updateData.employmentStatus = data.employmentStatus
        if (data.employmentStatus === 'terminated') updateData.isActive = false
        else updateData.isActive = true
    }
    if (data.hireDate !== undefined) {
        if (data.hireDate == null || String(data.hireDate).trim() === '') {
            updateData.hireDate = null
        } else {
            const s = String(data.hireDate).trim().slice(0, 10)
            if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
                throw { status: 400, message: 'hireDate must be YYYY-MM-DD' }
            }
            updateData.hireDate = new Date(`${s}T12:00:00.000Z`)
        }
    }
    if (data.onLeaveStartedAt !== undefined) updateData.onLeaveStartedAt = data.onLeaveStartedAt ? new Date(data.onLeaveStartedAt) : null
    if (data.terminatedAt !== undefined) updateData.terminatedAt = data.terminatedAt ? new Date(data.terminatedAt) : null
    if (data.isActive !== undefined) {
        if (existing.role === 'owner' && data.isActive === false) {
            throw { status: 400, message: 'The account owner cannot be deactivated' }
        }
        updateData.isActive = data.isActive
    }
    let updated: any
    const selectFull = {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        jobTitle: true,
        department: true,
        birthday: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        emergencyContactRelationship: true,
        emergencyContact2Name: true,
        emergencyContact2Phone: true,
        emergencyContact2Relationship: true,
        emergencyNotes: true,
        role: true,
        employmentStatus: true,
        onLeaveStartedAt: true,
        terminatedAt: true,
        isActive: true,
        hireDate: true,
        createdAt: true,
        lastLogin: true,
    } as const
    const selectNoRelationship = {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        jobTitle: true,
        department: true,
        birthday: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        emergencyContact2Name: true,
        emergencyContact2Phone: true,
        emergencyNotes: true,
        role: true,
        employmentStatus: true,
        onLeaveStartedAt: true,
        terminatedAt: true,
        isActive: true,
        hireDate: true,
        createdAt: true,
        lastLogin: true,
    } as const
    const selectMinimal = {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        jobTitle: true,
        department: true,
        birthday: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        emergencyNotes: true,
        role: true,
        employmentStatus: true,
        onLeaveStartedAt: true,
        terminatedAt: true,
        isActive: true,
        hireDate: true,
        createdAt: true,
        lastLogin: true,
    } as const
    try {
        updated = await prisma.user.update({
            where: { id: targetUserId },
            data: updateData,
            select: selectFull,
        })
    } catch (err) {
        if (isMissingEmergencyContactRelationshipColumnsError(err)) {
            delete updateData.emergencyContactRelationship
            delete updateData.emergencyContact2Relationship
            try {
                updated = await prisma.user.update({
                    where: { id: targetUserId },
                    data: updateData,
                    select: selectNoRelationship,
                })
            } catch (err2) {
                if (!isMissingEmergencyContact2ColumnsError(err2)) throw err2
                delete updateData.emergencyContact2Name
                delete updateData.emergencyContact2Phone
                updated = await prisma.user.update({
                    where: { id: targetUserId },
                    data: updateData,
                    select: selectMinimal,
                })
            }
        } else if (isMissingEmergencyContact2ColumnsError(err)) {
            delete updateData.emergencyContact2Name
            delete updateData.emergencyContact2Phone
            delete updateData.emergencyContactRelationship
            delete updateData.emergencyContact2Relationship
            updated = await prisma.user.update({
                where: { id: targetUserId },
                data: updateData,
                select: selectMinimal,
            })
        } else {
            const code = (err as { code?: string })?.code
            if (code === 'P2002' && nextEmail) {
                throw { status: 409, message: 'Another employee already uses that email' }
            }
            throw err
        }
    }
    if (nextEmail && existing.email && nextEmail !== existing.email.toLowerCase()) {
        await prisma.inviteCode.updateMany({
            where: { email: existing.email.toLowerCase(), isUsed: false },
            data: { email: nextEmail },
        })
    }
    return {
        id: updated.id,
        email: updated.email,
        firstName: updated.firstName,
        lastName: updated.lastName,
        name: `${updated.firstName} ${updated.lastName}`,
        phone: updated.phone ?? undefined,
        jobTitle: updated.jobTitle ?? undefined,
        department: updated.department ?? undefined,
        birthday: updated.birthday?.toISOString?.().slice(0, 10) ?? undefined,
        emergencyContact1Name: updated.emergencyContactName ?? undefined,
        emergencyContact1Phone: updated.emergencyContactPhone ?? undefined,
        emergencyContact1Relationship: updated.emergencyContactRelationship ?? undefined,
        emergencyContact2Name: updated.emergencyContact2Name ?? undefined,
        emergencyContact2Phone: updated.emergencyContact2Phone ?? undefined,
        emergencyContact2Relationship: updated.emergencyContact2Relationship ?? undefined,
        emergencyNotes: updated.emergencyNotes ?? undefined,
        role: updated.role,
        employmentStatus: updated.employmentStatus ?? (updated.isActive ? 'active' : 'terminated'),
        onLeaveStartedAt: updated.onLeaveStartedAt?.toISOString?.() ?? undefined,
        terminatedAt: updated.terminatedAt?.toISOString?.() ?? undefined,
        isActive: updated.isActive,
        hireDate: updated.hireDate?.toISOString?.() ?? null,
        createdAt: updated.createdAt?.toISOString?.() ?? null,
        lastLogin: updated.lastLogin?.toISOString?.() ?? null,
    }
}

/** Owner/HR: permanently delete an employee profile when safe to do so. */
export async function deleteUserForAdmin(adminRole: string, adminUserId: string, targetUserId: string) {
    if (adminRole !== 'owner' && adminRole !== 'hr') throw { status: 403, message: 'Only Owner or HR can delete employees' }
    if (adminUserId === targetUserId) throw { status: 400, message: 'You cannot delete your own profile' }

    const existing = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, role: true, firstName: true, lastName: true }
    })
    if (!existing) throw { status: 404, message: 'User not found' }
    if (existing.role === 'owner') throw { status: 400, message: 'Owner profiles cannot be deleted' }

    try {
        await prisma.user.delete({ where: { id: targetUserId } })
    } catch (e: any) {
        if (e?.code === 'P2003') {
            throw {
                status: 409,
                message: 'This profile is linked to records that must be reassigned or removed first.'
            }
        }
        throw e
    }

    return {
        id: existing.id,
        name: `${existing.firstName} ${existing.lastName}`.trim() || existing.id,
    }
}
