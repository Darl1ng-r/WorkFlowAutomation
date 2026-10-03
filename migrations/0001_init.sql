-- ==============================================================================
-- Office OS Database Migration 0001: Initial Schema (D1 / SQLite)
-- ==============================================================================

-- 1. Sequence Counters (for atomic gapless reference numbering)
CREATE TABLE IF NOT EXISTS sequence_counters (
  direction TEXT NOT NULL CHECK(direction IN ('IN', 'OUT')),
  year INTEGER NOT NULL,
  current_val INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (direction, year)
);

-- 2. Correspondence Register
CREATE TABLE IF NOT EXISTS correspondence (
  id TEXT PRIMARY KEY,
  ref_no TEXT NOT NULL UNIQUE,
  direction TEXT NOT NULL CHECK(direction IN ('IN', 'OUT')),
  channel TEXT NOT NULL CHECK(channel IN ('EMAIL', 'SCAN', 'PHONE', 'VISIT', 'UPLOAD')),
  subject TEXT NOT NULL,
  source_sender TEXT,
  recipient TEXT,
  organization_id TEXT,
  owner_user_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('RECEIVED', 'EXTRACTED', 'PENDING_APPROVAL', 'APPROVED', 'FILED', 'REJECTED')),
  classification TEXT NOT NULL CHECK(classification IN ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED')),
  physical_location TEXT,
  due_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_correspondence_ref_no ON correspondence(ref_no);
CREATE INDEX IF NOT EXISTS idx_correspondence_status ON correspondence(status);
CREATE INDEX IF NOT EXISTS idx_correspondence_created_at ON correspondence(created_at);

-- 3. Ingested Documents & Vault Metadata
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  correspondence_id TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE,
  vault_uri TEXT NOT NULL,
  drive_file_id TEXT,
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  classification TEXT NOT NULL CHECK(classification IN ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (correspondence_id) REFERENCES correspondence(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_documents_sha256 ON documents(sha256);
CREATE INDEX IF NOT EXISTS idx_documents_correspondence_id ON documents(correspondence_id);

-- 4. AI Structured Extractions
CREATE TABLE IF NOT EXISTS extractions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  model TEXT NOT NULL,
  confidence REAL NOT NULL,
  fields_json TEXT NOT NULL,
  anomalies_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_extractions_document_id ON extractions(document_id);

-- 5. Invoices & Receipts
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  correspondence_id TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  tax_id TEXT,
  invoice_no TEXT NOT NULL,
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  net_amount REAL NOT NULL,
  tax_amount REAL NOT NULL,
  total_amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SAR',
  accounting_ref TEXT,
  status TEXT NOT NULL CHECK(status IN ('DRAFT_PENDING', 'APPROVED', 'REJECTED', 'SYNCED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (correspondence_id) REFERENCES correspondence(id) ON DELETE CASCADE,
  UNIQUE (vendor_name, invoice_no)
);

CREATE INDEX IF NOT EXISTS idx_invoices_vendor_invoice ON invoices(vendor_name, invoice_no);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- 6. Asset & Compliance Obligations (Renewals)
CREATE TABLE IF NOT EXISTS obligations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  asset_identifier TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('INSURANCE', 'VEHICLE_REGISTRATION', 'BUILDING_REGISTRATION', 'TRADE_LICENCE', 'EQUIPMENT_PERMIT')),
  reference_no TEXT NOT NULL,
  issuer TEXT NOT NULL,
  expires_on TEXT NOT NULL,
  lead_days INTEGER NOT NULL DEFAULT 30,
  owner_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'RENEWED')),
  last_reminder_sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_obligations_expires_on ON obligations(expires_on);
CREATE INDEX IF NOT EXISTS idx_obligations_status ON obligations(status);

-- 7. Front Desk Visitors
CREATE TABLE IF NOT EXISTS visitors (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  company TEXT,
  email TEXT,
  phone TEXT,
  host_employee_email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  badge_number TEXT NOT NULL,
  nda_signed INTEGER NOT NULL DEFAULT 0,
  checked_in_at TEXT NOT NULL DEFAULT (datetime('now')),
  checked_out_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_visitors_checked_in ON visitors(checked_in_at);
CREATE INDEX IF NOT EXISTS idx_visitors_checked_out ON visitors(checked_out_at);

-- 8. Front Desk Call Logs
CREATE TABLE IF NOT EXISTS call_logs (
  id TEXT PRIMARY KEY,
  caller_number TEXT NOT NULL,
  caller_name TEXT,
  direction TEXT NOT NULL CHECK(direction IN ('INBOUND', 'OUTBOUND')),
  routed_to_user_email TEXT NOT NULL,
  summary TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  pbx_call_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_call_logs_created_at ON call_logs(created_at);

-- 9. Human-in-the-Loop Approvals
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  workflow_run_id TEXT NOT NULL,
  target_entity_type TEXT NOT NULL CHECK(target_entity_type IN ('INVOICE', 'CORRESPONDENCE', 'OBLIGATION', 'OUTBOUND_LETTER')),
  target_entity_id TEXT NOT NULL,
  proposed_action TEXT NOT NULL,
  proposed_payload_json TEXT NOT NULL,
  human_diff_json TEXT,
  decision TEXT NOT NULL CHECK(decision IN ('APPROVED', 'MODIFIED', 'REJECTED')),
  decided_by_email TEXT,
  notes TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_approvals_decision ON approvals(decision);
CREATE INDEX IF NOT EXISTS idx_approvals_workflow ON approvals(workflow_run_id);

-- 10. Hash-Chained Audit Log
CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_email TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('USER', 'AGENT', 'SYSTEM')),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_occurred_at ON audit_events(occurred_at);
