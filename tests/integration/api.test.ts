import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "@api/app";
import { ServiceContainer } from "@infrastructure/container";
import {
  InMemorySequenceRepository,
  InMemoryCorrespondenceRepository,
  InMemoryDocumentRepository,
  InMemoryInvoiceRepository,
  InMemoryApprovalRepository,
  InMemoryObligationRepository,
  InMemoryVisitorRepository,
  InMemoryAuditRepository,
  MockNotificationPort,
} from "../mocks/in-memory-repositories";
import { RegisterCorrespondenceUseCase } from "@application/use-cases/register-correspondence.use-case";
import { ProcessInvoiceUseCase } from "@application/use-cases/process-invoice.use-case";
import { DecideApprovalUseCase } from "@application/use-cases/decide-approval.use-case";
import { VisitorCheckInUseCase } from "@application/use-cases/visitor-check-in.use-case";
import { CheckExpiringObligationsUseCase } from "@application/use-cases/check-expiring-obligations.use-case";

describe("API End-to-End Integration Tests", () => {
  let app: ReturnType<typeof createApp>;
  let container: ServiceContainer;

  beforeEach(() => {
    const sequenceRepo = new InMemorySequenceRepository();
    const correspondenceRepo = new InMemoryCorrespondenceRepository();
    const documentRepo = new InMemoryDocumentRepository();
    const invoiceRepo = new InMemoryInvoiceRepository();
    const approvalRepo = new InMemoryApprovalRepository();
    const obligationRepo = new InMemoryObligationRepository();
    const visitorRepo = new InMemoryVisitorRepository();
    const auditRepo = new InMemoryAuditRepository();
    const notificationPort = new MockNotificationPort();

    const registerCorrespondence = new RegisterCorrespondenceUseCase(
      correspondenceRepo,
      sequenceRepo,
      documentRepo,
      auditRepo
    );
    const processInvoice = new ProcessInvoiceUseCase(
      invoiceRepo,
      correspondenceRepo,
      approvalRepo,
      auditRepo,
      notificationPort
    );
    const decideApproval = new DecideApprovalUseCase(
      approvalRepo,
      invoiceRepo,
      correspondenceRepo,
      auditRepo
    );
    const visitorCheckIn = new VisitorCheckInUseCase(visitorRepo, auditRepo, notificationPort);
    const checkExpiringObligations = new CheckExpiringObligationsUseCase(obligationRepo, auditRepo, notificationPort);

    container = {
      sequenceRepo,
      correspondenceRepo,
      documentRepo,
      invoiceRepo,
      approvalRepo,
      obligationRepo,
      visitorRepo,
      auditRepo,
      notificationPort,
      registerCorrespondence,
      processInvoice,
      decideApproval,
      visitorCheckIn,
      checkExpiringObligations,
    };

    app = createApp({ container });
  });

  it("GET /api/health should return 200 with system info", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("HEALTHY");
    expect(body.data.system).toContain("Office OS");
  });

  it("GET / and GET /kiosk should serve the interactive web interface", async () => {
    const rootRes = await app.request("/");
    expect(rootRes.status).toBe(200);
    const rootHtml = await rootRes.text();
    expect(rootHtml).toContain("Office OS");
    expect(rootHtml).toContain("Central Correspondence Register");

    const kioskRes = await app.request("/kiosk");
    expect(kioskRes.status).toBe(200);
    const kioskHtml = await kioskRes.text();
    expect(kioskHtml).toContain("Front Desk & Visitor Reception");
  });

  it("POST /api/correspondence should register new correspondence with gapless ref no", async () => {
    const payload = {
      direction: "IN",
      channel: "EMAIL",
      subject: "Annual General Meeting Notice",
      sourceSender: "legal@partner.com",
      classification: "CONFIDENTIAL",
    };

    const res = await app.request("/api/correspondence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.referenceNumber).toMatch(/^IN-\d{4}-000001$/);
    expect(body.data.correspondence.subject).toBe(payload.subject);
  });

  it("POST /api/kiosk/check-in should allow unauthenticated visitor check-in", async () => {
    const visitorPayload = {
      fullName: "Fatima Al-Zahrani",
      company: "National Audit Bureau",
      email: "fatima@nab.gov.sa",
      hostEmployeeEmail: "finance.head@company.com",
      purpose: "Tax clearance review",
      ndaSigned: true,
    };

    const res = await app.request("/api/kiosk/check-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(visitorPayload),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.fullName).toBe("Fatima Al-Zahrani");
    expect(body.data.badgeNumber).toMatch(/^V-\d{4}$/);

    // Verify active visitors list
    const activeRes = await app.request("/api/kiosk/active");
    const activeBody = (await activeRes.json()) as any;
    expect(activeBody.data.length).toBe(1);
    expect(activeBody.data[0].id).toBe(body.data.id);
  });

  it("POST /api/invoices/process should enforce L2 approval gate", async () => {
    // 1. Create correspondence
    const regRes = await app.request("/api/correspondence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        direction: "IN",
        channel: "EMAIL",
        subject: "Invoice #INV-2026-001",
      }),
    });
    const regBody = (await regRes.json()) as any;
    const correspondenceId = regBody.data.correspondence.id;

    // 2. Process invoice
    const invoicePayload = {
      correspondenceId,
      documentId: crypto.randomUUID(),
      confidenceScore: 0.95,
      extraction: {
        vendorName: "Amazon Web Services",
        invoiceNo: "AWS-991203",
        issueDate: "2026-10-01",
        dueDate: "2026-10-31",
        netAmount: 1500.0,
        taxAmount: 225.0,
        totalAmount: 1725.0,
        currency: "USD",
        lineItems: [],
      },
    };

    const invRes = await app.request("/api/invoices/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invoicePayload),
    });

    expect(invRes.status).toBe(201);
    const invBody = (await invRes.json()) as any;
    expect(invBody.success).toBe(true);
    expect(invBody.data.autonomyLevel).toBe("L2");
    expect(invBody.data.invoice.status).toBe("DRAFT_PENDING");

    // 3. Inspect Approvals Inbox
    const appRes = await app.request("/api/approvals");
    const appBody = (await appRes.json()) as any;
    expect(appBody.data.length).toBe(1);
    expect(appBody.data[0].targetEntityId).toBe(invBody.data.invoice.id);

    // 4. Decide approval
    const approvalId = appBody.data[0].id;
    const decideRes = await app.request(`/api/approvals/${approvalId}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: "APPROVED",
        decidedByEmail: "cfo@company.com",
        notes: "Verified against AWS account billing console.",
      }),
    });

    expect(decideRes.status).toBe(200);
    const decideBody = (await decideRes.json()) as any;
    expect(decideBody.success).toBe(true);

    // 5. Verify invoice status is updated to APPROVED
    const updatedInvoice = await container.invoiceRepo.findById(invBody.data.invoice.id);
    expect(updatedInvoice?.status).toBe("APPROVED");
  });

  it("POST /api/invoices/process should return 400 for arithmetic validation failure", async () => {
    const invalidPayload = {
      correspondenceId: crypto.randomUUID(),
      documentId: crypto.randomUUID(),
      confidenceScore: 0.95,
      extraction: {
        vendorName: "Faulty Vendor",
        invoiceNo: "ERR-999",
        issueDate: "2026-10-01",
        dueDate: "2026-10-31",
        netAmount: 100,
        taxAmount: 15,
        totalAmount: 200, // Arithmetic error!
        currency: "SAR",
      },
    };

    const res = await app.request("/api/invoices/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invalidPayload),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
  });
});
