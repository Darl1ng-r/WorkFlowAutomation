-- ==============================================================================
-- Office OS Database Migration 0003: Core Remediations & Persistence
-- ==============================================================================

-- 1. Room Bookings Persistent Table
CREATE TABLE IF NOT EXISTS room_bookings (
  id TEXT PRIMARY KEY,
  room_name TEXT NOT NULL CHECK(room_name IN ('Board', 'Sync', 'Huddle', 'Interview')),
  time_slot TEXT NOT NULL,
  title TEXT NOT NULL,
  host_name TEXT NOT NULL DEFAULT 'Office Team',
  source TEXT NOT NULL DEFAULT 'OFFICE_OS',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_room_bookings_slot ON room_bookings(room_name, time_slot);

-- 2. Inventory & Supplies Persistent Table
CREATE TABLE IF NOT EXISTS supplies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('PRINTING', 'PANTRY', 'IT_ACCESSORY', 'CLEANING', 'STATIONERY')),
  current_stock INTEGER NOT NULL DEFAULT 0,
  par_level INTEGER NOT NULL DEFAULT 1,
  unit TEXT NOT NULL,
  supplier TEXT NOT NULL,
  unit_price REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SAR',
  status TEXT NOT NULL CHECK(status IN ('OK', 'LOW_STOCK', 'REORDER_TRIGGERED')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_supplies_status ON supplies(status);

-- Seed initial supplies if table is empty
INSERT OR IGNORE INTO supplies (id, name, category, current_stock, par_level, unit, supplier, unit_price, currency, status, updated_at)
VALUES 
  ('sup-001', 'A4 High-White Copy Paper (80gsm)', 'PRINTING', 6, 4, 'Cartons (5 reams)', 'Office Depot Saudi', 120.0, 'SAR', 'OK', datetime('now')),
  ('sup-002', 'Arabica Blend Espresso Whole Beans', 'PANTRY', 2, 3, '1kg Bags', 'Specialty Bean Roasters', 95.0, 'SAR', 'LOW_STOCK', datetime('now')),
  ('sup-003', 'HP LaserJet Enterprise Black Toner (W9004MC)', 'PRINTING', 1, 2, 'Cartridges', 'Saudi Xerox & HP Solutions', 420.0, 'SAR', 'LOW_STOCK', datetime('now')),
  ('sup-004', 'Anker USB-C Multiport 7-in-1 Hub', 'IT_ACCESSORY', 4, 2, 'Units', 'Jarir Bookstore Corporate', 185.0, 'SAR', 'OK', datetime('now'));

-- 3. Upgrade Approvals Table to include PENDING decision and SUPPLY_REORDER entity type
-- In SQLite, we create a replacement table and migrate existing records
CREATE TABLE IF NOT EXISTS approvals_new (
  id TEXT PRIMARY KEY,
  workflow_run_id TEXT NOT NULL,
  target_entity_type TEXT NOT NULL CHECK(target_entity_type IN ('INVOICE', 'CORRESPONDENCE', 'OBLIGATION', 'OUTBOUND_LETTER', 'SUPPLY_REORDER')),
  target_entity_id TEXT NOT NULL,
  proposed_action TEXT NOT NULL,
  proposed_payload_json TEXT NOT NULL,
  human_diff_json TEXT,
  decision TEXT NOT NULL CHECK(decision IN ('PENDING', 'APPROVED', 'MODIFIED', 'REJECTED')),
  decided_by_email TEXT,
  notes TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO approvals_new (id, workflow_run_id, target_entity_type, target_entity_id, proposed_action, proposed_payload_json, human_diff_json, decision, decided_by_email, notes, decided_at, created_at)
SELECT 
  id, workflow_run_id, target_entity_type, target_entity_id, proposed_action, proposed_payload_json, human_diff_json, 
  CASE WHEN decided_at IS NULL THEN 'PENDING' ELSE decision END,
  decided_by_email, notes, decided_at, created_at
FROM approvals;

DROP TABLE IF EXISTS approvals;
ALTER TABLE approvals_new RENAME TO approvals;

CREATE INDEX IF NOT EXISTS idx_approvals_decision ON approvals(decision);
CREATE INDEX IF NOT EXISTS idx_approvals_workflow ON approvals(workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_approvals_target ON approvals(target_entity_type, target_entity_id);

-- 4. Cryptographic Hash-Chain Support in audit_events
-- Ensure chain_hash column exists to detect intermediate tampering
-- (D1 allows ALTER TABLE ADD COLUMN)
-- We track both payload_hash (hash of event) and chain_hash = sha256(prev_chain_hash || payload_hash)
