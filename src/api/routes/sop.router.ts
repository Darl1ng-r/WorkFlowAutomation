import { Hono } from "hono";
import { successResponse } from "../middleware/response-envelope";

export function createSopRouter(): Hono {
  const router = new Hono();

  router.get("/sop", (c) => {
    const sops = [
      {
        id: "SOP-FD-01",
        title: "Front Desk Visitor Intake & Meeting Room Protocol",
        version: "2.1.0",
        department: "Front Desk & Administration",
        effectiveDate: "2026-10-01",
        lastReviewedAt: new Date().toISOString().split("T")[0],
        slaSeconds: 45,
        steps: [
          {
            stepNumber: 1,
            action: "Visitor Approached Kiosk",
            rule: "Guest enters name and company at /kiosk. Autocomplete matches calendar attendee within 3 keystrokes.",
          },
          {
            stepNumber: 2,
            action: "Instant Host Notification (SLA < 10s)",
            rule: "System pushes an interactive card to host on Google Chat with guest name, company, and badge number.",
          },
          {
            stepNumber: 3,
            action: "Meeting Room Auto-Check-in",
            rule: "If host has booked a room, kiosk sets room status to OCCUPIED and provides directions.",
          },
          {
            stepNumber: 4,
            action: "8-Minute Escalation Nudge",
            rule: "If visitor is seated >8 minutes without greeting, reception UI triggers amber [Ping Host] button.",
          },
          {
            stepNumber: 5,
            action: "30-Second Privacy Auto-Reset",
            rule: "Kiosk displays animated 30s countdown bar and clears guest PII back to clean welcome screen.",
          },
        ],
      },
      {
        id: "SOP-FIN-01",
        title: "Inbound Invoices, Arithmetic Validation & Utility Anomaly Auditing",
        version: "2.3.0",
        department: "Finance & Accounts Payable",
        effectiveDate: "2026-10-01",
        lastReviewedAt: new Date().toISOString().split("T")[0],
        slaHours: 24,
        steps: [
          {
            stepNumber: 1,
            action: "Automated Ingestion & OCR",
            rule: "Invoice ingested via Gmail accounts@ or Drive scan folder. Workers AI extracts Net, Tax, Total, and Vendor.",
          },
          {
            stepNumber: 2,
            action: "Arithmetic Cross-Validation",
            rule: "System enforces: Net + Tax = Total (tolerance ±0.05). Any arithmetic discrepancy triggers immediate HTTP 400 rejection.",
          },
          {
            stepNumber: 3,
            action: "Duplicate Invoice Guard",
            rule: "Exact combination of (Vendor Name + Invoice Number) is verified against historical ledger. Duplicates blocked.",
          },
          {
            stepNumber: 4,
            action: "Utility & Recurring Expense Spike Detection",
            rule: "Electricity, water, rent, and telecom bills are matched against trailing 3-month average. If variance > 15%, auto-flagged as ANOMALY_SPIKE with urgent CFO review.",
          },
          {
            stepNumber: 5,
            action: "Human-in-the-Loop Gateway (L2 / L0 Rule)",
            rule: "Draft bill created in accounting only upon executive approval. ZERO autonomous payments (L0 strictly enforced).",
          },
        ],
      },
      {
        id: "SOP-GOV-01",
        title: "Central Correspondence Register & Regulatory Asset Protection",
        version: "2.0.0",
        department: "Operations & Governance",
        effectiveDate: "2026-10-01",
        lastReviewedAt: new Date().toISOString().split("T")[0],
        retentionYears: 10,
        steps: [
          {
            stepNumber: 1,
            action: "Gapless Sequential Numbering",
            rule: "Every piece of inbound and outbound correspondence receives an atomic sequence number (IN-YYYY-000001 / OUT-YYYY-000001).",
          },
          {
            stepNumber: 2,
            action: "Physical Archival Routing",
            rule: "AI classifies document type and automatically stamps recommended physical shelf (e.g., Cabinet 2, Shelf B).",
          },
          {
            stepNumber: 3,
            action: "Cryptographic Tamper-Evident Ledger",
            rule: "Every intake event is appended to an immutable SHA-256 hash-chained regulatory ledger.",
          },
          {
            stepNumber: 4,
            action: "Obligation Sweep (60/30/14/7-Day Ladder)",
            rule: "Daily cron checks commercial registrations, vehicle licenses, and office insurance, escalating un-renewed assets.",
          },
        ],
      },
    ];

    return c.json(successResponse(sops));
  });

  return router;
}
