import Joi from 'joi';

export const registerBusinessSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required().messages({
        'string.empty': 'Business name cannot be empty',
        'string.min': 'Business name must be at least 2 characters',
        'string.max': 'Business name cannot exceed 100 characters',
        'any.required': 'Business name is required',
    }),

    subsStatus: Joi.string()
        .valid('Guest', 'Subscribed')
        .default('Guest')
        .messages({
            'any.only': 'subsStatus must be either Guest or Subscribed',
        }),
});
