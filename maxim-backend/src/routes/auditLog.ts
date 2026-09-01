import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import * as auditLogService from '../services/auditLogService'

const router = Router()
router.use(authenticate)

router.get('/', async (req, res, next) => {
    try {
        const role = req.user!.role
        if (role !== 'owner' && role !== 'hr') {
            return res.status(403).json({ error: 'Only Owner or HR can view audit log' })
        }
        const result = await auditLogService.listAuditLogs({
            entityType: req.query.entityType as string,
            entityId: req.query.entityId as string,
            userId: req.query.userId as string,
            from: req.query.from as string,
            to: req.query.to as string,
            limit: req.query.limit ? Number(req.query.limit) : undefined,
            offset: req.query.offset ? Number(req.query.offset) : undefined,
            sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
        })
        res.json(result)
    } catch (e) { next(e) }
})

export default router
