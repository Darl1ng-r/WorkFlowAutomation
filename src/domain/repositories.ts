import {
  CorrespondenceEntity,
  DocumentEntity,
  ExtractionEntity,
  InvoiceEntity,
  ObligationEntity,
  VisitorEntity,
  CallLogEntity,
  ApprovalEntity,
  AuditEventEntity,
  CorrespondenceDirection,
  RoomBookingEntity,
  SupplyItemEntity,
} from "./types";

export interface ISequenceRepository {
  getNextSequence(direction: CorrespondenceDirection, year: number): Promise<number>;
}

export interface ICorrespondenceRepository {
  create(entity: CorrespondenceEntity): Promise<CorrespondenceEntity>;
  findById(id: string): Promise<CorrespondenceEntity | null>;
  findByRefNo(refNo: string): Promise<CorrespondenceEntity | null>;
  updateStatus(id: string, status: CorrespondenceEntity["status"]): Promise<void>;
  list(options?: {
    direction?: CorrespondenceDirection | undefined;
    status?: CorrespondenceEntity["status"] | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  }): Promise<CorrespondenceEntity[]>;
}

export interface IDocumentRepository {
  create(entity: DocumentEntity): Promise<DocumentEntity>;
  findById(id: string): Promise<DocumentEntity | null>;
  findBySha256(sha256: string): Promise<DocumentEntity | null>;
  findByCorrespondenceId(correspondenceId: string): Promise<DocumentEntity[]>;
}

export interface IExtractionRepository {
  create(entity: ExtractionEntity): Promise<ExtractionEntity>;
  findByDocumentId(documentId: string): Promise<ExtractionEntity | null>;
}

export interface IInvoiceRepository {
  create(entity: InvoiceEntity): Promise<InvoiceEntity>;
  findById(id: string): Promise<InvoiceEntity | null>;
  findByVendorAndNumber(vendorName: string, invoiceNo: string): Promise<InvoiceEntity | null>;
  findByVendor(vendorName: string): Promise<InvoiceEntity[]>;
  updateStatus(id: string, status: InvoiceEntity["status"], accountingRef?: string): Promise<void>;
  list(status?: InvoiceEntity["status"]): Promise<InvoiceEntity[]>;
}

export interface IObligationRepository {
  create(entity: ObligationEntity): Promise<ObligationEntity>;
  findById(id: string): Promise<ObligationEntity | null>;
  findExpiring(daysThreshold: number): Promise<ObligationEntity[]>;
  updateStatus(id: string, status: ObligationEntity["status"], lastReminderSentAt?: string): Promise<void>;
  list(): Promise<ObligationEntity[]>;
}

export interface IVisitorRepository {
  createCheckIn(entity: VisitorEntity): Promise<VisitorEntity>;
  findById(id: string): Promise<VisitorEntity | null>;
  checkOut(id: string, checkedOutAt: string): Promise<void>;
  listActive(): Promise<VisitorEntity[]>;
  listRecent(limit?: number): Promise<VisitorEntity[]>;
}

export interface ICallLogRepository {
  create(entity: CallLogEntity): Promise<CallLogEntity>;
  listRecent(limit?: number): Promise<CallLogEntity[]>;
}

export interface IApprovalRepository {
  create(entity: ApprovalEntity): Promise<ApprovalEntity>;
  findById(id: string): Promise<ApprovalEntity | null>;
  findPendingByTarget(
    targetEntityType: ApprovalEntity["targetEntityType"],
    targetEntityId: string
  ): Promise<ApprovalEntity | null>;
  updateDecision(
    id: string,
    decision: ApprovalEntity["decision"],
    decidedByEmail: string,
    humanDiff?: Record<string, unknown>,
    notes?: string
  ): Promise<void>;
  listPending(): Promise<ApprovalEntity[]>;
}

export interface IAuditRepository {
  append(event: Omit<AuditEventEntity, "id" | "prevHash">): Promise<AuditEventEntity>;
  getLastHash(): Promise<string>;
  listRecent(limit?: number): Promise<AuditEventEntity[]>;
}

export interface ISupplyRepository {
  list(): Promise<SupplyItemEntity[]>;
  findById(id: string): Promise<SupplyItemEntity | null>;
  consume(id: string, quantity: number): Promise<SupplyItemEntity | null>;
  updateStatus(id: string, status: SupplyItemEntity["status"]): Promise<void>;
  reorder(id: string): Promise<SupplyItemEntity | null>;
}

export interface IRoomBookingRepository {
  list(): Promise<RoomBookingEntity[]>;
  create(entity: RoomBookingEntity): Promise<RoomBookingEntity>;
}
