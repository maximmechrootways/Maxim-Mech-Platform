import { Request, Response, NextFunction } from 'express'
import { ZodError, ZodTypeAny } from 'zod'

export const validateRequest = (schema: ZodTypeAny) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            req.body = await schema.parseAsync(req.body)
            next()
        } catch (error) {
            if (error instanceof ZodError) {
                // Pass directly straight to errorHandler.ts cleanly
                next(error)
            } else {
                next(error)
            }
        }
    }
}
