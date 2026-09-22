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
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    console.error(`[Error] ${statusCode} — ${message}`, err.stack);

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
