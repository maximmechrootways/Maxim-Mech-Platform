import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import { listSignatureRequests, getSignatureRequestById, signRequest } from '../services/signingService'
import { prisma } from '../lib/prisma'

const router = Router()

router.use(authenticate)

router.get('/', async (req, res, next) => {
    try {
        const list = await listSignatureRequests(req.user!.id, req.user!.role)
        res.status(200).json(list)
    } catch (e) {
        next(e)
    }
})

router.get('/:id', async (req, res, next) => {
    try {
        const request = await getSignatureRequestById(req.params.id, req.user!.id, req.user!.role)
        res.status(200).json(request)
    } catch (e) {
        next(e)
    }
})

router.post('/:id/sign', async (req, res, next) => {
    try {
        const userId = req.user!.id
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { firstName: true, lastName: true },
        })
        const userName = user ? `${user.firstName} ${user.lastName}` : 'Unknown'
        const result = await signRequest(req.params.id, userId, userName)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

export default router
