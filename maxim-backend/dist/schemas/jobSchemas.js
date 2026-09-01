"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listJobsQuerySchema = exports.resetCheckInSchema = exports.checkInSchema = exports.addSubcontractorSchema = exports.addLabourerSchema = exports.addSupervisorSchema = exports.updateJobSchema = exports.createJobSchema = void 0;
const zod_1 = require("zod");
exports.createJobSchema = zod_1.z.object({
    title: zod_1.z.string().min(1, 'Title is required'),
    siteId: zod_1.z.string().uuid('Invalid site id'),
});
exports.updateJobSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).optional(),
    status: zod_1.z.enum(['active', 'completed', 'on-hold', 'inactive']).optional(),
    siteId: zod_1.z.string().uuid().optional(),
    gate: zod_1.z.string().max(200).optional(),
});
exports.addSupervisorSchema = zod_1.z.object({
    userId: zod_1.z.string().uuid(),
});
exports.addLabourerSchema = zod_1.z.object({
    userId: zod_1.z.string().uuid(),
});
exports.addSubcontractorSchema = zod_1.z.object({
    subcontractorId: zod_1.z.string().uuid(),
});
exports.checkInSchema = zod_1.z.object({
    targetUserId: zod_1.z.string().uuid(),
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
exports.resetCheckInSchema = zod_1.z.object({
    targetUserId: zod_1.z.string().uuid(),
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
exports.listJobsQuerySchema = zod_1.z.object({
    status: zod_1.z.enum(['active', 'completed', 'on-hold', 'inactive']).optional(),
    siteId: zod_1.z.string().uuid().optional(),
});
