import {
  IApprovalRepository,
  IInvoiceRepository,
  ICorrespondenceRepository,
  IAuditRepository,
  ISupplyRepository,
} from "@domain/repositories";
import { NotFoundError } from "@domain/errors";
import { ApprovalDecisionDTO } from "@schemas/approval.schema";
import { calculateSha256Hex } from "./register-correspondence.use-case";

export interface DecideApprovalInput {
  approvalId: string;
  dto: ApprovalDecisionDTO;
  actorEmail?: string | undefined;
}

export class DecideApprovalUseCase {
  constructor(
    private readonly approvalRepo: IApprovalRepository,
    private readonly invoiceRepo: IInvoiceRepository,
    private readonly correspondenceRepo: ICorrespondenceRepository,
    private readonly auditRepo: IAuditRepository,
    private readonly supplyRepo?: ISupplyRepository
  ) {}

  public async execute(input: DecideApprovalInput): Promise<void> {
    const { approvalId, dto, actorEmail } = input;

    // 1. Fetch approval record
    const approval = await this.approvalRepo.findById(approvalId);
    if (!approval) {
      throw new NotFoundError("Approval", approvalId);
    }

    const effectiveApprover = actorEmail || dto.decidedByEmail || "admin@company.com";

    // 2. Update approval record with decision & human diff
    await this.approvalRepo.updateDecision(
      approvalId,
      dto.decision,
      effectiveApprover,
      dto.humanDiff,
      dto.notes
    );

    // 3. Cascade state changes to underlying domain entity
    if (approval.targetEntityType === "INVOICE") {
      const invoiceStatus = dto.decision === "REJECTED" ? "REJECTED" : "APPROVED";
      await this.invoiceRepo.updateStatus(approval.targetEntityId, invoiceStatus);
    } else if (approval.targetEntityType === "CORRESPONDENCE") {
      const corrStatus = dto.decision === "REJECTED" ? "REJECTED" : "APPROVED";
      await this.correspondenceRepo.updateStatus(approval.targetEntityId, corrStatus);
    } else if (approval.targetEntityType === "SUPPLY_REORDER" && this.supplyRepo) {
      const supplyStatus = dto.decision === "REJECTED" ? "LOW_STOCK" : "OK";
      await this.supplyRepo.updateStatus(approval.targetEntityId, supplyStatus);
    }

    // 4. Record audit event
    const nowIso = new Date().toISOString();
    const payloadHash = await calculateSha256Hex(
      new TextEncoder().encode(JSON.stringify({ approvalId, decision: dto.decision, diff: dto.humanDiff }))
    );

    await this.auditRepo.append({
      actorEmail: effectiveApprover,
      actorType: "USER",
      action: `APPROVAL_${dto.decision}`,
      entityType: approval.targetEntityType,
      entityId: approval.targetEntityId,
      payloadHash,
      occurredAt: nowIso,
    });
  }

  public async revert(approvalId: string, revertedByEmail: string): Promise<void> {
    const approval = await this.approvalRepo.findById(approvalId);
    if (!approval) {
      throw new NotFoundError("Approval", approvalId);
    }

    await this.approvalRepo.updateDecision(
      approvalId,
      "PENDING",
      revertedByEmail,
      undefined,
      "Decision reverted back to pending"
    );

    if (approval.targetEntityType === "INVOICE") {
      await this.invoiceRepo.updateStatus(approval.targetEntityId, "DRAFT_PENDING");
    } else if (approval.targetEntityType === "CORRESPONDENCE") {
      await this.correspondenceRepo.updateStatus(approval.targetEntityId, "PENDING_APPROVAL");
    } else if (approval.targetEntityType === "SUPPLY_REORDER" && this.supplyRepo) {
      await this.supplyRepo.updateStatus(approval.targetEntityId, "REORDER_TRIGGERED");
    }

    const nowIso = new Date().toISOString();
    const payloadHash = await calculateSha256Hex(
      new TextEncoder().encode(JSON.stringify({ approvalId, action: "REVERT" }))
    );

    await this.auditRepo.append({
      actorEmail: revertedByEmail,
      actorType: "USER",
      action: "APPROVAL_REVERTED",
      entityType: approval.targetEntityType,
      entityId: approval.targetEntityId,
      payloadHash,
      occurredAt: nowIso,
    });
  }
}
