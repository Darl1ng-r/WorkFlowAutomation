import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { CreateObligationSchema, QueryObligationsSchema } from "@schemas/obligation.schema";
import { successResponse } from "../middleware/response-envelope";
import { ServiceContainer } from "@infrastructure/container";
import { ObligationEntity } from "@domain/types";

export function createObligationsRouter(container: ServiceContainer) {
  const router = new Hono();

  // POST /api/obligations - Create new obligation / licence tracker
  router.post("/", zValidator("json", CreateObligationSchema), async (c) => {
    const dto = c.req.valid("json");
    const nowIso = new Date().toISOString();

    const entity: ObligationEntity = {
      id: crypto.randomUUID(),
      title: dto.title,
      assetIdentifier: dto.assetIdentifier,
      kind: dto.kind,
      referenceNo: dto.referenceNo,
      issuer: dto.issuer,
      expiresOn: dto.expiresOn,
      leadDays: dto.leadDays,
      ownerEmail: dto.ownerEmail,
      status: "ACTIVE",
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const saved = await container.obligationRepo.create(entity);
    return c.json(successResponse(saved), 201);
  });

  // GET /api/obligations - List obligations
  router.get("/", zValidator("query", QueryObligationsSchema), async (c) => {
    const query = c.req.valid("query");
    let list: ObligationEntity[];

    if (query.expiringWithinDays) {
      list = await container.obligationRepo.findExpiring(query.expiringWithinDays);
    } else {
      list = await container.obligationRepo.list();
    }

    if (query.status) {
      list = list.filter((i) => i.status === query.status);
    }

    return c.json(successResponse(list));
  });

  // POST /api/obligations/check - Proactive renewal check trigger
  router.post(
    "/check",
    zValidator("json", z.object({ daysThreshold: z.number().int().positive().default(30) })),
    async (c) => {
      const { daysThreshold } = c.req.valid("json");
      const result = await container.checkExpiringObligations.execute(daysThreshold);
      return c.json(successResponse(result));
    }
  );

  return router;
}
