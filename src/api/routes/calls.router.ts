import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { CallLogCreateSchema, CallLogAIProcessSchema } from "@schemas/call-log.schema";
import { successResponse } from "../middleware/response-envelope";
import { ServiceContainer } from "@infrastructure/container";
import { calculateSha256Hex } from "@application/use-cases/register-correspondence.use-case";

export function createCallsRouter(container: ServiceContainer) {
  const router = new Hono();

  // GET /api/calls - List recent front-desk calls
  router.get("/", async (c) => {
    const limit = Number(c.req.query("limit") ?? "20");
    const calls = await container.callLogRepo.listRecent(limit);
    return c.json(successResponse(calls));
  });

  // POST /api/calls - Manual call log creation
  router.post("/", zValidator("json", CallLogCreateSchema), async (c) => {
    const dto = c.req.valid("json");
    const nowIso = new Date().toISOString();
    const callId = crypto.randomUUID();

    const call = await container.callLogRepo.create({
      id: callId,
      callerNumber: dto.callerNumber,
      callerName: dto.callerName,
      direction: dto.direction,
      routedToUserEmail: dto.routedToUserEmail,
      summary: dto.summary,
      durationSeconds: dto.durationSeconds,
      pbxCallId: dto.pbxCallId,
      createdAt: nowIso,
    });

    // Tamper-evident audit log
    const payloadHash = await calculateSha256Hex(
      new TextEncoder().encode(JSON.stringify({ callId, caller: dto.callerNumber, summary: dto.summary }))
    );
    await container.auditRepo.append({
      actorEmail: "reception@company.com",
      actorType: "USER",
      action: "LOG_PHONE_CALL",
      entityType: "CALL_LOG",
      entityId: callId,
      payloadHash,
      occurredAt: nowIso,
    });

    return c.json(successResponse(call), 201);
  });

  // POST /api/calls/ai-process - AI Receptionist Voice/Notes Call Logger
  router.post("/ai-process", zValidator("json", CallLogAIProcessSchema), async (c) => {
    const { notes, defaultStaffEmail } = c.req.valid("json");
    const parsed = await container.aiOrchestrator.parseCallNotes(notes, defaultStaffEmail);
    const nowIso = new Date().toISOString();
    const callId = crypto.randomUUID();

    const call = await container.callLogRepo.create({
      id: callId,
      callerNumber: parsed.callerNumber,
      callerName: parsed.callerName,
      direction: parsed.direction,
      routedToUserEmail: parsed.routedToUserEmail,
      summary: parsed.summary,
      durationSeconds: parsed.durationSeconds,
      createdAt: nowIso,
    });

    // Tamper-evident audit log
    const payloadHash = await calculateSha256Hex(
      new TextEncoder().encode(JSON.stringify({ callId, caller: parsed.callerNumber, summary: parsed.summary }))
    );
    await container.auditRepo.append({
      actorEmail: "ai-receptionist@office-os.local",
      actorType: "AGENT",
      action: "AI_PARSE_PHONE_CALL",
      entityType: "CALL_LOG",
      entityId: callId,
      payloadHash,
      occurredAt: nowIso,
    });

    return c.json(
      successResponse({
        call,
        parsed,
        message: `Call logged and routed to ${parsed.routedToUserEmail}. Priority: ${parsed.priority}.`,
      }),
      201
    );
  });

  // GET /api/calls/samples - Pre-configured front-desk test scenarios
  router.get("/samples", (c) => {
    return c.json(
      successResponse([
        {
          id: "sample-gov",
          title: "Ministry Regulatory Inquiry",
          notes:
            "Inbound call from Eng. Tariq Al-Hashemi (+971 4 212 5555) from Ministry of Industry & Advanced Technology. Followed up on factory safety compliance file #MOIAT-881. Transferred call to Facilities Manager Omar (omar@company.com). Call lasted 3 minutes 45 seconds. Urgent: requires updated fire extinguisher certificates before Thursday.",
        },
        {
          id: "sample-client",
          title: "VIP Client Contract Follow-up",
          notes:
            "Caller Dr. Elena Rostova from Apex Global (+44 20 7946 0912). Inquiring about Q4 master services agreement signature status. Routed to General Counsel Sarah (sarah@company.com). Duration 2 minutes 10 seconds. Normal priority.",
        },
        {
          id: "sample-vendor",
          title: "Courier Gate Clearance",
          notes:
            "Outbound call to DHL Express Courier (+971 50 998 7766). Confirming security gate pass and parcel drop-off at Front Desk loading dock B for Procurement Lead Fatima. Duration 45 seconds.",
        },
      ])
    );
  });

  return router;
}
