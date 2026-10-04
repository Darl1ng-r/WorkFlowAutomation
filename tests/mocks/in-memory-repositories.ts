import {
  ICorrespondenceRepository,
  IDocumentRepository,
  IInvoiceRepository,
  IObligationRepository,
  IVisitorRepository,
  ICallLogRepository,
  IApprovalRepository,
  IAuditRepository,
  ISequenceRepository,
} from "@domain/repositories";
import {
  CorrespondenceEntity,
  DocumentEntity,
  InvoiceEntity,
  ObligationEntity,
  VisitorEntity,
  CallLogEntity,
  ApprovalEntity,
  AuditEventEntity,
  CorrespondenceDirection,
  RoomBookingEntity,
  SupplyItemEntity,
} from "@domain/types";
import {
  ISupplyRepository,
  IRoomBookingRepository,
} from "@domain/repositories";
import { INotificationPort } from "@application/ports";

export class InMemorySequenceRepository implements ISequenceRepository {
  private counters = new Map<string, number>();

  async getNextSequence(direction: CorrespondenceDirection, year: number): Promise<number> {
    const key = `${direction}-${year}`;
    const current = this.counters.get(key) ?? 0;
    const next = current + 1;
    this.counters.set(key, next);
    return next;
  }
}

export class InMemoryCorrespondenceRepository implements ICorrespondenceRepository {
  public items: CorrespondenceEntity[] = [];

  async create(entity: CorrespondenceEntity): Promise<CorrespondenceEntity> {
    this.items.push(entity);
    return entity;
  }

  async findById(id: string): Promise<CorrespondenceEntity | null> {
    return this.items.find((i) => i.id === id) ?? null;
  }

  async findByRefNo(refNo: string): Promise<CorrespondenceEntity | null> {
    return this.items.find((i) => i.refNo === refNo) ?? null;
  }

  async updateStatus(id: string, status: CorrespondenceEntity["status"]): Promise<void> {
    const item = await this.findById(id);
    if (item) {
      item.status = status;
      item.updatedAt = new Date().toISOString();
    }
  }

  async list(options?: {
    direction?: CorrespondenceDirection;
    status?: CorrespondenceEntity["status"];
    limit?: number;
    offset?: number;
  }): Promise<CorrespondenceEntity[]> {
    let result = [...this.items];
    if (options?.direction) result = result.filter((i) => i.direction === options.direction);
    if (options?.status) result = result.filter((i) => i.status === options.status);
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;
    return result.slice(offset, offset + limit);
  }
}

export class InMemoryDocumentRepository implements IDocumentRepository {
  public items: DocumentEntity[] = [];

  async create(entity: DocumentEntity): Promise<DocumentEntity> {
    this.items.push(entity);
    return entity;
  }

  async findById(id: string): Promise<DocumentEntity | null> {
    return this.items.find((i) => i.id === id) ?? null;
  }

  async findBySha256(sha256: string): Promise<DocumentEntity | null> {
    return this.items.find((i) => i.sha256 === sha256) ?? null;
  }

  async findByCorrespondenceId(correspondenceId: string): Promise<DocumentEntity[]> {
    return this.items.filter((i) => i.correspondenceId === correspondenceId);
  }
}

export class InMemoryInvoiceRepository implements IInvoiceRepository {
  public items: InvoiceEntity[] = [];

  async create(entity: InvoiceEntity): Promise<InvoiceEntity> {
    this.items.push(entity);
    return entity;
  }

  async findById(id: string): Promise<InvoiceEntity | null> {
    return this.items.find((i) => i.id === id) ?? null;
  }

  async findByVendorAndNumber(vendorName: string, invoiceNo: string): Promise<InvoiceEntity | null> {
    return (
      this.items.find(
        (i) =>
          i.vendorName.toLowerCase() === vendorName.toLowerCase() &&
          i.invoiceNo.toLowerCase() === invoiceNo.toLowerCase()
      ) ?? null
    );
  }

  async findByVendor(vendorName: string): Promise<InvoiceEntity[]> {
    return this.items.filter(
      (i) => i.vendorName.toLowerCase() === vendorName.toLowerCase()
    );
  }

  async updateStatus(id: string, status: InvoiceEntity["status"], accountingRef?: string): Promise<void> {
    const item = await this.findById(id);
    if (item) {
      item.status = status;
      if (accountingRef) item.accountingRef = accountingRef;
    }
  }

