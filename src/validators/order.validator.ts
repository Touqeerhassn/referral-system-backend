import Joi from 'joi';

// Validates PATCH /api/participants/:id/confirm — participantId comes from URL params
export const confirmOrderParamsSchema = Joi.object({
    id: Joi.string().trim().required().messages({
        'string.empty': 'Participant id cannot be empty',
        'any.required': 'Participant id is required',
    }),
});

// Validates GET /api/campaigns/:campaignId/leaderboard — campaignId comes from URL params
export const campaignParamsSchema = Joi.object({
    campaignId: Joi.string().trim().required().messages({
        'string.empty': 'Campaign id cannot be empty',
        'any.required': 'Campaign id is required',
    }),
});
