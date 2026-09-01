/**
 * Context passed to Frank connectors. Same as the authenticated request user.
 */
export interface FrankContext {
    userId: string
    userRole: string
    userEmail: string
}
