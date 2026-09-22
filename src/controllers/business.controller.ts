import { Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db';
import { businesses } from '../db/schema';
import { asyncHandler } from '../middleware/errorHandler';

/**
 * POST /api/businesses
 * Register a business as Guest or Subscribed.
 * Request body is already validated + sanitised by Joi middleware.
 */
export const registerBusiness = asyncHandler(async (req: Request, res: Response) => {
    const { name, subsStatus } = req.body; // guaranteed valid by validate() middleware

    const [newBusiness] = await db
        .insert(businesses)
        .values({
            id: `biz_${nanoid(10)}`,
            name,
            subsStatus,
        })
        .returning();

    res.status(201).json({
        success: true,
        message: 'Business registered successfully',
        business: newBusiness,
    });
});

