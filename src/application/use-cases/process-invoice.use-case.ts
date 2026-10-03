import {
  IInvoiceRepository,
  IApprovalRepository,
  ICorrespondenceRepository,
  IAuditRepository,
} from "@domain/repositories";
import { INotificationPort } from "@application/ports";
import { InvoiceEntity, ApprovalEntity, AutonomyLevel } from "@domain/types";
import { AutonomyPolicyEngine } from "@application/autonomy-policy";
import { DuplicateEntityError, NotFoundError } from "@domain/errors";
import { InvoiceExtractionDTO } from "@schemas/invoice.schema";
import { calculateSha256Hex } from "./register-correspondence.use-case";

export interface ProcessInvoiceInput {
  correspondenceId: string;
  documentId: string;
  extraction: InvoiceExtractionDTO;
  confidenceScore: number;
  actorEmail?: string | undefined;
  recentErrorRate?: number | undefined;
}

export interface ProcessInvoiceOutput {
  invoice: InvoiceEntity;
  autonomyLevel: AutonomyLevel;
  approval?: ApprovalEntity | undefined;
}

export class ProcessInvoiceUseCase {
  constructor(
    private readonly invoiceRepo: IInvoiceRepository,
    private readonly correspondenceRepo: ICorrespondenceRepository,
    private readonly approvalRepo: IApprovalRepository,
    private readonly auditRepo: IAuditRepository,
    private readonly notificationPort?: INotificationPort
  ) {}

  public async execute(input: ProcessInvoiceInput): Promise<ProcessInvoiceOutput> {
    const { correspondenceId, documentId, extraction, confidenceScore, actorEmail, recentErrorRate } = input;

    // 1. Verify that correspondence exists
    const correspondence = await this.correspondenceRepo.findById(correspondenceId);
    if (!correspondence) {
      throw new NotFoundError("Correspondence", correspondenceId);
    }

    // 2. Check for duplicate invoice (Vendor + Invoice Number)
    const existingInvoice = await this.invoiceRepo.findByVendorAndNumber(
      extraction.vendorName,
      extraction.invoiceNo
    );
    if (existingInvoice) {
      throw new DuplicateEntityError(
        "Invoice",
        "Vendor and Invoice Number",
        `${extraction.vendorName} / ${extraction.invoiceNo}`
      );
    }

    // 3. Evaluate Autonomy Level
    const autonomyLevel = AutonomyPolicyEngine.evaluate({
      actionType: "INVOICE_EXTRACTION",
      confidenceScore,
      recentErrorRate,
    });

    const nowIso = new Date().toISOString();
    const invoiceId = crypto.randomUUID();

    // 4. Save Invoice Record (DRAFT_PENDING if L2)
    const invoice: InvoiceEntity = {
      id: invoiceId,
      documentId,
      correspondenceId,
      vendorName: extraction.vendorName,
      taxId: extraction.taxId,
      invoiceNo: extraction.invoiceNo,
      issueDate: extraction.issueDate,
      dueDate: extraction.dueDate,
      netAmount: extraction.netAmount,
      taxAmount: extraction.taxAmount,
      totalAmount: extraction.totalAmount,
      currency: extraction.currency,
      status: autonomyLevel === "L3" ? "APPROVED" : "DRAFT_PENDING",
      createdAt: nowIso,
    };

    const savedInvoice = await this.invoiceRepo.create(invoice);

    // 5. If L2, generate Approval record and notify finance team
    let savedApproval: ApprovalEntity | undefined;
    if (autonomyLevel === "L2") {
      const approval: ApprovalEntity = {
        id: crypto.randomUUID(),
        workflowRunId: `wf-inv-${invoiceId}`,
        targetEntityType: "INVOICE",
        targetEntityId: invoiceId,
        proposedAction: "SYNC_DRAFT_BILL_TO_ACCOUNTING",
        proposedPayload: {
          invoiceId,
          vendorName: extraction.vendorName,
          invoiceNo: extraction.invoiceNo,
          totalAmount: extraction.totalAmount,
          currency: extraction.currency,
          dueDate: extraction.dueDate,
        },
        decision: "APPROVED", // Default action proposed by AI, waiting for human decision
        decidedByEmail: undefined,
        decidedAt: undefined,
        createdAt: nowIso,
      };

      savedApproval = await this.approvalRepo.create(approval);

      if (this.notificationPort) {
        await this.notificationPort.sendCard({
          title: `Invoice Review Required: ${extraction.vendorName}`,
          message: `Invoice #${extraction.invoiceNo} for ${extraction.totalAmount} ${extraction.currency} requires verification before bill draft creation.`,
          actionLabel: "Review Invoice",
          priority: "HIGH",
        });
      }
    }

    // 6. Audit Trail
    const payloadHash = await calculateSha256Hex(
      new TextEncoder().encode(JSON.stringify({ invoiceId, vendor: extraction.vendorName, total: extraction.totalAmount }))
    );

    await this.auditRepo.append({
      actorEmail: actorEmail ?? "agent:finance",
      actorType: actorEmail ? "USER" : "AGENT",
      action: "INVOICE_PROCESSED",
      entityType: "INVOICE",
      entityId: savedInvoice.id,
      payloadHash,
      occurredAt: nowIso,
    });

    return {
      invoice: savedInvoice,
      autonomyLevel,
      approval: savedApproval,
    };
  }
}
