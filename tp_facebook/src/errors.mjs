import { randomUUID } from 'node:crypto';
import { getMongooseValidationErrors } from './validation.mjs';

function logError(err, requestId) {
    const errorName = typeof err?.name === 'string' ? err.name : 'Error';
    console.error(`[${requestId}] ${errorName} while handling an API request`);
}

export function sendInternalServerError(err, res) {
    const requestId = randomUUID();
    logError(err, requestId);

    return res.status(500).json({
        code: 500,
        message: 'Internal Server Error',
        requestId
    });
}

export function handleExpressError(err, req, res, next) {
    if (res.headersSent) {
        return next(err);
    }

    if (err?.type === 'entity.parse.failed') {
        return res.status(400).json({
            code: 400,
            message: 'Invalid JSON request body'
        });
    }

    if (err?.type === 'entity.too.large') {
        return res.status(413).json({
            code: 413,
            message: 'Request body is too large'
        });
    }

    return sendInternalServerError(err, res);
}

export function sendNotFound(res, message) {
    return res.status(404).json({
        code: 404,
        message
    });
}

export function sendForbidden(res, message = 'Forbidden') {
    return res.status(403).json({
        code: 403,
        message
    });
}

export function sendBadRequest(res, message, errors) {
    return res.status(400).json({
        code: 400,
        message,
        ...(errors ? { errors } : {})
    });
}

export function handleError(err, res) {
    const validationErrors = getMongooseValidationErrors(err);

    if (validationErrors) {
        return sendBadRequest(res, 'Validation failed', validationErrors);
    }

    if (err?.code === 11000) {
        return res.status(409).json({
            code: 409,
            message: 'This resource already exists'
        });
    }

    return sendInternalServerError(err, res);
}
