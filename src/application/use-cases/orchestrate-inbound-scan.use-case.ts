import {
  ICorrespondenceRepository,
  ISequenceRepository,
  IAuditRepository,
  IApprovalRepository,
  IObligationRepository,
} from "@domain/repositories";
import { ReferenceNumber } from "@domain/reference-number";
import {
  InboundScanPayload,
  OfficeAIOrchestrator,
  ScanOrchestrationResult,
} from "@infrastructure/ai/office-ai-orchestrator";
import { calculateSha256Hex } from "./register-correspondence.use-case";
import { CorrespondenceEntity, ObligationEntity, ApprovalEntity } from "@domain/types";

export interface OrchestrateInboundScanOutput {
  orchestration: ScanOrchestrationResult;
  referenceNumber: string;
  correspondence: CorrespondenceEntity;
  obligationCreated?: ObligationEntity | undefined;
  approvalQueued?: ApprovalEntity | undefined;
  actionSummary: string;
}

export class OrchestrateInboundScanUseCase {
  constructor(
    private readonly aiOrchestrator: OfficeAIOrchestrator,
    private readonly correspondenceRepo: ICorrespondenceRepository,
    private readonly sequenceRepo: ISequenceRepository,
    private readonly auditRepo: IAuditRepository,
    private readonly approvalRepo: IApprovalRepository,
    private readonly obligationRepo: IObligationRepository
  ) {}

  public async execute(scan: InboundScanPayload): Promise<OrchestrateInboundScanOutput> {
    // 1. Run AI Extraction & Shelf Classification
    const orchestration = await this.aiOrchestrator.orchestrateScan(scan);
    const nowIso = new Date().toISOString();
    const currentYear = new Date().getFullYear();

    // 2. Generate atomic gapless sequence
    const sequence = await this.sequenceRepo.getNextSequence("IN", currentYear);
    const referenceNumber = ReferenceNumber.create("IN", currentYear, sequence);
    const correspondenceId = crypto.randomUUID();

    // 3. Create & file Correspondence record with physical shelf metadata
    const correspondence: CorrespondenceEntity = {
      id: correspondenceId,
      refNo: referenceNumber.toString(),
      direction: "IN",
      channel: "SCAN",
      subject: orchestration.entities.subject,
      sourceSender: orchestration.entities.sender,
      recipient: orchestration.entities.recipient,
      status: orchestration.autonomyLevel === "L2" ? "PENDING_APPROVAL" : "FILED",
      classification: orchestration.entities.classification,
      physicalLocation: orchestration.entities.shelfLocation,
      dueDate: orchestration.entities.dueDate,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const savedCorrespondence = await this.correspondenceRepo.create(correspondence);

    // 4. Handle Compliance / Obligation auto-registration
    let obligationCreated: ObligationEntity | undefined;
    if (orchestration.entities.isComplianceNotice && orchestration.entities.obligationType) {
      obligationCreated = await this.obligationRepo.create({
        id: crypto.randomUUID(),
        title: orchestration.entities.subject,
        assetIdentifier: `${orchestration.entities.sender} Compliance Record`,
        kind: orchestration.entities.obligationType,
        referenceNo: referenceNumber.toString(),
        issuer: orchestration.entities.sender,
        expiresOn: orchestration.entities.expiresOn || orchestration.entities.dueDate || "2026-12-31",
        leadDays: 30,
        ownerEmail: "compliance@company.com",
        status: "ACTIVE",
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    // 5. Handle Human-in-the-Loop Approval Queue (L2 Autonomy Gate)
    let approvalQueued: ApprovalEntity | undefined;
    if (orchestration.autonomyLevel === "L2") {
      approvalQueued = await this.approvalRepo.create({
        id: crypto.randomUUID(),
        workflowRunId: `scan-${correspondenceId.slice(0, 8)}`,
        targetEntityType: "CORRESPONDENCE",
        targetEntityId: correspondenceId,
        proposedAction: orchestration.recommendedAction.type,
        proposedPayload: {
          referenceNumber: referenceNumber.toString(),
          sender: orchestration.entities.sender,
          shelfLocation: orchestration.entities.shelfLocation,
          classification: orchestration.entities.classification,
          dueDate: orchestration.entities.dueDate,
        },
        decision: "PENDING",
        notes: orchestration.recommendedAction.description,
        createdAt: nowIso,
      });
    }

    // 6. Append SHA-256 Audit Trail
    const payloadHash = await calculateSha256Hex(
      new TextEncoder().encode(
        JSON.stringify({
          refNo: referenceNumber.toString(),
          scanTextLength: scan.rawOcrText.length,
          classification: orchestration.entities.classification,
          shelf: orchestration.entities.shelfLocation,
        })
      )
    );

    await this.auditRepo.append({
      actorEmail: "ai-scanner@office-os.local",
      actorType: "AGENT",
      action: "ORCHESTRATE_SCANNED_LETTER",
      entityType: "CORRESPONDENCE",
      entityId: correspondenceId,
      payloadHash,
      occurredAt: nowIso,
    });

    const actionSummary = `Scanned document indexed as ${referenceNumber.toString()}. Physical filing assigned to: ${orchestration.entities.shelfLocation}. ${orchestration.recommendedAction.description}`;

    return {
      orchestration,
      referenceNumber: referenceNumber.toString(),
      correspondence: savedCorrespondence,
      obligationCreated,
      approvalQueued,
      actionSummary,
    };
  }
}
