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

export const SAMPLE_SCANS = [
  {
    id: "sample-scan-ministry",
    label: "Ministry Environmental Compliance Order",
    tag: "Regulatory Filing",
    sourceSender: "Ministry of Climate Change & Environment",
    fileName: "MOCCAE_Audit_Notice_2026.pdf",
    rawOcrText:
      "UNITED ARAB EMIRATES\nMINISTRY OF CLIMATE CHANGE & ENVIRONMENT\nDirectorate of Industrial Audit & Environmental Standards\n\nOFFICIAL NOTICE: Mandatory Air Quality & Emission Baseline Verification 2026\nReference: ENV-REG-2026-99042\nDate: 04 October 2026\n\nTo the Board of Directors & Environmental Safety Manager,\n\nPursuant to Federal Law No. 24 on Environmental Protection, your commercial facilities are scheduled for comprehensive inspection. You are required to submit verified continuous emission monitoring reports and hazardous waste manifests within thirty (30) days from this notice.\n\nFailure to register updated filings by 05 November 2026 will initiate statutory compliance sanctions.\n\n[SEAL & SIGNATURE]\nDr. Salem Al-Suwaidi\nDirector General of Environmental Audit",
  },
  {
    id: "sample-scan-court",
    label: "Court Judicial Notice & Summons",
    tag: "Confidential Legal",
    sourceSender: "Dubai Courts - Civil Court of First Instance",
    fileName: "Court_Notice_Case_4412_2026.pdf",
    rawOcrText:
      "GOVERNMENT OF DUBAI\nDUBAI COURTS - JUDICIAL DEPARTMENT\nCivil Court of First Instance\n\nJUDICIAL NOTIFICATION & WITNESS DEPOSITION SUMMONS\nCase Reference: CC-2026-4412/CIV\nNotice Classification: CONFIDENTIAL / STRICTLY PRIVILEGED\n\nTO: General Office Reception & Authorized Legal Representative\n\nYou are hereby notified that a deposition statement regarding Subcontracting Dispute #882 has been scheduled before the Third Commercial Circuit. Your legal counsel is mandated to enter appearance and file responding memorandum within 15 days (Deadline: 20 October 2026).\n\nOriginal instrument deposited with Bailiff Services.\n\n[JUDICIAL STAMP & ARABIC CALLIGRAPHY SEAL]",
  },
  {
    id: "sample-scan-bank",
    label: "Bank Performance Guarantee Deed",
    tag: "High-Security Vault",
    sourceSender: "Standard Chartered Commercial Banking",
    fileName: "Bank_Guarantee_BG_2026_8192.pdf",
    rawOcrText:
      "STANDARD CHARTERED BANK (DUBAI BRANCH)\nTrade Finance & Global Lending Directorate\n\nIRREVOCABLE STANDBY LETTER OF CREDIT / PERFORMANCE GUARANTEE DEED\nGuarantee Reference: SCB-BG-2026-8192\nIssue Date: 05 October 2026\nExpiry Date: 05 October 2027\n\nBeneficiary: Operations & Facilities Directorate\nPrincipal Amount: USD 250,000.00 (Two Hundred Fifty Thousand United States Dollars)\n\nWe hereby irrevocably undertake to pay you upon first written demand the guaranteed amount upon receipt of your certified default declaration. This instrument is governed by Uniform Rules for Demand Guarantees (URDG 758).\n\nOriginal security deed deposited for safekeeping.",
  },
];

const processScanSchema = z.object({
  rawOcrText: z.string().min(5, "OCR text or scanned transcript is required"),
  fileName: z.string().optional(),
  sourceSender: z.string().optional(),
  documentTypeHint: z.string().optional(),
  receivedDate: z.string().optional(),
});

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

  // POST /api/orchestrator/process-scan
  router.post("/process-scan", zValidator("json", processScanSchema), async (c) => {
    const payload = c.req.valid("json");
    const result = await container.orchestrateInboundScan.execute(payload);
    return c.json(successResponse(result), 201);
  });

  // GET /api/orchestrator/sample-scans
  router.get("/sample-scans", (c) => {
    return c.json(successResponse(SAMPLE_SCANS), 200);
  });

  return router;
}

