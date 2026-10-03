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
} from "@domain/types";

export class D1SequenceRepository implements ISequenceRepository {
  constructor(private readonly db: D1Database) {}

  async getNextSequence(direction: CorrespondenceDirection, year: number): Promise<number> {
    // Atomic upsert with SQLite
    await this.db
      .prepare(
        `INSERT INTO sequence_counters (direction, year, current_val)
         VALUES (?, ?, 1)
         ON CONFLICT(direction, year) DO UPDATE SET current_val = current_val + 1;`
      )
      .bind(direction, year)
      .run();

    const row = await this.db
      .prepare(`SELECT current_val FROM sequence_counters WHERE direction = ? AND year = ?;`)
      .bind(direction, year)
      .first<{ current_val: number }>();

    if (!row) {
      throw new Error(`Failed to retrieve sequence counter for ${direction}-${year}`);
    }

    return row.current_val;
  }
}

export class D1CorrespondenceRepository implements ICorrespondenceRepository {
  constructor(private readonly db: D1Database) {}

  async create(entity: CorrespondenceEntity): Promise<CorrespondenceEntity> {
    await this.db
      .prepare(
        `INSERT INTO correspondence (
          id, ref_no, direction, channel, subject, source_sender, recipient,
          organization_id, owner_user_id, status, classification, physical_location,
          due_date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
      )
      .bind(
        entity.id,
        entity.refNo,
        entity.direction,
        entity.channel,
        entity.subject,
        entity.sourceSender ?? null,
        entity.recipient ?? null,
        entity.organizationId ?? null,
        entity.ownerUserId ?? null,
        entity.status,
        entity.classification,
        entity.physicalLocation ?? null,
        entity.dueDate ?? null,
        entity.createdAt,
        entity.updatedAt
      )
      .run();

    return entity;
  }

  async findById(id: string): Promise<CorrespondenceEntity | null> {
    const row = await this.db
      .prepare(`SELECT * FROM correspondence WHERE id = ?;`)
      .bind(id)
      .first<any>();

    return row ? this.mapRow(row) : null;
  }

  async findByRefNo(refNo: string): Promise<CorrespondenceEntity | null> {
    const row = await this.db
      .prepare(`SELECT * FROM correspondence WHERE ref_no = ?;`)
      .bind(refNo)
      .first<any>();

    return row ? this.mapRow(row) : null;
  }

  async updateStatus(id: string, status: CorrespondenceEntity["status"]): Promise<void> {
    const nowIso = new Date().toISOString();
    await this.db
      .prepare(`UPDATE correspondence SET status = ?, updated_at = ? WHERE id = ?;`)
      .bind(status, nowIso, id)
      .run();
  }

  async list(options?: {
    direction?: CorrespondenceDirection;
    status?: CorrespondenceEntity["status"];
    limit?: number;
    offset?: number;
  }): Promise<CorrespondenceEntity[]> {
    let query = `SELECT * FROM correspondence WHERE 1=1`;
    const params: any[] = [];

    if (options?.direction) {
      query += ` AND direction = ?`;
      params.push(options.direction);
    }
    if (options?.status) {
      query += ` AND status = ?`;
      params.push(options.status);
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?;`;
    params.push(options?.limit ?? 50, options?.offset ?? 0);

    const { results } = await this.db.prepare(query).bind(...params).all<any>();
    return (results ?? []).map((r) => this.mapRow(r));
  }

  private mapRow(row: any): CorrespondenceEntity {
    return {
      id: row.id,
      refNo: row.ref_no,
      direction: row.direction,
      channel: row.channel,
      subject: row.subject,
      sourceSender: row.source_sender ?? undefined,
      recipient: row.recipient ?? undefined,
      organizationId: row.organization_id ?? undefined,
      ownerUserId: row.owner_user_id ?? undefined,
      status: row.status,
      classification: row.classification,
      physicalLocation: row.physical_location ?? undefined,
      dueDate: row.due_date ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export class D1DocumentRepository implements IDocumentRepository {
  constructor(private readonly db: D1Database) {}

  async create(entity: DocumentEntity): Promise<DocumentEntity> {
    await this.db
      .prepare(
        `INSERT INTO documents (
          id, correspondence_id, sha256, vault_uri, drive_file_id,
          file_name, file_size_bytes, mime_type, classification, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
      )
      .bind(
        entity.id,
        entity.correspondenceId,
        entity.sha256,
        entity.vaultUri,
        entity.driveFileId ?? null,
        entity.fileName,
        entity.fileSizeBytes,
        entity.mimeType,
        entity.classification,
        entity.createdAt
      )
      .run();

    return entity;
  }

  async findById(id: string): Promise<DocumentEntity | null> {
    const row = await this.db.prepare(`SELECT * FROM documents WHERE id = ?;`).bind(id).first<any>();
    return row ? this.mapRow(row) : null;
  }

  async findBySha256(sha256: string): Promise<DocumentEntity | null> {
    const row = await this.db
      .prepare(`SELECT * FROM documents WHERE sha256 = ?;`)
      .bind(sha256)
      .first<any>();
    return row ? this.mapRow(row) : null;
  }

  async findByCorrespondenceId(correspondenceId: string): Promise<DocumentEntity[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM documents WHERE correspondence_id = ?;`)
      .bind(correspondenceId)
      .all<any>();
    return (results ?? []).map((r) => this.mapRow(r));
  }

  private mapRow(row: any): DocumentEntity {
    return {
      id: row.id,
      correspondenceId: row.correspondence_id,
      sha256: row.sha256,
      vaultUri: row.vault_uri,
      driveFileId: row.drive_file_id ?? undefined,
      fileName: row.file_name,
      fileSizeBytes: row.file_size_bytes,
      mimeType: row.mime_type,
      classification: row.classification,
      createdAt: row.created_at,
    };
  }
}

export class D1InvoiceRepository implements IInvoiceRepository {
  constructor(private readonly db: D1Database) {}

  async create(entity: InvoiceEntity): Promise<InvoiceEntity> {
    await this.db
      .prepare(
        `INSERT INTO invoices (
          id, document_id, correspondence_id, vendor_name, tax_id, invoice_no,
          issue_date, due_date, net_amount, tax_amount, total_amount, currency,
          accounting_ref, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
      )
      .bind(
        entity.id,
        entity.documentId,
        entity.correspondenceId,
        entity.vendorName,
        entity.taxId ?? null,
        entity.invoiceNo,
        entity.issueDate,
        entity.dueDate,
        entity.netAmount,
        entity.taxAmount,
        entity.totalAmount,
        entity.currency,
        entity.accountingRef ?? null,
        entity.status,
        entity.createdAt
      )
      .run();

    return entity;
  }

  async findById(id: string): Promise<InvoiceEntity | null> {
    const row = await this.db.prepare(`SELECT * FROM invoices WHERE id = ?;`).bind(id).first<any>();
    return row ? this.mapRow(row) : null;
  }

  async findByVendorAndNumber(vendorName: string, invoiceNo: string): Promise<InvoiceEntity | null> {
    const row = await this.db
      .prepare(`SELECT * FROM invoices WHERE LOWER(vendor_name) = LOWER(?) AND LOWER(invoice_no) = LOWER(?);`)
      .bind(vendorName, invoiceNo)
      .first<any>();
    return row ? this.mapRow(row) : null;
  }

  async updateStatus(id: string, status: InvoiceEntity["status"], accountingRef?: string): Promise<void> {
    if (accountingRef) {
      await this.db
        .prepare(`UPDATE invoices SET status = ?, accounting_ref = ? WHERE id = ?;`)
        .bind(status, accountingRef, id)
        .run();
    } else {
      await this.db.prepare(`UPDATE invoices SET status = ? WHERE id = ?;`).bind(status, id).run();
    }
  }

  async list(status?: InvoiceEntity["status"]): Promise<InvoiceEntity[]> {
    let query = `SELECT * FROM invoices`;
    const params: any[] = [];
    if (status) {
      query += ` WHERE status = ?`;
      params.push(status);
    }
    query += ` ORDER BY created_at DESC;`;

    const { results } = await this.db.prepare(query).bind(...params).all<any>();
    return (results ?? []).map((r) => this.mapRow(r));
  }

  private mapRow(row: any): InvoiceEntity {
    return {
      id: row.id,
      documentId: row.document_id,
      correspondenceId: row.correspondence_id,
      vendorName: row.vendor_name,
      taxId: row.tax_id ?? undefined,
      invoiceNo: row.invoice_no,
      issueDate: row.issue_date,
      dueDate: row.due_date,
      netAmount: row.net_amount,
      taxAmount: row.tax_amount,
      totalAmount: row.total_amount,
      currency: row.currency,
      accountingRef: row.accounting_ref ?? undefined,
      status: row.status,
      createdAt: row.created_at,
    };
  }
}

export class D1ApprovalRepository implements IApprovalRepository {
  constructor(private readonly db: D1Database) {}

  async create(entity: ApprovalEntity): Promise<ApprovalEntity> {
    await this.db
      .prepare(
        `INSERT INTO approvals (
          id, workflow_run_id, target_entity_type, target_entity_id, proposed_action,
          proposed_payload_json, human_diff_json, decision, decided_by_email,
          notes, decided_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
      )
      .bind(
        entity.id,
        entity.workflowRunId,
        entity.targetEntityType,
        entity.targetEntityId,
        entity.proposedAction,
        JSON.stringify(entity.proposedPayload),
        entity.humanDiff ? JSON.stringify(entity.humanDiff) : null,
        entity.decision,
        entity.decidedByEmail ?? null,
        entity.notes ?? null,
        entity.decidedAt ?? null,
        entity.createdAt
      )
      .run();

    return entity;
  }

  async findById(id: string): Promise<ApprovalEntity | null> {
    const row = await this.db.prepare(`SELECT * FROM approvals WHERE id = ?;`).bind(id).first<any>();
    return row ? this.mapRow(row) : null;
  }

  async updateDecision(
    id: string,
    decision: ApprovalEntity["decision"],
    decidedByEmail: string,
    humanDiff?: Record<string, unknown>,
    notes?: string
  ): Promise<void> {
    const nowIso = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE approvals
         SET decision = ?, decided_by_email = ?, human_diff_json = ?, notes = ?, decided_at = ?
         WHERE id = ?;`
      )
      .bind(
        decision,
        decidedByEmail,
        humanDiff ? JSON.stringify(humanDiff) : null,
        notes ?? null,
        nowIso,
        id
      )
      .run();
  }

  async listPending(): Promise<ApprovalEntity[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM approvals WHERE decided_at IS NULL ORDER BY created_at DESC;`)
      .all<any>();
    return (results ?? []).map((r) => this.mapRow(r));
  }

  private mapRow(row: any): ApprovalEntity {
    return {
      id: row.id,
      workflowRunId: row.workflow_run_id,
      targetEntityType: row.target_entity_type,
      targetEntityId: row.target_entity_id,
      proposedAction: row.proposed_action,
      proposedPayload: JSON.parse(row.proposed_payload_json),
      humanDiff: row.human_diff_json ? JSON.parse(row.human_diff_json) : undefined,
      decision: row.decision,
      decidedByEmail: row.decided_by_email ?? undefined,
      notes: row.notes ?? undefined,
      decidedAt: row.decided_at ?? undefined,
      createdAt: row.created_at,
    };
  }
}

export class D1ObligationRepository implements IObligationRepository {
  constructor(private readonly db: D1Database) {}

  async create(entity: ObligationEntity): Promise<ObligationEntity> {
    await this.db
      .prepare(
        `INSERT INTO obligations (
          id, title, asset_identifier, kind, reference_no, issuer,
          expires_on, lead_days, owner_email, status, last_reminder_sent_at,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
      )
      .bind(
        entity.id,
        entity.title,
        entity.assetIdentifier,
        entity.kind,
        entity.referenceNo,
        entity.issuer,
        entity.expiresOn,
        entity.leadDays,
        entity.ownerEmail,
        entity.status,
        entity.lastReminderSentAt ?? null,
        entity.createdAt,
        entity.updatedAt
      )
      .run();

    return entity;
  }

  async findById(id: string): Promise<ObligationEntity | null> {
    const row = await this.db.prepare(`SELECT * FROM obligations WHERE id = ?;`).bind(id).first<any>();
    return row ? this.mapRow(row) : null;
  }

  async findExpiring(daysThreshold: number): Promise<ObligationEntity[]> {
    // In SQLite, date('now', '+X days') computes the threshold date
    const { results } = await this.db
      .prepare(
        `SELECT * FROM obligations
         WHERE expires_on >= date('now')
           AND expires_on <= date('now', '+' || ? || ' days')
         ORDER BY expires_on ASC;`
      )
      .bind(daysThreshold)
      .all<any>();

    return (results ?? []).map((r) => this.mapRow(r));
  }

  async updateStatus(id: string, status: ObligationEntity["status"], lastReminderSentAt?: string): Promise<void> {
    const nowIso = new Date().toISOString();
    if (lastReminderSentAt) {
      await this.db
        .prepare(`UPDATE obligations SET status = ?, last_reminder_sent_at = ?, updated_at = ? WHERE id = ?;`)
        .bind(status, lastReminderSentAt, nowIso, id)
        .run();
    } else {
      await this.db
        .prepare(`UPDATE obligations SET status = ?, updated_at = ? WHERE id = ?;`)
        .bind(status, nowIso, id)
        .run();
    }
  }

  async list(): Promise<ObligationEntity[]> {
    const { results } = await this.db.prepare(`SELECT * FROM obligations ORDER BY expires_on ASC;`).all<any>();
    return (results ?? []).map((r) => this.mapRow(r));
  }

  private mapRow(row: any): ObligationEntity {
    return {
      id: row.id,
      title: row.title,
      assetIdentifier: row.asset_identifier,
      kind: row.kind,
      referenceNo: row.reference_no,
      issuer: row.issuer,
      expiresOn: row.expires_on,
      leadDays: row.lead_days,
      ownerEmail: row.owner_email,
      status: row.status,
      lastReminderSentAt: row.last_reminder_sent_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export class D1VisitorRepository implements IVisitorRepository {
  constructor(private readonly db: D1Database) {}

  async createCheckIn(entity: VisitorEntity): Promise<VisitorEntity> {
    await this.db
      .prepare(
        `INSERT INTO visitors (
          id, full_name, company, email, phone, host_employee_email,
          purpose, badge_number, nda_signed, checked_in_at, checked_out_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
      )
      .bind(
        entity.id,
        entity.fullName,
        entity.company ?? null,
        entity.email ?? null,
        entity.phone ?? null,
        entity.hostEmployeeEmail,
        entity.purpose,
        entity.badgeNumber,
        entity.ndaSigned ? 1 : 0,
        entity.checkedInAt,
        entity.checkedOutAt ?? null,
        entity.createdAt
      )
      .run();

    return entity;
  }

  async findById(id: string): Promise<VisitorEntity | null> {
    const row = await this.db.prepare(`SELECT * FROM visitors WHERE id = ?;`).bind(id).first<any>();
    return row ? this.mapRow(row) : null;
  }

  async checkOut(id: string, checkedOutAt: string): Promise<void> {
    await this.db
      .prepare(`UPDATE visitors SET checked_out_at = ? WHERE id = ?;`)
      .bind(checkedOutAt, id)
      .run();
  }

  async listActive(): Promise<VisitorEntity[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM visitors WHERE checked_out_at IS NULL ORDER BY checked_in_at DESC;`)
      .all<any>();
    return (results ?? []).map((r) => this.mapRow(r));
  }

  async listRecent(limit = 20): Promise<VisitorEntity[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM visitors ORDER BY checked_in_at DESC LIMIT ?;`)
      .bind(limit)
      .all<any>();
    return (results ?? []).map((r) => this.mapRow(r));
  }

  private mapRow(row: any): VisitorEntity {
    return {
      id: row.id,
      fullName: row.full_name,
      company: row.company ?? undefined,
      email: row.email ?? undefined,
      phone: row.phone ?? undefined,
      hostEmployeeEmail: row.host_employee_email,
      purpose: row.purpose,
      badgeNumber: row.badge_number,
      ndaSigned: Boolean(row.nda_signed),
      checkedInAt: row.checked_in_at,
      checkedOutAt: row.checked_out_at ?? undefined,
      createdAt: row.created_at,
    };
  }
}

export class D1AuditRepository implements IAuditRepository {
  constructor(private readonly db: D1Database) {}

  async append(event: Omit<AuditEventEntity, "id" | "prevHash">): Promise<AuditEventEntity> {
    const prevHash = await this.getLastHash();

    const result = await this.db
      .prepare(
        `INSERT INTO audit_events (
          actor_email, actor_type, action, entity_type, entity_id, payload_hash, prev_hash, occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id;`
      )
      .bind(
        event.actorEmail,
        event.actorType,
        event.action,
        event.entityType,
        event.entityId,
        event.payloadHash,
        prevHash,
        event.occurredAt
      )
      .first<{ id: number }>();

    return {
      ...event,
      id: result?.id ?? 0,
      prevHash,
    };
  }

  async getLastHash(): Promise<string> {
    const row = await this.db
      .prepare(`SELECT payload_hash FROM audit_events ORDER BY id DESC LIMIT 1;`)
      .first<{ payload_hash: string }>();

    return row?.payload_hash ?? "0000000000000000000000000000000000000000000000000000000000000000";
  }

  async listRecent(limit = 50): Promise<AuditEventEntity[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM audit_events ORDER BY id DESC LIMIT ?;`)
      .bind(limit)
      .all<any>();

    return (results ?? []).map((r) => ({
      id: r.id,
      actorEmail: r.actor_email,
      actorType: r.actor_type,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      payloadHash: r.payload_hash,
      prevHash: r.prev_hash,
      occurredAt: r.occurred_at,
    }));
  }
}

export class D1CallLogRepository implements ICallLogRepository {
  constructor(private readonly db: D1Database) {}

  async create(entity: CallLogEntity): Promise<CallLogEntity> {
    await this.db
      .prepare(
        `INSERT INTO call_logs (
          id, caller_number, caller_name, direction, routed_to_user_email,
          summary, duration_seconds, pbx_call_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`
      )
      .bind(
        entity.id,
        entity.callerNumber,
        entity.callerName ?? null,
        entity.direction,
        entity.routedToUserEmail,
        entity.summary,
        entity.durationSeconds,
        entity.pbxCallId ?? null,
        entity.createdAt
      )
      .run();

    return entity;
  }

  async listRecent(limit = 20): Promise<CallLogEntity[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM call_logs ORDER BY created_at DESC LIMIT ?;`)
      .bind(limit)
      .all<any>();

    return (results ?? []).map((r) => ({
      id: r.id,
      callerNumber: r.caller_number,
      callerName: r.caller_name ?? undefined,
      direction: r.direction,
      routedToUserEmail: r.routed_to_user_email,
      summary: r.summary,
      durationSeconds: r.duration_seconds,
      pbxCallId: r.pbx_call_id ?? undefined,
      createdAt: r.created_at,
    }));
  }
}

