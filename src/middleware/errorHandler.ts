import { Request, Response, NextFunction } from 'express';
import type * as core from 'express-serve-static-core';
import type * as qs from 'qs';

export interface AppError extends Error {
    statusCode?: number;
}

// Global error-handling middleware (must have 4 args for Express to treat it as an error handler)
export const errorHandler = (
    err: AppError,
    _req: Request,
    res: Response,
    _next: NextFunction
): void => {
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';

    console.error(`[Error] ${statusCode} — ${message}`, err.stack);

    // ── 1. Catch PostgreSQL unique constraint violations (code 23505) ────────
    const fullErrStr = `${err.message || ''} ${(err as any)?.cause?.message || ''}`;
    const isUniqueViolation =
        (err as any)?.code === '23505' ||
        (err as any)?.cause?.code === '23505' ||
        fullErrStr.includes('23505') ||
        fullErrStr.includes('unique constraint') ||
        fullErrStr.includes('duplicate key');

    if (isUniqueViolation) {
        statusCode = 409;
        if (fullErrStr.includes('slug')) {
            message = 'A campaign with this slug already exists. Please choose a different slug.';
        } else if (fullErrStr.includes('phone') || fullErrStr.includes('camp_phone_idx')) {
            message = 'This phone number has already joined this campaign.';
        } else {
            message = 'A record with this unique value already exists.';
        }
    } else if (message.startsWith('Failed query:')) {
        // ── 2. Never leak raw SQL query strings to the client/frontend ───────
        message = 'A database error occurred while processing your request. Please check your inputs and try again.';
    }

    res.status(statusCode).json({
        success: false,
        error: message,
    });
};


// Convenience: wrap async route handlers and forward errors to errorHandler
export const asyncHandler =
    <P = core.ParamsDictionary, ResBody = any, ReqBody = any, ReqQuery = qs.ParsedQs>(
        fn: (req: Request<P, ResBody, ReqBody, ReqQuery>, res: Response, next: NextFunction) => Promise<any>
    ) =>
        (req: Request<P, ResBody, ReqBody, ReqQuery>, res: Response, next: NextFunction) => {
            Promise.resolve(fn(req, res, next)).catch(next);
        };
