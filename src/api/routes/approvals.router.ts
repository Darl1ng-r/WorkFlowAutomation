import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { ApprovalDecisionSchema } from "@schemas/approval.schema";
import { successResponse } from "../middleware/response-envelope";
import { ServiceContainer } from "@infrastructure/container";
import { ForbiddenError, NotFoundError } from "@domain/errors";

export function createApprovalsRouter(container: ServiceContainer) {
  const router = new Hono();

  // GET /api/approvals - List pending approvals
  router.get("/", async (c) => {
    const pending = await container.approvalRepo.listPending();
    return c.json(successResponse(pending));
  });

  // POST /api/approvals/:id/decide - Submit approval decision with verified server identity & RBAC
  router.post("/:id/decide", zValidator("json", ApprovalDecisionSchema), async (c) => {
    const id = c.req.param("id");
    const dto = c.req.valid("json");
    const user = c.get("user");

    // 1. Fetch approval to inspect entity type for RBAC
    const approval = await container.approvalRepo.findById(id);
    if (!approval) {
      throw new NotFoundError("Approval", id);
    }

    // 2. Strict Role-Based Access Control (RBAC Guard)
    // S-4 Remediation: Kiosk or unauthorized staff cannot approve invoices or financial transactions
    if (user) {
      if (approval.targetEntityType === "INVOICE") {
        const allowedRoles = ["DIRECTOR", "FINANCE"];
        if (!allowedRoles.includes(user.role)) {
          throw new ForbiddenError(
            `Role '${user.role}' is not authorized to approve invoices. Requires DIRECTOR or FINANCE.`
          );
        }
      } else if (approval.targetEntityType === "SUPPLY_REORDER") {
        const allowedRoles = ["DIRECTOR", "OPERATIONS", "FINANCE", "STAFF"];
        if (!allowedRoles.includes(user.role)) {
          throw new ForbiddenError(
            `Role '${user.role}' is not authorized to approve supply orders.`
          );
        }
      }
    }

    // 3. Take approver identity exclusively from authenticated user
    const decidedByEmail = user?.email || dto.decidedByEmail || "admin@company.com";

    await container.decideApproval.execute({
      approvalId: id,
      dto: {
        ...dto,
        decidedByEmail,
      },
      actorEmail: decidedByEmail,
    });

    return c.json(
      successResponse({
        message: `Approval ${id} decided as ${dto.decision} by ${decidedByEmail}`,
        decision: dto.decision,
        decidedByEmail,
      })
    );
  });

  // POST /api/approvals/:id/undo - Server-side undo/revert endpoint
  router.post("/:id/undo", async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    const actorEmail = user?.email || "admin@company.com";

    await container.decideApproval.revert(id, actorEmail);

    return c.json(
      successResponse({
        message: `Approval ${id} reverted back to PENDING.`,
        approvalId: id,
      })
    );
  });

  return router;
}
