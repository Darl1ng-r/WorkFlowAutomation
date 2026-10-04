import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { successResponse } from "../middleware/response-envelope";
import { ServiceContainer } from "@infrastructure/container";

const processEmailSchema = z.object({
  sender: z.string().min(1, "Sender is required"),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  receivedAt: z.string().optional(),
});

export const SAMPLE_EMAILS = [
  {
    id: "sample-meeting",
    label: "Calendar Meeting Request",
    tag: "Calendar Sync",
    sender: "khalid.mansoor@partner-ventures.com",
    subject: "Q4 Strategy Review & Budget Alignment",
    body: "Hi Office Team,\n\nCould we schedule our executive quarterly review this Thursday at 14:00 (14:00 - 15:00)? We will need Boardroom Alpha for 5 attendees.\n\nPlease confirm and send through the calendar invite.\n\nBest,\nKhalid Mansoor\nManaging Partner, Partner Ventures",
  },
  {
    id: "sample-invoice",
    label: "High-Value Cloud Infrastructure Invoice",
    tag: "Approvals Queue",
    sender: "billing@apexcloud.io",
    subject: "Invoice INV-2026-9041 for September Dedicated Hosting",
    body: "Dear Customer,\n\nPlease find attached Invoice INV-2026-9041 for your September private cloud cluster and fiber transit.\n\nTotal Amount Due: USD 1,450.00\nPayment Due Date: 2026-10-25\nRemittance: Wire Transfer to Apex Cloud LLC (IBAN provided on invoice).\n\nThank you for your business.",
  },
  {
    id: "sample-renewal",
    label: "Municipal Trade License Renewal Notice",
    tag: "Central Register",
    sender: "licensing@ammancity.gov.jo",
    subject: "Official Notice: Commercial License Renewal 2026",
    body: "Official Communication - Greater Amman Municipality\n\nNotice of Impending Expiry: Commercial Registration & Building Occupancy Permit Ref #CR-88219.\n\nYour annual operating license expires in 35 days. Please submit certified audited accounts and renew before the statutory deadline to prevent administrative penalty.\n\nLegal Affairs & Municipal Licensing Department",
  },
];

export function createOrchestratorRouter(container: ServiceContainer): Hono {
  const router = new Hono();

  // POST /api/orchestrator/process-email
  router.post("/process-email", zValidator("json", processEmailSchema), async (c) => {
    const payload = c.req.valid("json");
    const result = await container.orchestrateInboundEmail.execute(payload);
    return c.json(successResponse(result), 200);
  });

  // GET /api/orchestrator/sample-emails
  router.get("/sample-emails", (c) => {
    return c.json(successResponse(SAMPLE_EMAILS), 200);
  });

  return router;
}
