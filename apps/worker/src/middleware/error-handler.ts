import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { ApiResponse, AppError, ERROR_CODES, isAppError } from '@mobile-shop/shared';
import type { AppContext } from '../types/env';

/**
 * Centralized error handler — converts thrown errors to a consistent JSON envelope.
 *
 *  - AppError     → uses its code/statusCode/details
 *  - ZodError     → wrapped as VALIDATION_ERROR with field-level details
 *  - HTTPException → uses its status + message
 *  - Other        → INTERNAL_ERROR (500) with sanitized message
 */
export function errorHandlerMiddleware(err: Error, c: Context<AppContext>): Response {
  // AppError: our domain errors — preserve full detail.
  if (isAppError(err)) {
    const response: ApiResponse = {
      success: false,
      error: err.toJSON(),
    };
    return c.json(response, err.statusCode as 200);
  }

  // ZodError: validation errors — convert to VALIDATION_ERROR envelope.
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    err.issues.forEach((issue) => {
      const path = issue.path.join('.') || '_';
      if (!fieldErrors[path]) fieldErrors[path] = issue.message;
    });

    const response: ApiResponse = {
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'بيانات الإدخال غير صحيحة',
        details: { fields: fieldErrors, issues: err.issues },
      },
    };
    return c.json(response, 422 as 200);
  }

  // Hono HTTPException: preserve status + message.
  if (err instanceof HTTPException) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: err.message,
      },
    };
    return c.json(response, err.status as 200);
  }

  // Unknown: never leak internals.
  console.error('Unhandled error', { err });
  const response: ApiResponse = {
    success: false,
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'An unexpected error occurred.',
    },
  };
  return c.json(response, 500 as 200);
}
