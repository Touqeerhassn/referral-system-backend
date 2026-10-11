import Joi from 'joi';

export const joinCampaignSchema = Joi.object({
    campaignId: Joi.string().trim().required().messages({
        'string.empty': 'campaignId cannot be empty',
        'any.required': 'campaignId is required',
    }),

    name: Joi.string().trim().min(2).max(100).required().messages({
        'string.empty': 'Name cannot be empty',
        'string.min': 'Name must be at least 2 characters',
        'string.max': 'Name cannot exceed 100 characters',
        'any.required': 'Name is required',
    }),

    phone: Joi.string()
        .trim()
        .pattern(/^\+?\d{7,15}$/)
        .required()
        .messages({
            'string.empty': 'Phone number is required',
            'string.pattern.base': 'Enter a valid phone number with country code (e.g. +923001234567)',
            'any.required': 'Phone is required',
        }),

    incomingRefCode: Joi.string().trim().uppercase().optional().allow('', null).messages({
        'string.base': 'incomingRefCode must be a string',
    }),
});
