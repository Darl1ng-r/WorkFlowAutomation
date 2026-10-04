import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { VisitorCheckInSchema, VisitorCheckOutSchema } from "@schemas/visitor.schema";
import { successResponse } from "../middleware/response-envelope";
import { ServiceContainer } from "@infrastructure/container";
import { ForbiddenError } from "@domain/errors";

export function createKioskRouter(container: ServiceContainer) {
  const router = new Hono();

  // POST /api/kiosk/check-in - Visitor check-in (Public for lobby tablet)
  router.post("/check-in", zValidator("json", VisitorCheckInSchema), async (c) => {
    const dto = c.req.valid("json");
    const visitor = await container.visitorCheckIn.execute({ dto });
    return c.json(
      successResponse({
        id: visitor.id,
        fullName: visitor.fullName,
        badgeNumber: visitor.badgeNumber,
        hostEmployeeEmail: visitor.hostEmployeeEmail,
        checkedInAt: visitor.checkedInAt,
        message: `Welcome, ${visitor.fullName}. Host has been notified.`,
      }),
      201
    );
  });

  // POST /api/kiosk/check-out - Visitor check-out (Staff only - prevents unauthorized check-outs)
  router.post("/check-out", zValidator("json", VisitorCheckOutSchema), async (c) => {
    const user = c.get("user");
    if (user?.role === "KIOSK") {
      throw new ForbiddenError("Visitor check-out requires staff authentication.");
    }

    const { visitorId } = c.req.valid("json");
    const nowIso = new Date().toISOString();
    await container.visitorRepo.checkOut(visitorId, nowIso);
    return c.json(successResponse({ message: "Visitor checked out successfully." }));
  });

  // GET /api/kiosk/active - Active visitors (Staff only - PII protection)
  router.get("/active", async (c) => {
    const user = c.get("user");
    if (user?.role === "KIOSK") {
      throw new ForbiddenError("Visitor directory access is restricted to staff.");
    }

    const activeVisitors = await container.visitorRepo.listActive();
    return c.json(successResponse(activeVisitors));
  });

  return router;
}
