import { createApp } from "./api/app";
import { createContainerFromEnv } from "./infrastructure/container";
export { IntakeWorkflow } from "./workflows/intake.workflow";

export interface Env {
  DB: D1Database;
  VAULT?: R2Bucket;
  AI?: unknown;
  ENVIRONMENT?: string;
  LOG_LEVEL?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  CALENDAR_WEBHOOK_SECRET?: string;
}

let cachedApp: ReturnType<typeof createApp> | null = null;
let cachedDb: D1Database | null = null;

function getOrBuildApp(env: Env): ReturnType<typeof createApp> {
  if (!cachedApp || cachedDb !== env.DB) {
    const container = createContainerFromEnv(env);
    cachedApp = createApp({ container });
    cachedDb = env.DB;
  }
  return cachedApp;
}

export default {
  /**
   * HTTP Request Handler with per-isolate cached app instance
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const app = getOrBuildApp(env);
    return app.fetch(request, env, ctx);
  },

  /**
   * Cron Trigger Scheduled Event Handler
   * - Daily 08:00 (05:00 UTC): Proactive obligation/renewal expiry checks
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        console.log(`[Cron Trigger] Executing scheduled task at ${new Date(event.scheduledTime).toISOString()}`);
        const container = createContainerFromEnv(env);
        const result = await container.checkExpiringObligations.execute(30);
        console.log(`[Renewals Sweep] Checked ${result.totalChecked} items, ${result.expiringCount} expiring soon.`);
      })()
    );
  },

  /**
   * Cloudflare Email Routing Event Handler
   * - Ingests inbound corporate emails, passes them through the AI orchestrator,
   *   and routes them to Google Calendar, Approvals, or the Central Register.
   */
  async email(message: any, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        try {
          const from = message.from || "unknown-sender@external.com";
          const subject = message.headers?.get("subject") || "Inbound Communication";
          
          // Read email body stream
          let bodyText = subject;
          if (message.raw) {
            const rawBuffer = await new Response(message.raw).text();
            bodyText = rawBuffer.slice(0, 4000);
          }

          console.log(`[Email Routing] Ingested email from ${from} with subject "${subject}"`);
          const container = createContainerFromEnv(env);
          const result = await container.orchestrateInboundEmail.execute({
            sender: from,
            subject,
            body: bodyText,
            receivedAt: new Date().toISOString(),
          });
          console.log(`[Email Routing] AI action executed: ${result.actionExecuted} - ${result.actionSummary}`);
        } catch (err) {
          console.error("[Email Routing] Failed to orchestrate inbound email:", err);
        }
      })()
    );
  },
};
