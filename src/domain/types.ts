/**
 * Core Domain Enums & Value Types for Office OS
 */

export type AutonomyLevel = "L0" | "L1" | "L2" | "L3";

export type DataClassification = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";

export type CorrespondenceDirection = "IN" | "OUT";

export type CorrespondenceChannel = "EMAIL" | "SCAN" | "PHONE" | "VISIT" | "UPLOAD";

export type CorrespondenceStatus =
  | "RECEIVED"
  | "EXTRACTED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "FILED"
  | "REJECTED";

export type DocumentType =
  | "INVOICE"
  | "RECEIPT"
  | "OFFICIAL_LETTER"
  | "CONTRACT"
  | "CERTIFICATE"
  | "OTHER";

export type ObligationType =
  | "INSURANCE"
  | "VEHICLE_REGISTRATION"
  | "BUILDING_REGISTRATION"
  | "TRADE_LICENCE"
  | "EQUIPMENT_PERMIT";

export type ObligationStatus = "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "RENEWED";

export type ApprovalDecision = "PENDING" | "APPROVED" | "MODIFIED" | "REJECTED";

export interface RoomBookingEntity {
  id: string;
  roomName: "Board" | "Sync" | "Huddle" | "Interview";
  timeSlot: string;
  title: string;
  hostName: string;
  source?: string | undefined;
  createdAt?: string | undefined;
}

/**
 * Domain Entities
 */

export interface CorrespondenceEntity {
  id: string;
  refNo: string; // e.g., IN-2026-000001 or OUT-2026-000001
  direction: CorrespondenceDirection;
  channel: CorrespondenceChannel;
  subject: string;
  sourceSender?: string | undefined;
  recipient?: string | undefined;
  organizationId?: string | undefined;
  ownerUserId?: string | undefined;
  status: CorrespondenceStatus;
  classification: DataClassification;
  physicalLocation?: string | undefined; // e.g., "Cabinet B, Shelf 2, Box 14"
  dueDate?: string | undefined; // ISO Date YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
}

export interface DocumentEntity {
  id: string;
  correspondenceId: string;
  sha256: string;
  vaultUri: string; // e.g., r2://vault/2026/10/sha256.pdf
  driveFileId?: string | undefined;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  classification: DataClassification;
  createdAt: string;
}

export interface ExtractionEntity {
  id: string;
  documentId: string;
  docType: DocumentType;
  model: string;
  confidence: number; // 0.00 to 1.00
  fields: Record<string, unknown>;
  anomaliesDetected: string[];
  createdAt: string;
}

export interface InvoiceEntity {
  id: string;
  documentId: string;
  correspondenceId: string;
  vendorName: string;
  taxId?: string | undefined;
  invoiceNo: string;
  issueDate: string;
  dueDate: string;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  category?: "UTILITY_ELECTRICITY" | "UTILITY_WATER" | "OFFICE_RENT" | "TELECOM" | "SUBSCRIPTION" | "GENERAL_SUPPLIES" | "PROFESSIONAL_SERVICES" | "OTHER" | undefined;
  isAnomalySpike?: boolean | undefined;
  anomalyReason?: string | undefined;
  accountingRef?: string | undefined;
  status: "DRAFT_PENDING" | "APPROVED" | "REJECTED" | "SYNCED";
  createdAt: string;
}

export interface ObligationEntity {
  id: string;
  title: string;
  assetIdentifier: string; // e.g. "Toyota Hilux Plate 1234", "Headquarters Lease"
  kind: ObligationType;
  referenceNo: string; // Policy or Licence Number
  issuer: string; // Insurer, Municipality, Ministry
  expiresOn: string; // YYYY-MM-DD
  leadDays: number; // Notification threshold, e.g., 60, 30, 14, 7
  ownerEmail: string;
  status: ObligationStatus;
  lastReminderSentAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface VisitorEntity {
  id: string;
  fullName: string;
  company?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  hostEmployeeEmail: string;
  purpose: string;
  badgeNumber: string;
  ndaSigned: boolean;
  checkedInAt: string;
  checkedOutAt?: string | undefined;
  createdAt: string;
}

export interface CallLogEntity {
  id: string;
  callerNumber: string;
  callerName?: string | undefined;
  direction: "INBOUND" | "OUTBOUND";
  routedToUserEmail: string;
  summary: string;
  durationSeconds: number;
  pbxCallId?: string | undefined;
  createdAt: string;
}

export interface SupplyItemEntity {
  id: string;
  name: string;
  category: "STATIONERY" | "PANTRY" | "PRINTING" | "CLEANING" | "IT_ACCESSORY";
  currentStock: number;
  parLevel: number;
  unit: string;
  supplier: string;
  unitPrice: number;
  currency: string;
  status: "OK" | "LOW_STOCK" | "REORDER_TRIGGERED";
  updatedAt: string;
}

export interface ApprovalEntity {
  id: string;
  workflowRunId: string;
  targetEntityType: "INVOICE" | "CORRESPONDENCE" | "OBLIGATION" | "OUTBOUND_LETTER" | "SUPPLY_REORDER";
  targetEntityId: string;
  proposedAction: string;
  proposedPayload: Record<string, unknown>;
  humanDiff?: Record<string, unknown> | undefined;
  decision: ApprovalDecision;
  decidedByEmail?: string | undefined;
  notes?: string | undefined;
  decidedAt?: string | undefined;
  createdAt: string;
}

export interface AuditEventEntity {
  id: number;
  actorEmail: string;
  actorType: "USER" | "AGENT" | "SYSTEM";
  action: string;
  entityType: string;
  entityId: string;
  payloadHash: string;
  prevHash: string;
  occurredAt: string;
}
