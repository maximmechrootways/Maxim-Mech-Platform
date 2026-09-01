import { z } from 'zod'

export const createSiteSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    address: z.string().optional(),
})
