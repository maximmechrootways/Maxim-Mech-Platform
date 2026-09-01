"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRequest = void 0;
const zod_1 = require("zod");
const validateRequest = (schema) => {
    return async (req, res, next) => {
        try {
            await schema.parseAsync(req.body);
            next();
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
                // Pass directly straight to errorHandler.ts cleanly
                next(error);
            }
            else {
                next(error);
            }
        }
    };
};
exports.validateRequest = validateRequest;
