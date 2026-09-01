"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../middleware/authenticate");
const validate_1 = require("../utils/validate");
const siteService_1 = require("../services/siteService");
const siteSchemas_1 = require("../schemas/siteSchemas");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
router.get('/', async (req, res, next) => {
    try {
        const activeOnly = req.query.activeOnly !== 'false';
        const sites = await (0, siteService_1.listSites)(activeOnly);
        res.status(200).json(sites);
    }
    catch (e) {
        next(e);
    }
});
router.get('/:id', async (req, res, next) => {
    try {
        const site = await (0, siteService_1.getSiteById)(req.params.id);
        res.status(200).json(site);
    }
    catch (e) {
        next(e);
    }
});
router.post('/', (0, validate_1.validateRequest)(siteSchemas_1.createSiteSchema), async (req, res, next) => {
    try {
        const role = req.user.role;
        const site = await (0, siteService_1.createSite)(role, req.body);
        res.status(201).json(site);
    }
    catch (e) {
        next(e);
    }
});
router.patch('/:id', async (req, res, next) => {
    try {
        const role = req.user.role;
        const site = await (0, siteService_1.updateSite)(req.params.id, role, req.body);
        res.status(200).json(site);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:id', async (req, res, next) => {
    try {
        const role = req.user.role;
        const result = await (0, siteService_1.deleteSite)(req.params.id, role);
        res.status(200).json(result);
    }
    catch (e) {
        next(e);
    }
});
router.post('/:id/supervisors', async (req, res, next) => {
    try {
        const userId = req.body?.userId;
        if (!userId || typeof userId !== 'string')
            return res.status(400).json({ error: 'userId required' });
        const role = req.user.role;
        const result = await (0, siteService_1.addSiteSupervisor)(req.params.id, userId, role);
        res.status(201).json(result);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:id/supervisors/:userId', async (req, res, next) => {
    try {
        const role = req.user.role;
        await (0, siteService_1.removeSiteSupervisor)(req.params.id, req.params.userId, role);
        res.status(200).json({ ok: true });
    }
    catch (e) {
        next(e);
    }
});
router.post('/:id/labourers', async (req, res, next) => {
    try {
        const userId = req.body?.userId;
        if (!userId || typeof userId !== 'string')
            return res.status(400).json({ error: 'userId required' });
        const role = req.user.role;
        const result = await (0, siteService_1.addSiteLabourer)(req.params.id, userId, req.user.id, role);
        res.status(201).json(result);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:id/labourers/:userId', async (req, res, next) => {
    try {
        const role = req.user.role;
        await (0, siteService_1.removeSiteLabourer)(req.params.id, req.params.userId, role);
        res.status(200).json({ ok: true });
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
