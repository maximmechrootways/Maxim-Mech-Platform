import { Router } from 'express'
import { prisma } from '../lib/prisma'

const router = Router()

router.get('/:slug', async (req, res, next) => {
    try {
        const slug = String(req.params.slug || '').trim()
        if (!slug) return res.status(400).json({ error: 'slug is required' })

        const code = await prisma.formQrCode.findUnique({ where: { slug } })
        if (!code || !code.isActive) return res.status(404).json({ error: 'QR code not found or inactive' })

        await prisma.formQrCode.update({
            where: { id: code.id },
            data: {
                scanCount: { increment: 1 },
                lastScannedAt: new Date(),
            },
        })

        res.json({
            slug: code.slug,
            label: code.label,
            targetPath: code.targetPath,
        })
    } catch (e) {
        next(e)
    }
})

export default router
