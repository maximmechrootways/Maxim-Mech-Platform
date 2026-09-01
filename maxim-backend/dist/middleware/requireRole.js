"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = void 0;
/**
 * Middleware factory – restricts access to users whose JWT `role`
 * matches one of the allowed roles.
 *
 * Usage: `router.post('/invite', authenticate, requireRole('hr', 'owner'), handler)`
 */
const requireRole = (...roles) => {
    return (req, res, next) => {
        const userRole = req.user?.role;
        if (!userRole || !roles.includes(userRole)) {
            return res.status(403).json({ error: 'Forbidden: insufficient role' });
        }
        next();
    };
};
exports.requireRole = requireRole;
