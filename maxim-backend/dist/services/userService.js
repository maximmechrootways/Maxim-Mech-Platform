"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listUsersForAssignment = listUsersForAssignment;
exports.listSupervisors = listSupervisors;
exports.listAllUsersForAdmin = listAllUsersForAdmin;
exports.updateUserForAdmin = updateUserForAdmin;
exports.deleteUserForAdmin = deleteUserForAdmin;
const prisma_1 = require("../lib/prisma");
function isMissingEmergencyContact2ColumnsError(err) {
    const msg = String(err?.message ?? '');
    return msg.includes('emergencyContact2Name') || msg.includes('emergencyContact2Phone');
}
function isMissingEmergencyContactRelationshipColumnsError(err) {
    const msg = String(err?.message ?? '');
    return msg.includes('emergencyContactRelationship') || msg.includes('emergencyContact2Relationship');
}
async function listUsersForAssignment(userRole) {
    if (userRole !== 'owner' && userRole !== 'hr' && userRole !== 'supervisor' && userRole !== 'labourer') {
        throw { status: 403, message: 'Forbidden' };
    }
    const users = await prisma_1.prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, firstName: true, lastName: true, role: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return users.map((u) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`,
        role: u.role,
    }));
}
async function listSupervisors(userRole) {
    if (userRole !== 'owner' && userRole !== 'hr' && userRole !== 'supervisor' && userRole !== 'labourer') {
        throw { status: 403, message: 'Forbidden' };
    }
    const users = await prisma_1.prisma.user.findMany({
        where: {
            isActive: true,
            OR: [{ role: 'supervisor' }, { role: 'owner' }],
        },
        select: { id: true, firstName: true, lastName: true, role: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return users.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`, role: u.role }));
}
/** Admin-only: list all users with id, email, name, role, isActive, createdAt */
async function listAllUsersForAdmin(userRole) {
    if (userRole !== 'owner' && userRole !== 'hr')
        throw { status: 403, message: 'Only Owner or HR can list all users' };
    let users = [];
    try {
        users = await prisma_1.prisma.user.findMany({
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
        });
    }
    catch (err) {
        if (isMissingEmergencyContactRelationshipColumnsError(err)) {
            try {
                users = await prisma_1.prisma.user.findMany({
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
                });
            }
            catch (err2) {
                if (!isMissingEmergencyContact2ColumnsError(err2))
                    throw err2;
                users = await prisma_1.prisma.user.findMany({
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
                });
            }
        }
        else if (isMissingEmergencyContact2ColumnsError(err)) {
            // Compatibility fallback while DB migration is pending.
            users = await prisma_1.prisma.user.findMany({
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
            });
        }
        else {
            throw err;
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
    }));
}
/** Owner/HR: update employee (firstName, lastName, phone, jobTitle, department, role, employmentStatus, onLeaveStartedAt, terminatedAt, isActive) */
async function updateUserForAdmin(adminRole, targetUserId, data) {
    if (adminRole !== 'owner' && adminRole !== 'hr')
        throw { status: 403, message: 'Only Owner or HR can update employees' };
    const existing = await prisma_1.prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, role: true },
    });
    if (!existing)
        throw { status: 404, message: 'User not found' };
    if (existing.role === 'owner') {
        if (data.employmentStatus === 'terminated' || data.isActive === false) {
            throw { status: 400, message: 'The account owner cannot be deactivated' };
        }
    }
    const updateData = {};
    if (data.firstName !== undefined)
        updateData.firstName = data.firstName.trim();
    if (data.lastName !== undefined)
        updateData.lastName = data.lastName.trim();
    if (data.phone !== undefined)
        updateData.phone = data.phone?.trim() || null;
    if (data.jobTitle !== undefined)
        updateData.jobTitle = data.jobTitle?.trim() || null;
    if (data.department !== undefined)
        updateData.department = data.department?.trim() || null;
    if (data.birthday !== undefined) {
        if (data.birthday == null || String(data.birthday).trim() === '') {
            updateData.birthday = null;
        }
        else {
            const s = String(data.birthday).trim().slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
                throw { status: 400, message: 'birthday must be YYYY-MM-DD' };
            }
            updateData.birthday = new Date(`${s}T12:00:00.000Z`);
        }
    }
    const contact1Name = data.emergencyContact1Name ?? data.emergencyContactName;
    const contact1Phone = data.emergencyContact1Phone ?? data.emergencyContactPhone;
    if (contact1Name !== undefined)
        updateData.emergencyContactName = contact1Name?.trim() || null;
    if (contact1Phone !== undefined)
        updateData.emergencyContactPhone = contact1Phone?.trim() || null;
    if (data.emergencyContact2Name !== undefined)
        updateData.emergencyContact2Name = data.emergencyContact2Name?.trim() || null;
    if (data.emergencyContact2Phone !== undefined)
        updateData.emergencyContact2Phone = data.emergencyContact2Phone?.trim() || null;
    if (data.emergencyContact1Relationship !== undefined) {
        updateData.emergencyContactRelationship = data.emergencyContact1Relationship?.trim() || null;
    }
    if (data.emergencyContact2Relationship !== undefined) {
        updateData.emergencyContact2Relationship = data.emergencyContact2Relationship?.trim() || null;
    }
    if (data.emergencyNotes !== undefined)
        updateData.emergencyNotes = data.emergencyNotes?.trim() || null;
    if (data.role !== undefined && existing.role !== 'owner') {
        const r = data.role.toLowerCase();
        if (r !== 'labourer' && r !== 'supervisor' && r !== 'hr')
            throw { status: 400, message: 'Role can only be set to Labourer, Supervisor, or HR' };
        updateData.role = r;
    }
    if (data.employmentStatus !== undefined) {
        updateData.employmentStatus = data.employmentStatus;
        if (data.employmentStatus === 'terminated')
            updateData.isActive = false;
        else
            updateData.isActive = true;
    }
    if (data.hireDate !== undefined) {
        if (data.hireDate == null || String(data.hireDate).trim() === '') {
            updateData.hireDate = null;
        }
        else {
            const s = String(data.hireDate).trim().slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
                throw { status: 400, message: 'hireDate must be YYYY-MM-DD' };
            }
            updateData.hireDate = new Date(`${s}T12:00:00.000Z`);
        }
    }
    if (data.onLeaveStartedAt !== undefined)
        updateData.onLeaveStartedAt = data.onLeaveStartedAt ? new Date(data.onLeaveStartedAt) : null;
    if (data.terminatedAt !== undefined)
        updateData.terminatedAt = data.terminatedAt ? new Date(data.terminatedAt) : null;
    if (data.isActive !== undefined) {
        if (existing.role === 'owner' && data.isActive === false) {
            throw { status: 400, message: 'The account owner cannot be deactivated' };
        }
        updateData.isActive = data.isActive;
    }
    let updated;
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
    };
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
    };
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
    };
    try {
        updated = await prisma_1.prisma.user.update({
            where: { id: targetUserId },
            data: updateData,
            select: selectFull,
        });
    }
    catch (err) {
        if (isMissingEmergencyContactRelationshipColumnsError(err)) {
            delete updateData.emergencyContactRelationship;
            delete updateData.emergencyContact2Relationship;
            try {
                updated = await prisma_1.prisma.user.update({
                    where: { id: targetUserId },
                    data: updateData,
                    select: selectNoRelationship,
                });
            }
            catch (err2) {
                if (!isMissingEmergencyContact2ColumnsError(err2))
                    throw err2;
                delete updateData.emergencyContact2Name;
                delete updateData.emergencyContact2Phone;
                updated = await prisma_1.prisma.user.update({
                    where: { id: targetUserId },
                    data: updateData,
                    select: selectMinimal,
                });
            }
        }
        else if (isMissingEmergencyContact2ColumnsError(err)) {
            delete updateData.emergencyContact2Name;
            delete updateData.emergencyContact2Phone;
            delete updateData.emergencyContactRelationship;
            delete updateData.emergencyContact2Relationship;
            updated = await prisma_1.prisma.user.update({
                where: { id: targetUserId },
                data: updateData,
                select: selectMinimal,
            });
        }
        else {
            throw err;
        }
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
    };
}
/** Owner/HR: permanently delete an employee profile when safe to do so. */
async function deleteUserForAdmin(adminRole, adminUserId, targetUserId) {
    if (adminRole !== 'owner' && adminRole !== 'hr')
        throw { status: 403, message: 'Only Owner or HR can delete employees' };
    if (adminUserId === targetUserId)
        throw { status: 400, message: 'You cannot delete your own profile' };
    const existing = await prisma_1.prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, role: true, firstName: true, lastName: true }
    });
    if (!existing)
        throw { status: 404, message: 'User not found' };
    if (existing.role === 'owner')
        throw { status: 400, message: 'Owner profiles cannot be deleted' };
    try {
        await prisma_1.prisma.user.delete({ where: { id: targetUserId } });
    }
    catch (e) {
        if (e?.code === 'P2003') {
            throw {
                status: 409,
                message: 'This profile is linked to records that must be reassigned or removed first.'
            };
        }
        throw e;
    }
    return {
        id: existing.id,
        name: `${existing.firstName} ${existing.lastName}`.trim() || existing.id,
    };
}
