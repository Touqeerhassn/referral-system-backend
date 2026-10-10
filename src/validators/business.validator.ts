import Joi from "joi";

// ── Existing validators ──

export const registerBusinessSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required().messages({
        "string.empty": "Business name cannot be empty",
        "string.min": "Business name must be at least 2 characters",
        "string.max": "Business name cannot exceed 100 characters",
        "any.required": "Business name is required",
    }),
    subsStatus: Joi.string().valid("Guest", "Subscribed").default("Guest").messages({
        "any.only": "subsStatus must be either Guest or Subscribed",
    }),
});

export const businessParamsSchema = Joi.object({
    businessId: Joi.string().trim().required().messages({
        "string.empty": "Business ID cannot be empty",
        "any.required": "Business ID is required",
    }),
});

// ── WhatsApp Verification validators ──

/**
 * POST /api/businesses/verify/initiate
 */
export const initiateVerifySchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required().messages({
        "string.empty": "Business name cannot be empty",
        "string.min": "Business name must be at least 2 characters",
        "any.required": "Business name is required",
    }),
    phone: Joi.string()
        .trim()
        .pattern(/^\+?\d{7,15}$/)
        .required()
        .messages({
            "string.empty": "Phone number is required",
            "string.pattern.base": "Enter a valid phone number with country code (e.g. +923001234567)",
            "any.required": "Phone number is required",
        }),
    email: Joi.string().trim().email().optional().allow("").messages({
        "string.email": "Enter a valid email address",
    }),
    role: Joi.string().valid("guest", "subscriber").default("guest").messages({
        "any.only": "role must be guest or subscriber",
    }),
});

/**
 * GET /api/businesses/verify/status?nonce=...
 */
export const verifyStatusQuerySchema = Joi.object({
    nonce: Joi.string().trim().required().messages({
        "string.empty": "nonce is required",
        "any.required": "nonce query parameter is required",
    }),
});

/**
 * POST /api/businesses/login
 */
export const loginBusinessSchema = Joi.object({
    phone: Joi.string().trim().required().messages({
        "string.empty": "Phone number or email is required",
        "any.required": "Phone number or email is required",
    }),
});
