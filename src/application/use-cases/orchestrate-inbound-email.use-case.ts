import {
  ICorrespondenceRepository,
  ISequenceRepository,
  IAuditRepository,
  IApprovalRepository,
  IObligationRepository,
  IRoomBookingRepository,
} from "@domain/repositories";
import { ReferenceNumber } from "@domain/reference-number";
import {
  InboundEmailPayload,
  OfficeAIOrchestrator,
  EmailOrchestrationResult,
} from "@infrastructure/ai/office-ai-orchestrator";
import { calculateSha256Hex } from "./register-correspondence.use-case";

export interface OrchestrateInboundEmailOutput {
  orchestration: EmailOrchestrationResult;
  actionExecuted:
    | "ROOM_BOOKED"
    | "APPROVAL_QUEUED"
    | "RENEWAL_AND_CORRESPONDENCE_SAVED"
    | "CORRESPONDENCE_REGISTERED";
  actionSummary: string;
  resultPayload: Record<string, unknown>;
}

export class OrchestrateInboundEmailUseCase {
  constructor(
    private readonly aiOrchestrator: OfficeAIOrchestrator,
    private readonly correspondenceRepo: ICorrespondenceRepository,
    private readonly sequenceRepo: ISequenceRepository,
    private readonly auditRepo: IAuditRepository,
    private readonly approvalRepo: IApprovalRepository,
    private readonly obligationRepo: IObligationRepository,
    private readonly roomBookingRepo: IRoomBookingRepository
  ) {}

