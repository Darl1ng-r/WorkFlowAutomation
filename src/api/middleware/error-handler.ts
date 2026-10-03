import { Context } from "hono";
import { DomainError } from "@domain/errors";
import { errorResponse } from "./response-envelope";

/**
 * Global Error Handler middleware for Hono.
 * Maps known DomainErrors to appropriate HTTP status codes,
 * and masks unhandled internal server errors.
 */
export function errorHandler(err: Error, c: Context) {
  const requestId = c.req.header("cf-ray") ?? c.req.header("x-request-id") ?? crypto.randomUUID();

  if (err instanceof DomainError) {
    return c.json(
      errorResponse(err.errorCode, err.message, (err as unknown as { details?: unknown }).details, requestId),
      err.statusCode as any
    );
  }

  // Structured server-side logging for unhandled exceptions
  console.error(`[Unhandled Exception] [ReqId: ${requestId}]`, err);

  return c.json(
    errorResponse(
      "INTERNAL_SERVER_ERROR",
      "An unexpected system error occurred. Please contact system support.",
      undefined,
      requestId
    ),
    500
  );
}