  async list(status?: InvoiceEntity["status"]): Promise<InvoiceEntity[]> {
    if (status) return this.items.filter((i) => i.status === status);
    return [...this.items];
  }
}

export class InMemoryApprovalRepository implements IApprovalRepository {
  public items: ApprovalEntity[] = [];

  async create(entity: ApprovalEntity): Promise<ApprovalEntity> {
    this.items.push(entity);
    return entity;
  }

  async findById(id: string): Promise<ApprovalEntity | null> {
    return this.items.find((i) => i.id === id) ?? null;
  }

  async findPendingByTarget(
    targetEntityType: ApprovalEntity["targetEntityType"],
    targetEntityId: string
  ): Promise<ApprovalEntity | null> {
    return (
      this.items.find(
        (i) =>
          i.targetEntityType === targetEntityType &&
          i.targetEntityId === targetEntityId &&
          (i.decision === "PENDING" || i.decidedAt === undefined)
      ) ?? null
    );
  }

  async updateDecision(
    id: string,
    decision: ApprovalEntity["decision"],
    decidedByEmail: string,
    humanDiff?: Record<string, unknown>,
    notes?: string
  ): Promise<void> {
    const item = await this.findById(id);
    if (item) {
      item.decision = decision;
      item.decidedByEmail = decidedByEmail;
      if (humanDiff) item.humanDiff = humanDiff;
      if (notes) item.notes = notes;
      item.decidedAt = new Date().toISOString();
    }
  }

  async listPending(): Promise<ApprovalEntity[]> {
    return this.items.filter((i) => i.decision === "PENDING" || i.decidedAt === undefined);
  }
}

export class InMemoryObligationRepository implements IObligationRepository {
  public items: ObligationEntity[] = [];

  async create(entity: ObligationEntity): Promise<ObligationEntity> {
    this.items.push(entity);
    return entity;
  }

  async findById(id: string): Promise<ObligationEntity | null> {
    return this.items.find((i) => i.id === id) ?? null;
  }

  async findExpiring(daysThreshold: number): Promise<ObligationEntity[]> {
    const now = new Date();
    const thresholdDate = new Date();
    thresholdDate.setDate(now.getDate() + daysThreshold);

    return this.items.filter((item) => {
      const expDate = new Date(item.expiresOn);
      return expDate >= now && expDate <= thresholdDate;
    });
  }

  async updateStatus(id: string, status: ObligationEntity["status"], lastReminderSentAt?: string): Promise<void> {
    const item = await this.findById(id);
    if (item) {
      item.status = status;
      if (lastReminderSentAt) item.lastReminderSentAt = lastReminderSentAt;
      item.updatedAt = new Date().toISOString();
    }
  }

  async list(): Promise<ObligationEntity[]> {
    return [...this.items];
  }
}

export class InMemoryVisitorRepository implements IVisitorRepository {
  public items: VisitorEntity[] = [];

  async createCheckIn(entity: VisitorEntity): Promise<VisitorEntity> {
    this.items.push(entity);
    return entity;
  }

  async findById(id: string): Promise<VisitorEntity | null> {
    return this.items.find((i) => i.id === id) ?? null;
  }

  async checkOut(id: string, checkedOutAt: string): Promise<void> {
    const item = await this.findById(id);
    if (item) {
      item.checkedOutAt = checkedOutAt;
    }
  }

  async listActive(): Promise<VisitorEntity[]> {
    return this.items.filter((i) => i.checkedOutAt === undefined);
  }

  async listRecent(limit = 20): Promise<VisitorEntity[]> {
    return this.items.slice(-limit).reverse();
  }
}

export class InMemoryCallLogRepository implements ICallLogRepository {
  public items: CallLogEntity[] = [];

  async create(entity: CallLogEntity): Promise<CallLogEntity> {
    this.items.push(entity);
    return entity;
  }

  async listRecent(limit = 20): Promise<CallLogEntity[]> {
    return this.items.slice(-limit).reverse();
  }
}

export class InMemoryAuditRepository implements IAuditRepository {
  public items: AuditEventEntity[] = [];
  private lastHash = "0000000000000000000000000000000000000000000000000000000000000000";

