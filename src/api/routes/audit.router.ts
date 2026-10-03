import { Hono } from "hono";
import { successResponse } from "../middleware/response-envelope";
import { ServiceContainer } from "@infrastructure/container";

export function createAuditRouter(container: ServiceContainer) {
  const router = new Hono();

  // GET /api/audit - List recent immutable audit events with SHA-256 chain
  router.get("/", async (c) => {
    const limit = Number(c.req.query("limit") ?? 50);
    const events = await container.auditRepo.listRecent(limit);
    return c.json(successResponse(events));
  });

  return router;
}
