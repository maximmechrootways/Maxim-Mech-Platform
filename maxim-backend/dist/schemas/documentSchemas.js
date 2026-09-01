"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentQuerySchema = exports.documentUploadSchema = void 0;
const zod_1 = require("zod");
exports.documentUploadSchema = zod_1.z.object({
    docType: zod_1.z.enum(['health_safety', 'cad_design', 'site_plan', 'contract', 'bid', 'other']).optional().default('other')
});
exports.documentQuerySchema = zod_1.z.object({
    docType: zod_1.z.string().optional(),
    status: zod_1.z.string().optional(),
    limit: zod_1.z.string().regex(/^\d+$/).transform(Number).optional().default('20'),
    offset: zod_1.z.string().regex(/^\d+$/).transform(Number).optional().default('0')
});
