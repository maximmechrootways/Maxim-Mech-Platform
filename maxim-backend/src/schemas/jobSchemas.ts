import { z } from 'zod'

export const createJobSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    siteId: z.string().uuid('Invalid site id'),
})

export const updateJobSchema = z.object({
    title: z.string().min(1).optional(),
    status: z.enum(['active', 'completed', 'on-hold', 'inactive']).optional(),
    siteId: z.string().uuid().optional(),
    gate: z.string().max(200).optional(),
})

export const addSupervisorSchema = z.object({
    userId: z.string().uuid(),
})

export const addLabourerSchema = z.object({
    userId: z.string().uuid(),
})

export const addSubcontractorSchema = z.object({
    subcontractorId: z.string().uuid(),
})

export const checkInSchema = z.object({
    targetUserId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export const resetCheckInSchema = z.object({
    targetUserId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export const listJobsQuerySchema = z.object({
    status: z.enum(['active', 'completed', 'on-hold', 'inactive']).optional(),
    siteId: z.string().uuid().optional(),
})
