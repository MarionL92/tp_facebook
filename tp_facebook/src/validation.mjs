import mongoose from 'mongoose';
import validator from 'validator';

export function isObjectId(value) {
    return typeof value === 'string' && mongoose.isValidObjectId(value) && /^[a-f\d]{24}$/i.test(value);
}

export function validateRequestBody(req, res, fields) {
    const body = req.body;

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        res.status(400).json({
            code: 400,
            message: 'Validation failed',
            errors: [{ field: 'body', message: 'Must be a JSON object' }]
        });
        return false;
    }

    const errors = [];
    const allowedFields = new Set(Object.keys(fields));

    for (const field of Object.keys(body)) {
        if (!allowedFields.has(field)) {
            errors.push({ field, message: 'Unknown field' });
        }
    }

    for (const [field, options] of Object.entries(fields)) {
        const value = body[field];

        if (value === undefined) {
            if (options.required) {
                errors.push({ field, message: 'This field is required' });
            }
            continue;
        }

        if (options.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
            errors.push({ field, message: 'Must be a number' });
        } else if (options.type === 'boolean' && typeof value !== 'boolean') {
            errors.push({ field, message: 'Must be a boolean' });
        } else if (options.type === 'objectId' && !isObjectId(value)) {
            errors.push({ field, message: 'Must be a valid id' });
        } else if (options.type === 'objectIdArray' && (!Array.isArray(value) || !value.every(isObjectId))) {
            errors.push({ field, message: 'Must be an array of valid ids' });
        } else if (options.type === 'array' && !Array.isArray(value)) {
            errors.push({ field, message: 'Must be an array' });
        } else if (options.type === 'object' && (!value || typeof value !== 'object' || Array.isArray(value))) {
            errors.push({ field, message: 'Must be an object' });
        } else if (options.type === 'date' && (typeof value !== 'string' || !validator.isISO8601(value))) {
            errors.push({ field, message: 'Must be an ISO 8601 date' });
        } else if (options.type === 'string' && typeof value !== 'string') {
            errors.push({ field, message: 'Must be a string' });
        } else if (options.type === 'string') {
            const normalizedValue = value.trim();

            if (options.required && normalizedValue.length === 0) {
                errors.push({ field, message: 'This field is required' });
                continue;
            }

            if (options.minLength !== undefined && normalizedValue.length < options.minLength) {
                errors.push({
                    field,
                    message: `Must contain at least ${options.minLength} characters`
                });
            }

            if (options.maxLength !== undefined && normalizedValue.length > options.maxLength) {
                errors.push({
                    field,
                    message: `Must not exceed ${options.maxLength} characters`
                });
            }

            if (options.enum !== undefined && !options.enum.includes(value)) {
                errors.push({
                    field,
                    message: `Must be one of: ${options.enum.join(', ')}`
                });
            }
        }
    }

    if (errors.length > 0) {
        res.status(400).json({
            code: 400,
            message: 'Validation failed',
            errors
        });
        return false;
    }

    return true;
}

export function getMongooseValidationErrors(err) {
    if (err.name === 'ValidationError') {
        return Object.values(err.errors).map(({ path, message }) => ({
            field: path,
            message
        }));
    }

    if (err.name === 'CastError') {
        return [{
            field: err.path,
            message: 'Invalid value'
        }];
    }

    return null;
}
