import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { VisitorCheckInSchema, VisitorCheckOutSchema } from "@schemas/visitor.schema";
import { successResponse } from "../middleware/response-envelope";
import { ServiceContainer } from "@infrastructure/container";

export function createKioskRouter(container: ServiceContainer) {
  const router = new Hono();

  // POST /api/kiosk/check-in - Visitor check-in
  router.post("/check-in", zValidator("json", VisitorCheckInSchema), async (c) => {
    const dto = c.req.valid("json");
    const visitor = await container.visitorCheckIn.execute({ dto });
    return c.json(successResponse(visitor), 201);
  });

  // POST /api/kiosk/check-out - Visitor check-out
  router.post("/check-out", zValidator("json", VisitorCheckOutSchema), async (c) => {
    const { visitorId } = c.req.valid("json");
    const nowIso = new Date().toISOString();
    await container.visitorRepo.checkOut(visitorId, nowIso);
    return c.json(successResponse({ message: "Visitor checked out successfully." }));
  });

  // GET /api/kiosk/active - Active visitors currently in building
  router.get("/active", async (c) => {
    const activeVisitors = await container.visitorRepo.listActive();
    return c.json(successResponse(activeVisitors));
  });

  return router;
}
