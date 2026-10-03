/**
 * Base Domain Error class representing known business and domain rule violations.
 */
export abstract class DomainError extends Error {
  public abstract readonly statusCode: number;
  public abstract readonly errorCode: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends DomainError {
  public readonly statusCode = 404;
  public readonly errorCode = "RESOURCE_NOT_FOUND";

  constructor(resource: string, identifier: string | number) {
    super(`Resource '${resource}' with identifier '${identifier}' was not found.`);
  }
}

export class ValidationError extends DomainError {
  public readonly statusCode = 400;
  public readonly errorCode = "VALIDATION_FAILED";

  constructor(message: string, public readonly details?: unknown) {
    super(message);
  }
}

export class DuplicateEntityError extends DomainError {
  public readonly statusCode = 409;
  public readonly errorCode = "DUPLICATE_ENTITY";

  constructor(entity: string, field: string, value: string) {
    super(`${entity} with ${field} '${value}' already exists.`);
  }
}

export class UnauthorizedError extends DomainError {
  public readonly statusCode = 401;
  public readonly errorCode = "UNAUTHORIZED";

  constructor(message = "Authentication required or invalid credentials.") {
    super(message);
  }
}

export class ForbiddenError extends DomainError {
  public readonly statusCode = 403;
  public readonly errorCode = "FORBIDDEN";

  constructor(message = "Access to this resource or action is restricted.") {
    super(message);
  }
}

export class PolicyViolationError extends DomainError {
  public readonly statusCode = 422;
  public readonly errorCode = "POLICY_VIOLATION";

  constructor(message: string) {
    super(message);
  }
}

export class BudgetExceededError extends DomainError {
  public readonly statusCode = 429;
  public readonly errorCode = "BUDGET_EXCEEDED";

  constructor(message = "Daily AI neuron budget limit has been reached.") {
    super(message);
  }
}