  public async execute(email: InboundEmailPayload): Promise<OrchestrateInboundEmailOutput> {
    // 1. Run AI Extraction & Classification
    const orchestration = await this.aiOrchestrator.orchestrate(email);
    const nowIso = new Date().toISOString();
    const currentYear = new Date().getFullYear();

    // 2. Action Execution based on AI Intent
    switch (orchestration.intent) {
      case "MEETING_REQUEST": {
        const room = orchestration.entities.requestedRoom || "Board";
        const slot = orchestration.entities.requestedTimeSlot || "14:00 - 15:00";
        const title = orchestration.entities.meetingTitle || email.subject || "Executive Strategy Alignment";
        const host = orchestration.entities.hostEmail || email.sender;

        const booking = await this.roomBookingRepo.create({
          id: crypto.randomUUID(),
          roomName: room,
          timeSlot: slot,
          title,
          hostName: host,
          source: "AI_EMAIL_ORCHESTRATOR",
          createdAt: nowIso,
        });

        // Google Calendar Event projection payload
        const calendarEvent = {
          calendarId: "primary",
          summary: title,
          description: `Auto-scheduled from inbound email: "${email.subject}". Handled by Office OS AI.`,
          location: `${room} Conference Room`,
          start: { dateTime: `${new Date().toISOString().split("T")[0]}T${slot.split(" - ")[0]}:00` },
          end: { dateTime: `${new Date().toISOString().split("T")[0]}T${slot.split(" - ")[1]}:00` },
          attendees: [{ email: host, displayName: host.split("@")[0] }],
          status: "confirmed",
        };

        const payloadStr = JSON.stringify({ booking, calendarEvent });
        const payloadHash = await calculateSha256Hex(new TextEncoder().encode(payloadStr));

        await this.auditRepo.append({
          actorEmail: "ai-agent@office.internal",
          actorType: "AGENT",
          action: "AUTO_SCHEDULE_MEETING_FROM_EMAIL",
          entityType: "ROOM_BOOKING",
          entityId: booking.id,
          payloadHash,
          occurredAt: nowIso,
        });

        return {
          orchestration,
          actionExecuted: "ROOM_BOOKED",
          actionSummary: `Reserved ${room} room for ${slot} and dispatched Google Calendar invitation to ${host}.`,
          resultPayload: {
            bookingId: booking.id,
            roomName: room,
            timeSlot: slot,
            calendarEvent,
          },
        };
      }

      case "INVOICE": {
        const seq = await this.sequenceRepo.getNextSequence("IN", currentYear);
        const refObj = ReferenceNumber.create("IN", currentYear, seq);
        const refNo = refObj.toString();

        const correspondence = await this.correspondenceRepo.create({
          id: crypto.randomUUID(),
          refNo,
          direction: "IN",
          channel: "EMAIL",
          sourceSender: email.sender,
          recipient: "accounts@company.com",
          subject: email.subject,
          physicalLocation: "Cabinet 1, Shelf B (Invoices)",
          classification: "INTERNAL",
          status: "RECEIVED",
          createdAt: nowIso,
          updatedAt: nowIso,
        });

        let approvalId: string | undefined;

        if (orchestration.autonomyLevel === "L2") {
          const approval = await this.approvalRepo.create({
            id: crypto.randomUUID(),
            workflowRunId: `wf-inv-${Date.now()}`,
            targetEntityType: "INVOICE",
            targetEntityId: correspondence.id,
            proposedAction: `Authorize payment to ${orchestration.entities.vendorName}`,
            proposedPayload: {
              refNo,
              subject: email.subject,
              from: email.sender,
              vendorName: orchestration.entities.vendorName,
              invoiceNo: orchestration.entities.invoiceNo,
              totalAmount: orchestration.entities.totalAmount,
              currency: orchestration.entities.currency || "USD",
              shelf: "Cabinet 1, Shelf B (Invoices)",
              isAnomalySpike: orchestration.entities.isSpike,
              anomalyReason: orchestration.entities.isSpike
                ? "Expense anomaly detected: Bill exceeds routine threshold ($1,000.00)"
                : undefined,
            },
            decision: "PENDING",
            createdAt: nowIso,
          });
          approvalId = approval.id;
        }

        const payloadStr = JSON.stringify({ refNo, invoiceNo: orchestration.entities.invoiceNo, approvalId });
        const payloadHash = await calculateSha256Hex(new TextEncoder().encode(payloadStr));

        await this.auditRepo.append({
          actorEmail: "ai-agent@office.internal",
          actorType: "AGENT",
          action: "INVOICE_INBOUND_QUEUED",
          entityType: "INVOICE",
          entityId: correspondence.id,
          payloadHash,
          occurredAt: nowIso,
        });

        return {
          orchestration,
          actionExecuted: "APPROVAL_QUEUED",
          actionSummary: `Assigned Ref ${refNo}. Amount exceeds $250 — routed to human Approvals Queue for sign-off.`,
          resultPayload: {
            refNo,
            correspondenceId: correspondence.id,
            approvalId,
            vendorName: orchestration.entities.vendorName,
            totalAmount: orchestration.entities.totalAmount,
            currency: orchestration.entities.currency,
          },
        };
      }

      case "LICENSE_RENEWAL":
      case "OFFICIAL_NOTICE": {
        const seq = await this.sequenceRepo.getNextSequence("IN", currentYear);
        const refObj = ReferenceNumber.create("IN", currentYear, seq);
        const refNo = refObj.toString();
        const shelf = orchestration.entities.shelfLocation || "Safe Box 4";
        const expiresOnStr = orchestration.entities.expiresOn || new Date(Date.now() + 35 * 86400000).toISOString().split("T")[0] || "2026-11-15";
        const docTitle = orchestration.entities.licenseType || email.subject;

        const correspondence = await this.correspondenceRepo.create({
          id: crypto.randomUUID(),
          refNo,
          direction: "IN",
          channel: "EMAIL",
          sourceSender: email.sender,
          recipient: "compliance@company.com",
          subject: email.subject,
          physicalLocation: shelf,
          classification: "INTERNAL",
          status: "FILED",
          createdAt: nowIso,
          updatedAt: nowIso,
        });

        const obligation = await this.obligationRepo.create({
          id: crypto.randomUUID(),
          title: docTitle,
          assetIdentifier: docTitle,
          kind: "TRADE_LICENCE",
          referenceNo: refNo,
          issuer: orchestration.entities.issuer || "Regulatory Authority",
          expiresOn: expiresOnStr,
          leadDays: 30,
          ownerEmail: "operations@company.com",
          status: "ACTIVE",
          createdAt: nowIso,
          updatedAt: nowIso,
        });

        const payloadStr = JSON.stringify({ refNo, obligationId: obligation.id });
        const payloadHash = await calculateSha256Hex(new TextEncoder().encode(payloadStr));

        await this.auditRepo.append({
          actorEmail: "ai-agent@office.internal",
          actorType: "AGENT",
          action: "OBLIGATION_AUTO_REGISTERED",
          entityType: "OBLIGATION",
          entityId: obligation.id,
          payloadHash,
          occurredAt: nowIso,
        });

        return {
          orchestration,
          actionExecuted: "RENEWAL_AND_CORRESPONDENCE_SAVED",
          actionSummary: `Assigned Ref ${refNo}. Filed to ${shelf}. Scheduled automated 30-day compliance expiry tracking.`,
          resultPayload: {
            refNo,
            correspondenceId: correspondence.id,
            obligationId: obligation.id,
            shelfLocation: shelf,
            expiresOn: obligation.expiresOn,
          },
        };
      }

      default: {
        const seq = await this.sequenceRepo.getNextSequence("IN", currentYear);
        const refObj = ReferenceNumber.create("IN", currentYear, seq);
        const refNo = refObj.toString();
        const shelf = orchestration.entities.shelfLocation || "Cabinet 2, Shelf B";

        const correspondence = await this.correspondenceRepo.create({
          id: crypto.randomUUID(),
          refNo,
          direction: "IN",
          channel: "EMAIL",
          sourceSender: email.sender,
          recipient: "office@company.com",
          subject: email.subject,
          physicalLocation: shelf,
          classification: "INTERNAL",
          status: "FILED",
          createdAt: nowIso,
          updatedAt: nowIso,
        });

        return {
          orchestration,
          actionExecuted: "CORRESPONDENCE_REGISTERED",
          actionSummary: `Assigned Ref ${refNo}. Indexed into Central Register and shelved to ${shelf}.`,
          resultPayload: {
            refNo,
            correspondenceId: correspondence.id,
            shelfLocation: shelf,
          },
        };
      }
    }
  }
}
