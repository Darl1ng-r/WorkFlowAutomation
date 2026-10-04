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

    // 3. Detect Utility / Expense Anomalies & Spikes
    let isAnomalySpike = false;
    let anomalyReason: string | undefined;

    // Strict word-boundary regex prevents false positives on 'Securitas', 'Current Tech', etc.
    const utilityVendorRegex = /\b(electric|electricity|water|telecom|rent|sec|nwc|stc|ooredoo|zain|municipality)\b/i;
    const isUtilityOrRecurring =
      extraction.category === "UTILITY_ELECTRICITY" ||
      extraction.category === "UTILITY_WATER" ||
      extraction.category === "OFFICE_RENT" ||
      extraction.category === "TELECOM" ||
      utilityVendorRegex.test(extraction.vendorName);

    const pastInvoices = await this.invoiceRepo.findByVendor(extraction.vendorName);
    
    // Filter to trailing 90 days and exclude previous anomalies to prevent baseline pollution
    const currentIssueMs = new Date(extraction.issueDate).getTime();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    const validBaselineInvoices = pastInvoices.filter((inv) => {
      const invMs = new Date(inv.issueDate).getTime();
      const isWithinWindow = (currentIssueMs - invMs) >= 0 && (currentIssueMs - invMs) <= ninetyDaysMs;
      return isWithinWindow && !inv.isAnomalySpike;
    });

    if (isUtilityOrRecurring && validBaselineInvoices.length > 0) {
      const historicalAverage =
        validBaselineInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0) / validBaselineInvoices.length;

      // If current invoice exceeds historical average by >15%
      if (extraction.totalAmount > historicalAverage * 1.15) {
        isAnomalySpike = true;
        const percentageIncrease = Math.round(
          ((extraction.totalAmount - historicalAverage) / historicalAverage) * 100
        );
        anomalyReason = `Utility Spike Detected: Total (${extraction.totalAmount} ${extraction.currency}) is ${percentageIncrease}% above the historical average (90-day baseline average: ${Math.round(historicalAverage * 100) / 100} ${extraction.currency}) across ${validBaselineInvoices.length} previous invoices.`;
      }
    }

    // 4. Evaluate Autonomy Level
    // If an anomaly spike is detected, force L2 (Human in the loop approval)
    let autonomyLevel = AutonomyPolicyEngine.evaluate({
      actionType: "INVOICE_EXTRACTION",
      confidenceScore,
      recentErrorRate,
    });

    if (isAnomalySpike) {
      autonomyLevel = "L2";
    }

    const nowIso = new Date().toISOString();
    const invoiceId = crypto.randomUUID();

    // Resolve clean category without improperly defaulting non-electricity vendors
    let resolvedCategory = extraction.category;
    if (!resolvedCategory) {
      if (/\b(electric|electricity|sec)\b/i.test(extraction.vendorName)) {
        resolvedCategory = "UTILITY_ELECTRICITY";
      } else if (/\b(water|nwc)\b/i.test(extraction.vendorName)) {
        resolvedCategory = "UTILITY_WATER";
      } else if (/\b(stc|ooredoo|zain|telecom)\b/i.test(extraction.vendorName)) {
        resolvedCategory = "TELECOM";
      } else if (/\b(rent)\b/i.test(extraction.vendorName)) {
        resolvedCategory = "OFFICE_RENT";
      } else {
        resolvedCategory = "OTHER";
      }
    }

    // 5. Save Invoice Record (DRAFT_PENDING if L2)
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
      category: resolvedCategory,
      isAnomalySpike,
      anomalyReason,
      status: autonomyLevel === "L3" ? "APPROVED" : "DRAFT_PENDING",
      createdAt: nowIso,
    };

    const savedInvoice = await this.invoiceRepo.create(invoice);

    // 6. If L2, generate Approval record and notify finance team
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
          isAnomalySpike,
          anomalyReason,
        },
        decision: "PENDING",
        decidedByEmail: undefined,
        decidedAt: undefined,
        createdAt: nowIso,
      };

      savedApproval = await this.approvalRepo.create(approval);

      if (this.notificationPort) {
        const notifTitle = isAnomalySpike
          ? `[Anomaly Alert] Expense Anomaly Detected: ${extraction.vendorName}`
          : `Invoice Review Required: ${extraction.vendorName}`;
        const notifMsg = isAnomalySpike
          ? `${anomalyReason} Verification required prior to bill draft creation.`
          : `Invoice #${extraction.invoiceNo} for ${extraction.totalAmount} ${extraction.currency} requires verification before bill draft creation.`;

        await this.notificationPort.sendCard({
          title: notifTitle,
          message: notifMsg,
          actionLabel: "Review Invoice",
          priority: isAnomalySpike ? "URGENT" : "HIGH",
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
