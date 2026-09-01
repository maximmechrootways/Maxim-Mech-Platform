"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../middleware/authenticate");
const permissions_1 = require("../config/permissions");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
router.get('/', async (req, res, next) => {
    try {
        const role = req.user.role;
        if (role !== 'owner' && role !== 'hr') {
            return res.status(403).json({ error: 'Only Owner or HR can view permissions matrix' });
        }
        const matrix = (0, permissions_1.getPermissionsMatrix)();
        res.json(matrix);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
