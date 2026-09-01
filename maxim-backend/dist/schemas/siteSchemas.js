"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSiteSchema = void 0;
const zod_1 = require("zod");
exports.createSiteSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Name is required'),
    address: zod_1.z.string().optional(),
});
