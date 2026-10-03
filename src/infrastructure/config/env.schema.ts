import { z } from "zod";

/**
 * Zod schema defining the environment configuration for Office OS.
 * Validates at startup; prevents running with malformed or missing critical settings.
 */
export const EnvSchema = z.object({
  ENVIRONMENT: z.enum(["development", "staging", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  APP_URL: z.string().url().default("http://localhost:8787"),
  CF_ACCESS_ENABLED: z
    .string()
    .transform((val) => val === "true" || val === "1")
    .or(z.boolean())
    .default(false),
  CF_ACCESS_TEAM_DOMAIN: z.string().optional(),
  CF_ACCESS_POLICY_AUD: z.string().optional(),
  DEFAULT_AUTONOMY_LEVEL: z.enum(["L0", "L1", "L2", "L3"]).default("L2"),
  DAILY_AI_NEURON_BUDGET: z.coerce.number().int().positive().default(10000),
  GOOGLE_WORKSPACE_DOMAIN: z.string().optional(),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

/**
 * Validates an untrusted dictionary of environment variables against the EnvSchema.
 * Throws a formatted Error with specific issues if validation fails.
 */
export function validateEnv(rawEnv: Record<string, unknown>): EnvConfig {
  const result = EnvSchema.safeParse(rawEnv);
  if (!result.success) {
    const formattedErrors = result.error.errors
      .map((err) => `  - ${err.path.join(".")}: ${err.message}`)
      .join("\n");
    throw new Error(`[Configuration Error] Invalid environment variables:\n${formattedErrors}`);
  }
  return result.data;
}
