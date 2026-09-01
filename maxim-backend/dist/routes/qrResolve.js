"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const router = (0, express_1.Router)();
router.get('/:slug', async (req, res, next) => {
    try {
        const slug = String(req.params.slug || '').trim();
        if (!slug)
            return res.status(400).json({ error: 'slug is required' });
        const code = await prisma_1.prisma.formQrCode.findUnique({ where: { slug } });
        if (!code || !code.isActive)
            return res.status(404).json({ error: 'QR code not found or inactive' });
        await prisma_1.prisma.formQrCode.update({
            where: { id: code.id },
            data: {
                scanCount: { increment: 1 },
                lastScannedAt: new Date(),
            },
        });
        res.json({
            slug: code.slug,
            label: code.label,
            targetPath: code.targetPath,
        });
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
