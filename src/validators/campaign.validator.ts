import Joi from 'joi';

const now = Date.now();
const oneWeekFromNow = now + 7 * 24 * 60 * 60 * 1000;

export const createCampaignSchema = Joi.object({
    businessId: Joi.string().trim().required().messages({
        'string.empty': 'businessId cannot be empty',
        'any.required': 'businessId is required',
    }),

    name: Joi.string().trim().min(2).max(150).required().messages({
        'string.empty': 'Campaign name cannot be empty',
        'string.min': 'Campaign name must be at least 2 characters',
        'string.max': 'Campaign name cannot exceed 150 characters',
        'any.required': 'Campaign name is required',
    }),

    slug: Joi.string()
        .trim()
        .lowercase()
        .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .min(2)
        .max(100)
        .required()
        .messages({
            'string.empty': 'Slug cannot be empty',
            'string.pattern.base': 'Slug must be lowercase letters, numbers, and hyphens only (e.g. summer-sale-2025)',
            'string.min': 'Slug must be at least 2 characters',
            'string.max': 'Slug cannot exceed 100 characters',
            'any.required': 'Slug is required',
        }),

    startDateTime: Joi.date().iso().default(() => new Date(now)).messages({
        'date.format': 'startDateTime must be a valid ISO 8601 date (e.g. 2025-09-01T00:00:00Z)',
    }),

    endDateTime: Joi.date()
        .iso()
        .min(Joi.ref('startDateTime'))
        .default(() => new Date(oneWeekFromNow))
        .messages({
            'date.format': 'endDateTime must be a valid ISO 8601 date',
            'date.min': 'endDateTime must be after startDateTime',
        }),

    tier1Pct: Joi.number().min(0).max(100).default(20).messages({
        'number.min': 'tier1Pct must be between 0 and 100',
        'number.max': 'tier1Pct must be between 0 and 100',
    }),

    tier2Pct: Joi.number().min(0).max(100).default(10).messages({
        'number.min': 'tier2Pct must be between 0 and 100',
        'number.max': 'tier2Pct must be between 0 and 100',
    }),

    tier3Pct: Joi.number().min(0).max(100).default(5).messages({
        'number.min': 'tier3Pct must be between 0 and 100',
        'number.max': 'tier3Pct must be between 0 and 100',
    }),

    maxDiscountCapPct: Joi.number().min(0).max(100).default(50).messages({
        'number.min': 'maxDiscountCapPct must be between 0 and 100',
        'number.max': 'maxDiscountCapPct must be between 0 and 100',
    }),
});
