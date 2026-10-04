import { describe, it, expect, beforeEach } from "vitest";
import { OfficeAIOrchestrator } from "@infrastructure/ai/office-ai-orchestrator";
import { OrchestrateInboundEmailUseCase } from "@application/use-cases/orchestrate-inbound-email.use-case";
import {
  ICorrespondenceRepository,
  ISequenceRepository,
  IAuditRepository,
  IApprovalRepository,
  IObligationRepository,
  IRoomBookingRepository,
} from "@domain/repositories";

describe("OfficeAIOrchestrator & Inbound Email Orchestration", () => {
  let orchestrator: OfficeAIOrchestrator;
  let useCase: OrchestrateInboundEmailUseCase;

  let mockCorrespondenceRepo: ICorrespondenceRepository;
  let mockSequenceRepo: ISequenceRepository;
  let mockAuditRepo: IAuditRepository;
  let mockApprovalRepo: IApprovalRepository;
  let mockObligationRepo: IObligationRepository;
  let mockRoomBookingRepo: IRoomBookingRepository;

  let createdBookings: any[] = [];
  let createdApprovals: any[] = [];
  let createdObligations: any[] = [];
  let createdCorrespondence: any[] = [];

  beforeEach(() => {
    createdBookings = [];
    createdApprovals = [];
    createdObligations = [];
    createdCorrespondence = [];

    orchestrator = new OfficeAIOrchestrator();

    mockCorrespondenceRepo = {
      create: async (entity) => {
        createdCorrespondence.push(entity);
        return entity;
      },
      findById: async () => null,
      findByRefNo: async () => null,
      updateStatus: async () => {},
      list: async () => createdCorrespondence,
    };

    let seqCounter = 100;
    mockSequenceRepo = {
      getNextSequence: async () => ++seqCounter,
    };

    mockAuditRepo = {
      append: async (event: any) => ({ ...event, id: 1, prevHash: "0000" }),
      getLastHash: async () => "0000",
      listRecent: async () => [],
    };

    mockApprovalRepo = {
      create: async (entity) => {
        createdApprovals.push(entity);
        return entity;
      },
      findById: async () => null,
      findPendingByTarget: async () => null,
      updateDecision: async () => {},
      listPending: async () => createdApprovals,
    };

    mockObligationRepo = {
      create: async (entity) => {
        createdObligations.push(entity);
        return entity;
      },
      findById: async () => null,
      findExpiring: async () => createdObligations,
      updateStatus: async () => {},
      list: async () => createdObligations,
    };

    mockRoomBookingRepo = {
      list: async () => createdBookings,
      create: async (entity) => {
        createdBookings.push(entity);
        return entity;
      },
    };

    useCase = new OrchestrateInboundEmailUseCase(
      orchestrator,
      mockCorrespondenceRepo,
      mockSequenceRepo,
      mockAuditRepo,
      mockApprovalRepo,
      mockObligationRepo,
      mockRoomBookingRepo
    );
  });

  it("should classify meeting request email and book conference room for calendar sync", async () => {
    const email = {
      sender: "cfo@partner.com",
      subject: "Q4 Strategy Meeting Request",
      body: "Hi team, let's schedule our sync this Thursday at 14:00 (14:00 - 15:00) in Boardroom Alpha.",
    };

    const result = await useCase.execute(email);

    expect(result.orchestration.intent).toBe("MEETING_REQUEST");
    expect(result.actionExecuted).toBe("ROOM_BOOKED");
    expect(result.orchestration.entities.requestedRoom).toBe("Board");
    expect(result.orchestration.entities.requestedTimeSlot).toBe("14:00 - 15:00");
    expect(createdBookings.length).toBe(1);
    expect(createdBookings[0].roomName).toBe("Board");
    expect(createdBookings[0].timeSlot).toBe("14:00 - 15:00");
  });

  it("should classify high-value invoice and route to Approvals queue (L2 gate)", async () => {
    const email = {
      sender: "billing@apexcloud.io",
      subject: "Invoice INV-2026-9041 for September Dedicated Hosting",
      body: "Total Amount Due: USD 1,450.00. Payment due by 2026-10-25.",
    };

    const result = await useCase.execute(email);

    expect(result.orchestration.intent).toBe("INVOICE");
    expect(result.actionExecuted).toBe("APPROVAL_QUEUED");
    expect(result.orchestration.autonomyLevel).toBe("L2");
    expect(result.orchestration.entities.totalAmount).toBe(1450.0);
    expect(createdApprovals.length).toBe(1);
    expect(createdApprovals[0].targetEntityType).toBe("INVOICE");
    expect(createdCorrespondence.length).toBe(1);
  });

  it("should classify municipal license renewal and file with proactive reminder", async () => {
    const email = {
      sender: "licensing@ammancity.gov.jo",
      subject: "Official Notice: Commercial License Renewal 2026",
      body: "Your annual commercial registration and operating permit expires in 35 days.",
    };

    const result = await useCase.execute(email);

    expect(result.orchestration.intent).toBe("LICENSE_RENEWAL");
    expect(result.actionExecuted).toBe("RENEWAL_AND_CORRESPONDENCE_SAVED");
    expect(createdObligations.length).toBe(1);
    expect(createdObligations[0].leadDays).toBe(30);
    expect(createdCorrespondence.length).toBe(1);
  });
});
