import { describe, it, expect, beforeEach } from "vitest";
import { RegisterCorrespondenceUseCase } from "@application/use-cases/register-correspondence.use-case";
import { ProcessInvoiceUseCase } from "@application/use-cases/process-invoice.use-case";
import { DecideApprovalUseCase } from "@application/use-cases/decide-approval.use-case";
import { VisitorCheckInUseCase } from "@application/use-cases/visitor-check-in.use-case";
import { CheckExpiringObligationsUseCase } from "@application/use-cases/check-expiring-obligations.use-case";
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
import { DuplicateEntityError } from "@domain/errors";

describe("Application Use Cases", () => {
  let seqRepo: InMemorySequenceRepository;
  let corrRepo: InMemoryCorrespondenceRepository;
  let docRepo: InMemoryDocumentRepository;
  let invRepo: InMemoryInvoiceRepository;
  let appRepo: InMemoryApprovalRepository;
  let oblRepo: InMemoryObligationRepository;
  let visRepo: InMemoryVisitorRepository;
  let auditRepo: InMemoryAuditRepository;
  let notifPort: MockNotificationPort;

  beforeEach(() => {
    seqRepo = new InMemorySequenceRepository();
    corrRepo = new InMemoryCorrespondenceRepository();
    docRepo = new InMemoryDocumentRepository();
    invRepo = new InMemoryInvoiceRepository();
    appRepo = new InMemoryApprovalRepository();
    oblRepo = new InMemoryObligationRepository();
    visRepo = new InMemoryVisitorRepository();
    auditRepo = new InMemoryAuditRepository();
    notifPort = new MockNotificationPort();
  });

  describe("RegisterCorrespondenceUseCase", () => {
    it("should register an inbound document with atomic reference number and hash-chained audit", async () => {
      const useCase = new RegisterCorrespondenceUseCase(
        corrRepo,
        seqRepo,
        docRepo,
        auditRepo
      );

      const fileData = new TextEncoder().encode("Sample PDF invoice content");
      const result = await useCase.execute({
        actorEmail: "operations@company.com",
        dto: {
          direction: "IN",
          channel: "EMAIL",
          subject: "Tax Invoice from Vendor A",
          sourceSender: "billing@vendor-a.com",
          classification: "INTERNAL",
        },
        fileAttachment: {
          name: "invoice-001.pdf",
          data: fileData,
          mimeType: "application/pdf",
        },
      });

      const currentYear = new Date().getFullYear();
      expect(result.referenceNumber).toBe(`IN-${currentYear}-000001`);
      expect(result.correspondence.refNo).toBe(`IN-${currentYear}-000001`);
      expect(result.document).toBeDefined();
      expect(result.document?.fileName).toBe("invoice-001.pdf");

      // Verify audit log
      expect(auditRepo.items.length).toBe(1);
      expect(auditRepo.items[0]?.action).toBe("CORRESPONDENCE_REGISTERED");
      expect(auditRepo.items[0]?.prevHash).toBe("0000000000000000000000000000000000000000000000000000000000000000");
    });

    it("should reject duplicate document file upload with the exact same SHA-256", async () => {
      const useCase = new RegisterCorrespondenceUseCase(
        corrRepo,
        seqRepo,
        docRepo,
        auditRepo
      );

      const fileData = new TextEncoder().encode("Identical file contents");

      await useCase.execute({
        actorEmail: "ops@company.com",
        dto: {
          direction: "IN",
          channel: "UPLOAD",
          subject: "First upload",
          classification: "INTERNAL",
        },
        fileAttachment: {
          name: "doc.pdf",
          data: fileData,
          mimeType: "application/pdf",
        },
      });

      // Second upload with identical file
      await expect(
        useCase.execute({
          actorEmail: "ops@company.com",
          dto: {
            direction: "IN",
            channel: "UPLOAD",
            subject: "Second upload identical",
            classification: "INTERNAL",
          },
          fileAttachment: {
            name: "duplicate_doc.pdf",
            data: fileData,
            mimeType: "application/pdf",
          },
        })
      ).rejects.toThrow(DuplicateEntityError);
    });
  });

  describe("ProcessInvoiceUseCase", () => {
    it("should process an invoice, detect L2 gate, create approval record, and send notification card", async () => {
      // Setup initial correspondence
      const corr = await corrRepo.create({
        id: "corr-100",
        refNo: "IN-2026-000001",
        direction: "IN",
        channel: "EMAIL",
        subject: "Invoice from Vendor B",
        status: "RECEIVED",
        classification: "INTERNAL",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const useCase = new ProcessInvoiceUseCase(
        invRepo,
        corrRepo,
        appRepo,
        auditRepo,
        notifPort
      );

      const result = await useCase.execute({
        correspondenceId: corr.id,
        documentId: "doc-100",
        confidenceScore: 0.94,
        extraction: {
          vendorName: "Saudi Electric Company",
          invoiceNo: "SEC-998822",
          issueDate: "2026-10-01",
          dueDate: "2026-10-25",
          netAmount: 2000,
          taxAmount: 300,
          totalAmount: 2300,
          currency: "SAR",
          lineItems: [],
        },
      });

      expect(result.autonomyLevel).toBe("L2");
      expect(result.invoice.status).toBe("DRAFT_PENDING");
      expect(result.approval).toBeDefined();
      expect(result.approval?.proposedAction).toBe("SYNC_DRAFT_BILL_TO_ACCOUNTING");
      expect(notifPort.sentCards.length).toBe(1);
      expect(notifPort.sentCards[0]?.title).toContain("Invoice Review Required");
    });

    it("should reject duplicate invoice for the same vendor and invoice number", async () => {
      const corr = await corrRepo.create({
        id: "corr-200",
        refNo: "IN-2026-000002",
        direction: "IN",
        channel: "EMAIL",
        subject: "Invoice",
        status: "RECEIVED",
        classification: "INTERNAL",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const useCase = new ProcessInvoiceUseCase(
        invRepo,
        corrRepo,
        appRepo,
        auditRepo
      );

      const extraction = {
        vendorName: "Telecom Co",
        invoiceNo: "TC-001",
        issueDate: "2026-10-01",
        dueDate: "2026-10-20",
        netAmount: 500,
        taxAmount: 75,
        totalAmount: 575,
        currency: "SAR",
        lineItems: [],
      };

      await useCase.execute({
        correspondenceId: corr.id,
        documentId: "doc-200",
        confidenceScore: 0.95,
        extraction,
      });

      // Attempt duplicate
      await expect(
        useCase.execute({
          correspondenceId: corr.id,
          documentId: "doc-201",
          confidenceScore: 0.95,
          extraction,
        })
      ).rejects.toThrow(DuplicateEntityError);
    });
  });

  describe("DecideApprovalUseCase", () => {
    it("should update approval with decision and cascade status to invoice entity", async () => {
      const inv = await invRepo.create({
        id: "inv-300",
        correspondenceId: "corr-300",
        documentId: "doc-300",
        vendorName: "Office Depot",
        invoiceNo: "OD-456",
        issueDate: "2026-10-01",
        dueDate: "2026-10-15",
        netAmount: 100,
        taxAmount: 15,
        totalAmount: 115,
        currency: "SAR",
        status: "DRAFT_PENDING",
        createdAt: new Date().toISOString(),
      });

      const app = await appRepo.create({
        id: "app-300",
        workflowRunId: "wf-inv-inv-300",
        targetEntityType: "INVOICE",
        targetEntityId: inv.id,
        proposedAction: "SYNC_DRAFT_BILL",
        proposedPayload: {},
        decision: "APPROVED",
        createdAt: new Date().toISOString(),
      });

      const useCase = new DecideApprovalUseCase(
        appRepo,
        invRepo,
        corrRepo,
        auditRepo
      );

      await useCase.execute({
        approvalId: app.id,
        dto: {
          decision: "APPROVED",
          decidedByEmail: "cfo@company.com",
          notes: "Approved after verifying VAT calculation.",
        },
      });

      const updatedInv = await invRepo.findById(inv.id);
      expect(updatedInv?.status).toBe("APPROVED");

      const updatedApp = await appRepo.findById(app.id);
      expect(updatedApp?.decidedByEmail).toBe("cfo@company.com");
      expect(updatedApp?.notes).toContain("Approved after verifying");
    });
  });

  describe("VisitorCheckInUseCase", () => {
    it("should register visitor, assign badge number, and alert host", async () => {
      const useCase = new VisitorCheckInUseCase(visRepo, auditRepo, notifPort);

      const visitor = await useCase.execute({
        dto: {
          fullName: "Ahmed Al-Mansoor",
          company: "Ministry of Commerce",
          email: "ahmed@mc.gov.sa",
          hostEmployeeEmail: "ceo@company.com",
          purpose: "Annual trade licence audit",
          ndaSigned: true,
        },
      });

      expect(visitor.fullName).toBe("Ahmed Al-Mansoor");
      expect(visitor.badgeNumber).toMatch(/^V-\d{4}$/);
      expect(notifPort.sentCards.length).toBe(1);
      expect(notifPort.sentCards[0]?.recipientEmail).toBe("ceo@company.com");
      expect(notifPort.sentCards[0]?.title).toContain("Visitor Arrived");
    });
  });

  describe("CheckExpiringObligationsUseCase", () => {
    it("should identify expiring obligations within threshold and send reminders", async () => {
      const in10Days = new Date();
      in10Days.setDate(in10Days.getDate() + 10);

      const in90Days = new Date();
      in90Days.setDate(in90Days.getDate() + 90);

      await oblRepo.create({
        id: "obl-1",
        title: "Vehicle Comprehensive Insurance",
        assetIdentifier: "Toyota Camry 2024",
        kind: "INSURANCE",
        referenceNo: "INS-POL-9921",
        issuer: "Tawuniya Insurance",
        expiresOn: in10Days.toISOString().split("T")[0]!,
        leadDays: 30,
        ownerEmail: "fleet@company.com",
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await oblRepo.create({
        id: "obl-2",
        title: "Building Fire Safety Certificate",
        assetIdentifier: "HQ Building",
        kind: "BUILDING_REGISTRATION",
        referenceNo: "CIVIL-DEF-8821",
        issuer: "Civil Defense",
        expiresOn: in90Days.toISOString().split("T")[0]!,
        leadDays: 30,
        ownerEmail: "facility@company.com",
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const useCase = new CheckExpiringObligationsUseCase(oblRepo, auditRepo, notifPort);
      const result = await useCase.execute(30);

      expect(result.expiringCount).toBe(1);
      expect(result.expiringObligations[0]?.id).toBe("obl-1");
      expect(notifPort.sentCards.length).toBe(1);
      expect(notifPort.sentCards[0]?.recipientEmail).toBe("fleet@company.com");

      // Verify status transitioned to EXPIRING_SOON
      const updatedObl = await oblRepo.findById("obl-1");
      expect(updatedObl?.status).toBe("EXPIRING_SOON");
    });
  });
});
