import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { InvoiceExtractionSchema } from "@schemas/invoice.schema";
import { successResponse } from "../middleware/response-envelope";
import { ServiceContainer } from "@infrastructure/container";

export function createInvoicesRouter(container: ServiceContainer) {
  const router = new Hono();

  // POST /api/invoices/process - Process extracted invoice
  router.post(
    "/process",
    zValidator(
      "json",
      z.object({
        correspondenceId: z.string().uuid(),
        documentId: z.string().uuid(),
        confidenceScore: z.number().min(0).max(1).default(0.95),
        extraction: InvoiceExtractionSchema,
      })
    ),
    async (c) => {
      const { correspondenceId, documentId, confidenceScore, extraction } = c.req.valid("json");
      const user = c.get("user");

      const result = await container.processInvoice.execute({
        correspondenceId,
        documentId,
        confidenceScore,
        extraction,
        actorEmail: user.email,
      });

      return c.json(successResponse(result), 201);
    }
  );

  // GET /api/invoices - List invoices
  router.get("/", async (c) => {
    const status = c.req.query("status") as any;
    const list = await container.invoiceRepo.list(status);
    return c.json(successResponse(list));
  });

  return router;
}
