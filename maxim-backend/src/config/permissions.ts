/**
 * Role-by-feature matrix for admin UI and API checks.
 * Keys are feature identifiers; values are roles that can access (e.g. view, manage).
 */

export type Role = 'owner' | 'hr' | 'supervisor' | 'labourer' | 'user'

export interface FeaturePermission {
    feature: string
    label: string
    /** Roles that can view/access this feature */
    viewRoles: Role[]
    /** Roles that can create/edit/delete (subset or same as viewRoles) */
    manageRoles?: Role[]
}

export const PERMISSIONS: FeaturePermission[] = [
    { feature: 'dashboard', label: 'Dashboard', viewRoles: ['owner', 'hr', 'supervisor', 'labourer', 'user'], manageRoles: [] },
    { feature: 'jobs', label: 'Jobs', viewRoles: ['owner', 'hr', 'supervisor'], manageRoles: ['owner', 'hr', 'supervisor'] },
    { feature: 'sites', label: 'Sites', viewRoles: ['owner', 'hr', 'supervisor'], manageRoles: ['owner', 'hr'] },
    { feature: 'subcontractors', label: 'Subcontractors', viewRoles: ['owner', 'hr', 'supervisor'], manageRoles: ['owner', 'hr'] },
    { feature: 'incidents', label: 'Incidents', viewRoles: ['owner', 'hr', 'supervisor'], manageRoles: ['owner', 'hr', 'supervisor'] },
    { feature: 'near_miss', label: 'Near Miss', viewRoles: ['owner', 'hr', 'supervisor'], manageRoles: ['owner', 'hr', 'supervisor'] },
    { feature: 'hazards', label: 'Hazards', viewRoles: ['owner', 'hr', 'supervisor'], manageRoles: ['owner', 'hr', 'supervisor'] },
    { feature: 'observations', label: 'Observations', viewRoles: ['owner', 'hr', 'supervisor'], manageRoles: ['owner', 'hr', 'supervisor'] },
    { feature: 'capa', label: 'CAPA', viewRoles: ['owner', 'hr', 'supervisor'], manageRoles: ['owner', 'hr', 'supervisor'] },
    { feature: 'safety_alerts', label: 'Safety Alerts', viewRoles: ['owner', 'hr', 'supervisor', 'labourer', 'user'], manageRoles: ['owner', 'hr'] },
    { feature: 'inspections', label: 'Inspections', viewRoles: ['owner', 'hr', 'supervisor'], manageRoles: [] },
    { feature: 'compliance_calendar', label: 'Compliance Calendar', viewRoles: ['owner', 'hr', 'supervisor'], manageRoles: [] },
    { feature: 'hr_todo', label: 'HR Todo', viewRoles: ['owner', 'hr'], manageRoles: ['owner', 'hr'] },
    { feature: 'injury_reports', label: 'Injury Reports', viewRoles: ['owner', 'hr', 'supervisor'], manageRoles: ['owner', 'hr', 'supervisor'] },
    { feature: 'certificates', label: 'Certificates', viewRoles: ['owner', 'hr', 'supervisor'], manageRoles: ['owner', 'hr'] },
    { feature: 'documents', label: 'Documents', viewRoles: ['owner', 'hr', 'supervisor', 'labourer', 'user'], manageRoles: ['owner', 'hr', 'supervisor'] },
    { feature: 'library_documents', label: 'Library Documents', viewRoles: ['owner', 'hr', 'supervisor', 'labourer', 'user'], manageRoles: ['owner', 'hr'] },
    { feature: 'templates', label: 'Templates & Signable Forms', viewRoles: ['owner', 'hr'], manageRoles: ['owner', 'hr'] },
    { feature: 'submissions', label: 'Form Submissions', viewRoles: ['owner', 'hr', 'supervisor'], manageRoles: ['owner', 'hr', 'supervisor'] },
    { feature: 'users', label: 'User Management', viewRoles: ['owner', 'hr'], manageRoles: ['owner', 'hr'] },
    { feature: 'audit_log', label: 'Audit Log', viewRoles: ['owner', 'hr'], manageRoles: [] },
    { feature: 'notifications', label: 'Notifications (Admin)', viewRoles: ['owner', 'hr'], manageRoles: [] },
    { feature: 'permissions', label: 'Permissions Matrix', viewRoles: ['owner', 'hr'], manageRoles: ['owner'] },
]

export function getPermissionsMatrix() {
    return PERMISSIONS
}

export function canViewFeature(role: string, feature: string): boolean {
    const perm = PERMISSIONS.find((p) => p.feature === feature)
    if (!perm) return false
    return perm.viewRoles.includes(role as Role)
}

export function canManageFeature(role: string, feature: string): boolean {
    const perm = PERMISSIONS.find((p) => p.feature === feature)
    if (!perm) return false
    const manageRoles = perm.manageRoles ?? perm.viewRoles
    return manageRoles.includes(role as Role)
}
