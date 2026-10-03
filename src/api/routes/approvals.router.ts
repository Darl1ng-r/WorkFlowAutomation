import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { ApprovalDecisionSchema } from "@schemas/approval.schema";
import { successResponse } from "../middleware/response-envelope";
import { ServiceContainer } from "@infrastructure/container";

export function createApprovalsRouter(container: ServiceContainer) {
  const router = new Hono();

  // GET /api/approvals - List pending approvals
  router.get("/", async (c) => {
    const pending = await container.approvalRepo.listPending();
    return c.json(successResponse(pending));
  });

  // POST /api/approvals/:id/decide - Submit approval decision
  router.post("/:id/decide", zValidator("json", ApprovalDecisionSchema), async (c) => {
    const id = c.req.param("id");
    const dto = c.req.valid("json");

    await container.decideApproval.execute({
      approvalId: id,
      dto,
    });

    return c.json(successResponse({ message: `Approval ${id} decided as ${dto.decision}` }));
  });

  return router;
}
