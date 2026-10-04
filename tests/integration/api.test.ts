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
  InMemorySupplyRepository,
  InMemoryRoomBookingRepository,
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
    const supplyRepo = new InMemorySupplyRepository();
    const roomBookingRepo = new InMemoryRoomBookingRepository();
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
      auditRepo,
      supplyRepo
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
      supplyRepo,
      roomBookingRepo,
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

  it("GET /api/rooms and POST /api/rooms/book should query and book meeting rooms", async () => {
    // 1. Query rooms
    const listRes = await app.request("/api/rooms");
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as any;
    expect(listBody.success).toBe(true);
    expect(Array.isArray(listBody.data)).toBe(true);

    // 2. Book a room
    const bookRes = await app.request("/api/rooms/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomName: "Board",
        timeSlot: "14:00 - 15:30",
        title: "Executive Strategy Review",
        hostName: "CEO",
      }),
    });
    expect(bookRes.status).toBe(201);
    const bookBody = (await bookRes.json()) as any;
    expect(bookBody.success).toBe(true);
    expect(bookBody.data.roomName).toBe("Board");

    // 3. Verify slot is now booked
    const verifyRes = await app.request("/api/rooms");
    const verifyBody = (await verifyRes.json()) as any;
    const boardRoom = verifyBody.data.find((r: any) => r.name === "Board");
    const bookedSlot = boardRoom.slots.find((s: any) => s.time === "14:00 - 15:30");
    expect(bookedSlot.status).toBe("BOOKED");
    expect(bookedSlot.title).toBe("Executive Strategy Review");
  });

  it("GET /api/audit should return immutable audit events", async () => {
    const res = await app.request("/api/audit");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("GET /api/metrics/telemetry should return live ROI, hours saved, and error capture rate", async () => {
    const res = await app.request("/api/metrics/telemetry");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(typeof body.data.hoursSaved).toBe("number");
    expect(typeof body.data.estimatedSavingsUsd).toBe("number");
    expect(typeof body.data.aiAccuracyScore).toBe("number");
    expect(body.data.channelBreakdown).toBeDefined();
    expect(body.data.autonomyDistribution).toBeDefined();
  });

  it("GET /api/system/sop should return dynamically compiled operational SOP runbooks", async () => {
    const res = await app.request("/api/system/sop");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.some((sop: any) => sop.id === "SOP-FD-01")).toBe(true);
    expect(body.data.some((sop: any) => sop.id === "SOP-FIN-01")).toBe(true);
  });

  it("POST /api/rooms/webhook/calendar should ingest Google Calendar resource events", async () => {
    const res = await app.request("/api/rooms/webhook/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomName: "Sync",
        timeSlot: "11:00 - 12:00",
        title: "Client Contract Signing",
        hostName: "Partner Legal",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.synced).toBe(true);

    // Verify room is now marked as booked
    const verifyRes = await app.request("/api/rooms");
    const verifyBody = (await verifyRes.json()) as any;
    const meetingRoom = verifyBody.data.find((r: any) => r.name === "Sync");
    const slot = meetingRoom.slots.find((s: any) => s.time === "11:00 - 12:00");
    expect(slot.status).toBe("BOOKED");
    expect(slot.title).toBe("Client Contract Signing");
  });

  it("GET /api/supplies and POST /api/supplies/:id/consume should manage par-level reorders", async () => {
    // 1. List supplies
    const listRes = await app.request("/api/supplies");
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as any;
    expect(listBody.success).toBe(true);
    expect(Array.isArray(listBody.data)).toBe(true);
    expect(listBody.data.length).toBeGreaterThanOrEqual(4);

    // 2. Consume coffee beans (par level is 3, initial is 2) -> triggers reorder approval
    const consumeRes = await app.request("/api/supplies/sup-002/consume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 1 }),
    });
    expect(consumeRes.status).toBe(200);
    const consumeBody = (await consumeRes.json()) as any;
    expect(consumeBody.success).toBe(true);
    expect(consumeBody.data.reorderTriggered).toBe(true);

    // 3. Verify approval record was created
    const appRes = await app.request("/api/approvals");
    const appBody = (await appRes.json()) as any;
    const reorderApproval = appBody.data.find(
      (a: any) => a.targetEntityType === "SUPPLY_REORDER" && a.targetEntityId === "sup-002"
    );
    expect(reorderApproval).toBeDefined();
    expect(reorderApproval.proposedPayload.name).toContain("Espresso Whole Beans");
  });

  it("GET /api/metrics/monthly-report should build live executive report from real data", async () => {
    const res = await app.request("/api/metrics/monthly-report");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.reportTitle).toContain("Office OS Monthly Report");
    expect(typeof body.data.hoursSaved).toBe("number");
    expect(typeof body.data.estimatedSavingsUsd).toBe("number");
    expect(body.data.markdownMemo).toContain("Executive Monthly Operations Progress Report");
    expect(body.data.markdownMemo).toContain("Total Labor Hours Saved");
    expect(body.data.markdownMemo).toContain("AI Extraction Accuracy");
  });

  it("STRICT MODE: unauthenticated corporate API requests should be rejected with 401 UNAUTHORIZED", async () => {
    const strictApp = createApp({ container, authMode: "STRICT" });
    const res = await strictApp.request("/api/approvals");
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("SECURITY: forged or malformed Cloudflare Access JWT assertion should be rejected with 401", async () => {
    const res = await app.request("/api/approvals", {
      headers: {
        "Cf-Access-Jwt-Assertion": "forged.header.signature",
      },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("RBAC: unauthorized STAFF role attempting to approve invoices should be rejected with 403 FORBIDDEN", async () => {
    // 1. Register prerequisite correspondence
    const corrRes = await app.request("/api/correspondence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        direction: "IN",
        channel: "EMAIL",
        subject: "Invoice SEC-RBAC-001 Inbound",
        sourceSender: "Saudi Electricity Company",
      }),
    });
    const corrBody = (await corrRes.json()) as any;
    const correspondenceId = corrBody.data.correspondence.id;

    // 2. Process an invoice that creates an approval
    await app.request("/api/invoices/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        correspondenceId,
        documentId: "b0000000-0000-0000-0000-000000000002",
        confidenceScore: 0.9,
        extraction: {
          vendorName: "Saudi Electricity Company",
          invoiceNo: "SEC-RBAC-001",
          issueDate: "2026-03-01",
          dueDate: "2026-03-15",
          netAmount: 1000,
          taxAmount: 150,
          totalAmount: 1150,
          currency: "SAR",
          lineItems: [],
        },
      }),
    });

    const approvalsRes = await app.request("/api/approvals");
    const approvalsBody = (await approvalsRes.json()) as any;
    const invApproval = approvalsBody.data.find((a: any) => a.targetEntityType === "INVOICE");
    expect(invApproval).toBeDefined();

    // 3. Attempt approval as regular staff (employee@company.local -> role 'STAFF')
    const staffRes = await app.request(`/api/approvals/${invApproval.id}/decide`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-email": "staff.member@company.com",
      },
      body: JSON.stringify({
        decision: "APPROVED",
        notes: "Unauthorized attempt",
      }),
    });

    expect(staffRes.status).toBe(403);
    const staffBody = (await staffRes.json()) as any;
    expect(staffBody.success).toBe(false);
    expect(staffBody.error.code).toBe("FORBIDDEN");
    expect(staffBody.error.message).toContain("Requires DIRECTOR or FINANCE");
  });

  it("SECURITY: Kiosk role cannot access internal visitor list or perform unauthorized checkout", async () => {
    // 1. Kiosk role accessing /api/kiosk/active should be forbidden
    const activeRes = await app.request("/api/kiosk/active", {
      headers: {
        "x-user-email": "frontdesk-kiosk@office.local",
      },
    });
    expect(activeRes.status).toBe(403);
    const activeBody = (await activeRes.json()) as any;
    expect(activeBody.error.code).toBe("FORBIDDEN");

    // 2. Kiosk role attempting checkout should be forbidden
    const checkOutRes = await app.request("/api/kiosk/check-out", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-email": "frontdesk-kiosk@office.local",
      },
      body: JSON.stringify({
        visitorId: "c0000000-0000-0000-0000-000000000003",
      }),
    });
    expect(checkOutRes.status).toBe(403);
    const checkOutBody = (await checkOutRes.json()) as any;
    expect(checkOutBody.error.code).toBe("FORBIDDEN");
  });

  it("POST /api/approvals/:id/undo should revert decided approval back to PENDING and roll back status", async () => {
    // 1. Trigger supply reorder
    await app.request("/api/supplies/sup-002/consume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 1 }),
    });

    const listRes = await app.request("/api/approvals");
    const listBody = (await listRes.json()) as any;
    const reorderApproval = listBody.data.find(
      (a: any) => a.targetEntityType === "SUPPLY_REORDER" && a.targetEntityId === "sup-002"
    );
    expect(reorderApproval).toBeDefined();

    // 2. Decide approval as Operations
    const decideRes = await app.request(`/api/approvals/${reorderApproval.id}/decide`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-email": "operations@company.com",
      },
      body: JSON.stringify({
        decision: "APPROVED",
        notes: "Approved coffee purchase",
      }),
    });
    expect(decideRes.status).toBe(200);

    // 3. Immediately Undo decision
    const undoRes = await app.request(`/api/approvals/${reorderApproval.id}/undo`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-email": "operations@company.com",
      },
    });
    expect(undoRes.status).toBe(200);
    const undoBody = (await undoRes.json()) as any;
    expect(undoBody.success).toBe(true);

    // 4. Verify approval is back to PENDING in database
    const pendingListRes = await app.request("/api/approvals");
    const pendingListBody = (await pendingListRes.json()) as any;
    const reverted = pendingListBody.data.find((a: any) => a.id === reorderApproval.id);
    expect(reverted).toBeDefined();
    expect(reverted.decision).toBe("PENDING");
  });

  it("CONCURRENCY: concurrent correspondence registrations should generate gapless unique reference numbers without collision", async () => {
    const concurrentRequests = Array.from({ length: 20 }, (_, i) =>
      app.request("/api/correspondence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: "IN",
          channel: "EMAIL",
          sourceSender: `Vendor ${i} Inc`,
          recipient: "Executive Office",
          subject: `Concurrent Contract Submission ${i}`,
        }),
      })
    );

    const responses = await Promise.all(concurrentRequests);
    const results = await Promise.all(responses.map((r) => r.json() as Promise<any>));

    const refNumbers = results.map((r) => {
      expect(r.success).toBe(true);
      return r.data.referenceNumber;
    });

    // Verify all 20 reference numbers are strictly unique
    const uniqueRefs = new Set(refNumbers);
    expect(uniqueRefs.size).toBe(20);
    for (const ref of uniqueRefs) {
      expect(ref).toMatch(/^IN-\d{4}-\d{6}$/);
    }
  });

  it("CRYPTOGRAPHY: audit events maintain unbroken SHA-256 hash chains", async () => {
    // Generate 3 sequential audit events
    await app.request("/api/correspondence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        direction: "IN",
        channel: "EMAIL",
        subject: "Audit Test Correspondence 1",
        sourceSender: "Ministry of Commerce",
      }),
    });
    await app.request("/api/correspondence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        direction: "IN",
        channel: "SCAN",
        subject: "Audit Test Correspondence 2",
        sourceSender: "ZATCA Tax Authority",
      }),
    });
    await app.request("/api/kiosk/check-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Auditor Smith",
        hostEmployeeEmail: "ceo@company.com",
        purpose: "Annual Audit Inspection",
        ndaSigned: true,
      }),
    });

    const auditRes = await app.request("/api/audit");
    expect(auditRes.status).toBe(200);
    const body = (await auditRes.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(3);

    // Verify that every event's prevHash corresponds to the prior event's chainHash
    // body.data is sorted descending (most recent first)
    const chronological = [...body.data].reverse();
    for (let i = 1; i < chronological.length; i++) {
      const prevEvent = chronological[i - 1];
      const currentEvent = chronological[i];
      expect(currentEvent.prevHash).toBe(prevEvent.payloadHash);
    }
  });
});
