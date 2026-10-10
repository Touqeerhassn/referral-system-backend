import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';

type ValidationTarget = 'body' | 'params' | 'query';

/**
 * Returns an Express middleware that validates req[target] against the given Joi schema.
 * On failure -> 400 with structured validation errors.
 * On success -> strips unknown fields and replaces req[target] with the cleaned value.
 */
export const validate =
    (schema: Joi.ObjectSchema, target: ValidationTarget = 'body') =>
    (req: Request, res: Response, next: NextFunction): void => {
        const { error, value } = schema.validate(req[target], {
            abortEarly: false,   // collect ALL errors, not just the first
            stripUnknown: true,  // silently remove fields not in schema
        });

        if (error) {
            const errors = error.details.map((d) => ({
                field: d.path.join('.'),
                message: d.message.replace(/['"]/g, ''),
            }));

            res.status(400).json({
                success: false,
                error: 'Validation failed',
                errors,
            });
            return;
        }

        // Replace with sanitised value (unknown fields stripped)
        // Note: Express 5 defines req.query as a getter, so we redefine property if target === 'query'
        if (target === 'query') {
            Object.defineProperty(req, 'query', {
                value,
                writable: true,
                configurable: true,
                enumerable: true,
            });
        } else {
            (req as any)[target] = value;
        }
        next();
    };
