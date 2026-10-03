import { createApp } from "./api/app";
import { createContainerFromEnv } from "./infrastructure/container";

export interface Env {
  DB: D1Database;
  VAULT?: R2Bucket;
  AI?: unknown;
  ENVIRONMENT?: string;
  LOG_LEVEL?: string;
}

export default {
  /**
   * HTTP Request Handler
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const container = createContainerFromEnv(env);
    const app = createApp({ container });
    return app.fetch(request, env, ctx);
  },

  /**
   * Cron Trigger Scheduled Event Handler
   * - Daily 08:00: Proactive obligation/renewal expiry checks
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const container = createContainerFromEnv(env);

    ctx.waitUntil(
      (async () => {
        console.log(`[Cron Trigger] Executing scheduled task at ${new Date(event.scheduledTime).toISOString()}`);
        // Run proactive 30-day renewal check
        const result = await container.checkExpiringObligations.execute(30);
        console.log(`[Renewals Sweep] Checked ${result.totalChecked} items, ${result.expiringCount} expiring soon.`);
      })()
    );
  },
};
