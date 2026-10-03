import { describe, it, expect } from "vitest";
import { validateEnv } from "@infrastructure/config/env.schema";

describe("Environment Configuration Validation", () => {
  it("should successfully parse valid defaults when empty object provided", () => {
    const config = validateEnv({});
    expect(config.ENVIRONMENT).toBe("development");
    expect(config.LOG_LEVEL).toBe("info");
    expect(config.DEFAULT_AUTONOMY_LEVEL).toBe("L2");
    expect(config.DAILY_AI_NEURON_BUDGET).toBe(10000);
    expect(config.CF_ACCESS_ENABLED).toBe(false);
  });

  it("should parse boolean-like strings for CF_ACCESS_ENABLED", () => {
    const config = validateEnv({ CF_ACCESS_ENABLED: "true" });
    expect(config.CF_ACCESS_ENABLED).toBe(true);

    const configFalse = validateEnv({ CF_ACCESS_ENABLED: "false" });
    expect(configFalse.CF_ACCESS_ENABLED).toBe(false);
  });

  it("should fail validation if an invalid ENVIRONMENT is passed", () => {
    expect(() => validateEnv({ ENVIRONMENT: "unknown_env" })).toThrow(
      "[Configuration Error] Invalid environment variables"
    );
  });

  it("should fail validation if an invalid APP_URL is passed", () => {
    expect(() => validateEnv({ APP_URL: "not-a-valid-url" })).toThrow(
      "[Configuration Error] Invalid environment variables"
    );
  });
});