  async append(event: Omit<AuditEventEntity, "id" | "prevHash">): Promise<AuditEventEntity> {
    const prevHash = this.lastHash;
    const nextId = this.items.length + 1;

    // Cryptographic chain linkage: SHA-256(prevHash || ":" || payloadHash || ":" || actorEmail || ":" || action || ":" || occurredAt)
    const canonical = `${prevHash}:${event.payloadHash}:${event.actorEmail}:${event.action}:${event.occurredAt}`;
    const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
    const chainHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const fullEvent: AuditEventEntity = {
      ...event,
      id: nextId,
      payloadHash: chainHash,
      prevHash,
    };
    this.items.push(fullEvent);
    this.lastHash = chainHash;
    return fullEvent;
  }

  async getLastHash(): Promise<string> {
    return this.lastHash;
  }

  async listRecent(limit = 50): Promise<AuditEventEntity[]> {
    return this.items.slice(-limit).reverse();
  }
}

export class MockNotificationPort implements INotificationPort {
  public sentCards: Array<{
    recipientEmail?: string;
    title: string;
    message: string;
    priority?: string;
  }> = [];

  async sendCard(options: {
    recipientEmail?: string;
    title: string;
    message: string;
    actionUrl?: string;
    actionLabel?: string;
    priority?: "NORMAL" | "HIGH" | "URGENT";
  }): Promise<void> {
    this.sentCards.push(options);
  }
}

export class InMemorySupplyRepository implements ISupplyRepository {
  public items: SupplyItemEntity[] = [
    {
      id: "sup-001",
      name: "A4 High-White Copy Paper (80gsm)",
      category: "PRINTING",
      currentStock: 6,
      parLevel: 4,
      unit: "Cartons (5 reams)",
      supplier: "Office Depot Saudi",
      unitPrice: 120,
      currency: "SAR",
      status: "OK",
      updatedAt: new Date().toISOString(),
    },
    {
      id: "sup-002",
      name: "Arabica Blend Espresso Whole Beans",
      category: "PANTRY",
      currentStock: 2,
      parLevel: 3,
      unit: "1kg Bags",
      supplier: "Specialty Bean Roasters",
      unitPrice: 95,
      currency: "SAR",
      status: "LOW_STOCK",
      updatedAt: new Date().toISOString(),
    },
    {
      id: "sup-003",
      name: "HP LaserJet Enterprise Black Toner (W9004MC)",
      category: "PRINTING",
      currentStock: 1,
      parLevel: 2,
      unit: "Cartridges",
      supplier: "Saudi Xerox & HP Solutions",
      unitPrice: 420,
      currency: "SAR",
      status: "LOW_STOCK",
      updatedAt: new Date().toISOString(),
    },
    {
      id: "sup-004",
      name: "Anker USB-C Multiport 7-in-1 Hub",
      category: "IT_ACCESSORY",
      currentStock: 4,
      parLevel: 2,
      unit: "Units",
      supplier: "Jarir Bookstore Corporate",
      unitPrice: 185,
      currency: "SAR",
      status: "OK",
      updatedAt: new Date().toISOString(),
    },
  ];

  async list(): Promise<SupplyItemEntity[]> {
    return [...this.items];
  }

  async findById(id: string): Promise<SupplyItemEntity | null> {
    return this.items.find((i) => i.id === id) ?? null;
  }

  async consume(id: string, quantity: number): Promise<SupplyItemEntity | null> {
    const item = await this.findById(id);
    if (!item) return null;
    item.currentStock = Math.max(0, item.currentStock - quantity);
    item.status = item.currentStock <= item.parLevel ? "LOW_STOCK" : "OK";
    item.updatedAt = new Date().toISOString();
    return item;
  }

  async updateStatus(id: string, status: SupplyItemEntity["status"]): Promise<void> {
    const item = await this.findById(id);
    if (item) {
      item.status = status;
      item.updatedAt = new Date().toISOString();
    }
  }

  async reorder(id: string): Promise<SupplyItemEntity | null> {
    const item = await this.findById(id);
    if (!item) return null;
    item.status = "REORDER_TRIGGERED";
    item.updatedAt = new Date().toISOString();
    return item;
  }
}

export class InMemoryRoomBookingRepository implements IRoomBookingRepository {
  public items: RoomBookingEntity[] = [
    {
      id: "rb-default-1",
      roomName: "Board",
      timeSlot: "10:00 - 11:30",
      title: "Lease review",
      hostName: "Legal Team",
      source: "INITIAL_SEED",
      createdAt: new Date().toISOString(),
    },
  ];

  async list(): Promise<RoomBookingEntity[]> {
    return [...this.items];
  }

  async create(entity: RoomBookingEntity): Promise<RoomBookingEntity> {
    this.items.push(entity);
    return entity;
  }
}
