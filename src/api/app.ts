import { Hono } from "hono";
import { errorHandler } from "./middleware/error-handler";
import { authMiddleware } from "./middleware/auth";
import { successResponse } from "./middleware/response-envelope";
import { ServiceContainer } from "@infrastructure/container";
import { createCorrespondenceRouter } from "./routes/correspondence.router";
import { createInvoicesRouter } from "./routes/invoices.router";
import { createApprovalsRouter } from "./routes/approvals.router";
import { createKioskRouter } from "./routes/kiosk.router";
import { createObligationsRouter } from "./routes/obligations.router";
import { createRoomsRouter } from "./routes/rooms.router";
import { createAuditRouter } from "./routes/audit.router";
import { createTelemetryRouter } from "./routes/telemetry.router";
import { createSopRouter } from "./routes/sop.router";
import { createSuppliesRouter } from "./routes/supplies.router";
import { CLIENT_HTML } from "@client/html-bundle";

export interface AppOptions {
  container: ServiceContainer;
  authMode?: "STRICT" | "PERMISSIVE" | undefined;
}

export function createApp(options: AppOptions): Hono {
  const app = new Hono();
  const { container, authMode } = options;
  const isStrict = authMode === "STRICT";

  // Global Error Handler
  app.onError(errorHandler);

  // Security Headers Middleware (OWASP A05 & S-3 Defense in Depth)
  app.use("*", async (c, next) => {
    await next();
    c.res.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self';"
    );
    c.res.headers.set("X-Content-Type-Options", "nosniff");
    c.res.headers.set("X-Frame-Options", "DENY");
    c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  });

  // Serve Interactive Client UI
  app.get("/", (c) => c.html(CLIENT_HTML));
  app.get("/kiosk", (c) => c.html(CLIENT_HTML));
  app.get("/favicon.ico", (c) => {
    return c.body(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#1C5A4F"/><path d="M26 32h48v36H26z" fill="none" stroke="#C8E4D6" stroke-width="7" stroke-linejoin="round"/><path d="M26 36l24 18 24-18" fill="none" stroke="#C8E4D6" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="70" cy="30" r="8" fill="#9BC870"/></svg>`,
      200,
      { "Content-Type": "image/svg+xml" }
    );
  });

  // Health endpoint (public)
  app.get("/api/health", (c) => {
    return c.json(
      successResponse({
        status: "HEALTHY",
        system: "Office OS (WorkFlowAutomation)",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
      })
    );
  });

  // Public kiosk check-in endpoint (allow visitors to check in at front desk tablet)
  app.use("/api/kiosk/check-in", authMiddleware({ allowKiosk: true }));

  // Authenticated corporate endpoints (gated with authMiddleware across all sub-paths)
  app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/api/")) {
      return authMiddleware({ strictMode: isStrict })(c, next);
    }
    return next();
  });

  // Mount Application Routers
  const kioskRouter = createKioskRouter(container);
  app.route("/api/kiosk", kioskRouter);
  app.route("/api/visitors", kioskRouter);
  app.route("/api/correspondence", createCorrespondenceRouter(container));
  app.route("/api/invoices", createInvoicesRouter(container));
  app.route("/api/approvals", createApprovalsRouter(container));
  app.route("/api/obligations", createObligationsRouter(container));
  app.route(
    "/api/rooms",
    createRoomsRouter({ db: container.db, roomBookingRepo: container.roomBookingRepo })
  );
  app.route("/api/audit", createAuditRouter(container));
  app.route("/api/metrics", createTelemetryRouter(container));
  app.route("/api/system", createSopRouter());
  app.route("/api/supplies", createSuppliesRouter(container));

  return app;
}
