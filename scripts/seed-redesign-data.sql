-- Seed Obligations
INSERT OR REPLACE INTO obligations (
  id, title, asset_identifier, kind, reference_no, issuer,
  expires_on, lead_days, owner_email, status, last_reminder_sent_at, created_at, updated_at
) VALUES 
(
  'ob-comm-reg-2026',
  'Commercial registration',
  'HQ-CR-1010992',
  'TRADE_LICENCE',
  'CR-902188',
  'Ministry of Commerce',
  date('now', '+9 days'),
  30,
  'compliance@company.com',
  'EXPIRING_SOON',
  datetime('now', '-2 days'),
  datetime('now', '-300 days'),
  datetime('now')
),
(
  'ob-insurance-2026',
  'Office insurance',
  'HQ-BLD-INS-01',
  'INSURANCE',
  'POL-8829-X',
  'Reminder set for 30d',
  date('now', '+41 days'),
  30,
  'operations@company.com',
  'ACTIVE',
  NULL,
  datetime('now', '-320 days'),
  datetime('now')
);

-- Seed Initial Approvals for "Needs your call"
INSERT OR REPLACE INTO approvals (
  id, workflow_run_id, target_entity_type, target_entity_id,
  proposed_action, proposed_payload_json, decision, decided_at, created_at
) VALUES 
(
  'app-tax-01',
  'wf-intake-tax-notice',
  'OUTBOUND_LETTER',
  'corr-tax-notice',
  'DISPATCH_OFFICIAL_RESPONSE',
  '{"refNo":"IN-2026-000003","subject":"Municipality Tax Notice 2026","from":"Greater Amman Municipality","shelf":"Cabinet 2, Shelf B suggested","draftedReply":"Formal acknowledgement of receipt and tax schedule commitment ref #GAM-992.","confidenceScore":0.97,"notes":"AI drafted response based on municipal compliance playbook."}',
  'APPROVED',
  NULL,
  datetime('now', '-25 minutes')
),
(
  'app-inv-01',
  'wf-inv-apex-89',
  'INVOICE',
  'inv-apex-89',
  'AUTHORIZE_PAYMENT_RELEASE',
  '{"invoiceNo":"INV-2026-89","vendorName":"Apex Global Consultancy Services","totalAmount":1450.00,"currency":"SAR","dueDate":"2026-10-16","poMatched":"PO #8831","notes":"0% variance detected against agreed master services agreement."}',
  'APPROVED',
  NULL,
  datetime('now', '-45 minutes')
),
(
  'app-lease-01',
  'wf-lease-amend',
  'CORRESPONDENCE',
  '51735638-bd92-4708-82e4-def65c33cf9b',
  'CLASSIFY_RESTRICTED_AND_FILE',
  '{"refNo":"IN-2026-000002","subject":"Building Lease Agreement Amendment 2026","from":"Al-Rajhi Real Estate","shelf":"Safe Box 4","notes":"Confidential legal document requiring executive physical placement sign-off."}',
  'APPROVED',
  NULL,
  datetime('now', '-2 hours')
);
