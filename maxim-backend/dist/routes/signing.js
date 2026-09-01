"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../middleware/authenticate");
const signingService_1 = require("../services/signingService");
const prisma_1 = require("../lib/prisma");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
router.get('/', async (req, res, next) => {
    try {
        const list = await (0, signingService_1.listSignatureRequests)(req.user.id, req.user.role);
        res.status(200).json(list);
    }
    catch (e) {
        next(e);
    }
});
router.get('/:id', async (req, res, next) => {
    try {
        const request = await (0, signingService_1.getSignatureRequestById)(req.params.id, req.user.id, req.user.role);
        res.status(200).json(request);
    }
    catch (e) {
        next(e);
    }
});
router.post('/:id/sign', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: userId },
            select: { firstName: true, lastName: true },
        });
        const userName = user ? `${user.firstName} ${user.lastName}` : 'Unknown';
        const result = await (0, signingService_1.signRequest)(req.params.id, userId, userName);
        res.status(200).json(result);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
