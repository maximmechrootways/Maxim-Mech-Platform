import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import { getPermissionsMatrix } from '../config/permissions'

const router = Router()
router.use(authenticate)

router.get('/', async (req, res, next) => {
    try {
        const role = req.user!.role
        if (role !== 'owner' && role !== 'hr') {
            return res.status(403).json({ error: 'Only Owner or HR can view permissions matrix' })
        }
        const matrix = getPermissionsMatrix()
        res.json(matrix)
    } catch (e) { next(e) }
})

export default router
