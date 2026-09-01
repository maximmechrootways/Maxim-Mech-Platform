"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const nanoid_1 = require("nanoid");
const prisma_1 = require("../lib/prisma");
const authenticate_1 = require("../middleware/authenticate");
const requireRole_1 = require("../middleware/requireRole");
const router = (0, express_1.Router)();
const nanoid = (0, nanoid_1.customAlphabet)('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', 10);
function normalizeTargetPath(raw) {
    const value = String(raw || '').trim();
    if (!value.startsWith('/'))
        return null;
    if (value.startsWith('//'))
        return null;
    return value;
}
router.use(authenticate_1.authenticate);
router.use((0, requireRole_1.requireRole)('owner', 'hr'));
router.get('/', async (_req, res, next) => {
    try {
        const items = await prisma_1.prisma.formQrCode.findMany({
            orderBy: [{ label: 'asc' }, { createdAt: 'desc' }],
        });
        res.json(items);
    }
    catch (e) {
        next(e);
    }
});
router.post('/', async (req, res, next) => {
    try {
        const label = String(req.body?.label || '').trim();
        const targetPath = normalizeTargetPath(req.body?.targetPath);
        if (!label)
            return res.status(400).json({ error: 'label is required' });
        if (!targetPath)
            return res.status(400).json({ error: 'targetPath must start with /' });
        let created = null;
        for (let i = 0; i < 5; i++) {
            try {
                created = await prisma_1.prisma.formQrCode.create({
                    data: {
                        label,
                        targetPath,
                        slug: nanoid(),
                        createdById: req.user.id,
                        isActive: req.body?.isActive !== false,
                    },
                });
                break;
            }
            catch (error) {
                if (error?.code !== 'P2002')
                    throw error;
            }
        }
        if (!created)
            return res.status(500).json({ error: 'Could not allocate QR slug' });
        res.status(201).json(created);
    }
    catch (e) {
        next(e);
    }
});
router.patch('/:id', async (req, res, next) => {
    try {
        const data = {};
        if (typeof req.body?.label === 'string')
            data.label = req.body.label.trim();
        if (typeof req.body?.targetPath === 'string') {
            const targetPath = normalizeTargetPath(req.body.targetPath);
            if (!targetPath)
                return res.status(400).json({ error: 'targetPath must start with /' });
            data.targetPath = targetPath;
        }
        if (typeof req.body?.isActive === 'boolean')
            data.isActive = req.body.isActive;
        const updated = await prisma_1.prisma.formQrCode.update({
            where: { id: req.params.id },
            data,
        });
        res.json(updated);
    }
    catch (e) {
        if (e?.code === 'P2025')
            return res.status(404).json({ error: 'QR code not found' });
        next(e);
    }
});
exports.default = router;
