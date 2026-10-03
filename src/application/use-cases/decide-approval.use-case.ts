import {
  IApprovalRepository,
  IInvoiceRepository,
  ICorrespondenceRepository,
  IAuditRepository,
} from "@domain/repositories";
import { NotFoundError } from "@domain/errors";
import { ApprovalDecisionDTO } from "@schemas/approval.schema";
import { calculateSha256Hex } from "./register-correspondence.use-case";

export interface DecideApprovalInput {
  approvalId: string;
  dto: ApprovalDecisionDTO;
}

export class DecideApprovalUseCase {
  constructor(
    private readonly approvalRepo: IApprovalRepository,
    private readonly invoiceRepo: IInvoiceRepository,
    private readonly correspondenceRepo: ICorrespondenceRepository,
    private readonly auditRepo: IAuditRepository
  ) {}

  public async execute(input: DecideApprovalInput): Promise<void> {
    const { approvalId, dto } = input;

    // 1. Fetch approval record
    const approval = await this.approvalRepo.findById(approvalId);
    if (!approval) {
      throw new NotFoundError("Approval", approvalId);
    }

    // 2. Update approval record with decision & human diff
    await this.approvalRepo.updateDecision(
      approvalId,
      dto.decision,
      dto.decidedByEmail,
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
    }

    // 4. Record audit event
    const nowIso = new Date().toISOString();
    const payloadHash = await calculateSha256Hex(
      new TextEncoder().encode(JSON.stringify({ approvalId, decision: dto.decision, diff: dto.humanDiff }))
    );

    await this.auditRepo.append({
      actorEmail: dto.decidedByEmail,
      actorType: "USER",
      action: `APPROVAL_${dto.decision}`,
      entityType: approval.targetEntityType,
      entityId: approval.targetEntityId,
      payloadHash,
      occurredAt: nowIso,
    });
  }
}
