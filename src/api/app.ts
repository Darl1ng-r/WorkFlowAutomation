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
import { CLIENT_HTML } from "@client/html-bundle";

export interface AppOptions {
  container: ServiceContainer;
}

export function createApp(options: AppOptions): Hono {
  const app = new Hono();
  const { container } = options;

  // Global Error Handler
  app.onError(errorHandler);

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

  // Public kiosk endpoints (allow visitors to check in without employee login)
  const kioskRouter = createKioskRouter(container);
  app.use("/api/kiosk/*", authMiddleware({ allowKiosk: true }));
  app.route("/api/kiosk", kioskRouter);

  // Authenticated corporate endpoints
  app.use("/api/*", authMiddleware());
  app.route("/api/correspondence", createCorrespondenceRouter(container));
  app.route("/api/invoices", createInvoicesRouter(container));
  app.route("/api/approvals", createApprovalsRouter(container));
  app.route("/api/obligations", createObligationsRouter(container));
  app.route("/api/rooms", createRoomsRouter(container.db));
  app.route("/api/audit", createAuditRouter(container));

  return app;
}
