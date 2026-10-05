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

  // POST /api/kiosk/ai-parse - Front Desk AI Receptionist Walk-in & Badge Parser
  router.post("/ai-parse", async (c) => {
    const body = await c.req.json();
    const notes = String(body.notes ?? "");
    const autoCheckIn = Boolean(body.autoCheckIn ?? false);

    if (!notes || notes.trim().length < 5) {
      return c.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Visitor notes or transcript must be at least 5 characters." },
        },
        400
      );
    }

    const parsed = await container.aiOrchestrator.parseVisitorNotes(notes);

    if (autoCheckIn) {
      const visitor = await container.visitorCheckIn.execute({
        dto: {
          fullName: parsed.fullName,
          company: parsed.company,
          email: parsed.email,
          phone: parsed.phone,
          hostEmployeeEmail: parsed.hostEmployeeEmail,
          purpose: parsed.purpose,
          ndaSigned: parsed.ndaSigned,
        },
      });

      return c.json(
        successResponse({
          visitor,
          parsed,
          checkedIn: true,
          message: `Visitor ${visitor.fullName} checked in under badge #${visitor.badgeNumber}. Host alerted at ${visitor.hostEmployeeEmail}.`,
        }),
        201
      );
    }

    return c.json(
      successResponse({
        parsed,
        checkedIn: false,
        message: "Visitor details successfully parsed from notes.",
      })
    );
  });

  // GET /api/kiosk/samples - Sample walk-in visitor scenarios for quick testing
  router.get("/samples", (c) => {
    return c.json(
      successResponse([
        {
          id: "sample-partner",
          title: "Executive Partner Meeting",
          notes:
            "Visitor Sarah Connor from Cyberdyne Systems (+1 415 555 2671, sconnor@cyberdyne.io). Here to see Marcus (marcus@company.com) for Q4 AI Architecture Review. NDA signed. Badge 42.",
        },
        {
          id: "sample-vendor",
          title: "Equipment Maintenance Inspector",
          notes:
            "Ahmed Al-Mansoor from Otis Elevator & Safety (+971 50 123 4567). Visiting Facilities Lead Omar (omar@company.com) for quarterly elevator safety certification. Badge 88.",
        },
        {
          id: "sample-candidate",
          title: "Senior Engineering Candidate",
          notes:
            "Candidate David Chen (david.chen@gmail.com, 555-0199). Here for on-site interviews with Engineering Manager Layla (layla@company.com). Purpose: Staff Systems Architect Interview. Badge 15.",
        },
      ])
    );
  });

  return router;
}

